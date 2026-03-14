import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { inferRegionFromText, regionLabelToKey } from "@/domain/regionUtils";

export const runtime = "nodejs";
export const maxDuration = 30;

/** 輕量 JWT payload decode（不驗簽章，但確認 email domain 與 expiry）
 *  足以防止未登入的外部人員呼叫此 API。
 *  若需完整驗簽，請改用 firebase-admin。
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function verifyFirebaseToken(authHeader: string | null): { ok: boolean; reason?: string } {
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, reason: "缺少 Authorization header" };
  const token = authHeader.slice(7);
  const payload = decodeJwtPayload(token);
  if (!payload) return { ok: false, reason: "無效的 token 格式" };
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp < Date.now() / 1000) return { ok: false, reason: "token 已過期" };
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!/@premtek\.com\.tw$/i.test(email)) return { ok: false, reason: "不允許的帳號網域" };
  return { ok: true };
}

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB 上限

/** Convert any Excel date value to "YYYY-MM-DD" string */
function xlsxDateToString(val: unknown): string {
  if (!val) return "";

  // JS Date (cellDates: true)
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Excel numeric serial (fallback)
  if (typeof val === "number" && val > 25569) {
    const ms = (val - 25569) * 86400 * 1000;
    const dt = new Date(ms);
    if (!isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const dy = String(dt.getUTCDate()).padStart(2, "0");
      return `${y}-${mo}-${dy}`;
    }
  }

  // "YYYY-MM-DD" or "YYYY/MM/DD"
  if (typeof val === "string" && /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(val)) {
    return val.replace(/\//g, "-").slice(0, 10);
  }

  return "";
}

export async function POST(req: NextRequest) {
  try {
    // ── 身份驗證 ────────────────────────────────────────────────────
    const authCheck = verifyFirebaseToken(req.headers.get("authorization"));
    if (!authCheck.ok) {
      return NextResponse.json({ error: `未授權：${authCheck.reason}` }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未收到檔案" }, { status: 400 });
    }

    // ── 檔案大小限制 ─────────────────────────────────────────────────
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `檔案過大（上限 5 MB）` }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls"].includes(ext ?? "")) {
      return NextResponse.json({ error: "請上傳 .xlsx 或 .xls 檔案" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Parse as array-of-arrays to get raw row data
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (!raw || raw.length < 2) {
      return NextResponse.json({ error: "Excel 檔案沒有資料列" }, { status: 400 });
    }

    const header = (raw[0] as unknown[]).map((h) => String(h ?? "").trim());

    const REQUIRED_COLS = {
      productName: "產品名稱",
      serialNo:    "產品序號",
      customer:    "訂單來源公司名稱",
      estShip:     "預計出貨日",
      estInstall:  "預計安裝日",
      actInstall:  "實際安裝日期",
      actAccept:   "驗收完成日期",
      engineer:    "服務人員名稱",
    } as const;

    const COL: Record<string, number> = {};
    for (const [key, colName] of Object.entries(REQUIRED_COLS)) {
      COL[key] = header.indexOf(colName);
    }

    // Optional: 地區欄位（多種可能欄名）
    const REGION_COL_NAMES = ["地區", "區域", "region", "Region"];
    const regionColIdx = REGION_COL_NAMES.map(n => header.indexOf(n)).find(i => i !== -1) ?? -1;

    const missing = Object.entries(REQUIRED_COLS)
      .filter(([key]) => COL[key] === -1)
      .map(([, colName]) => colName);

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `找不到欄位：${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const rows: Array<Record<string, unknown>> = [];

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i] as unknown[];
      if (!row || row.every((c) => !c)) continue;

      const productName = String(row[COL.productName] ?? "").trim();
      const serialNo    = String(row[COL.serialNo]    ?? "").trim();
      const customer    = String(row[COL.customer]    ?? "").trim();
      const estArrival  = xlsxDateToString(row[COL.estShip]);
      const estComplete = xlsxDateToString(row[COL.estInstall]);
      const actArrival  = xlsxDateToString(row[COL.actInstall]);
      const actComplete = xlsxDateToString(row[COL.actAccept]);
      const engineer    = String(row[COL.engineer]    ?? "").trim();

      // Region inference: 1) 地區欄位 → 2) 客戶名稱關鍵字 → 3) null (前端再推斷)
      let region: string | null = null;
      if (regionColIdx !== -1) {
        const regionCell = String(row[regionColIdx] ?? "").trim();
        region = regionLabelToKey(regionCell) ?? inferRegionFromText(regionCell);
      }
      if (!region) {
        region = inferRegionFromText(customer);
      }
      // null means "let client-side inferRegion() decide based on customerRegionMap"

      const warnings: string[] = [];
      if (!productName) warnings.push("缺少產品名稱");
      if (!customer)    warnings.push("缺少客戶名稱");

      const name = [productName, serialNo ? `#${serialNo}` : ""].filter(Boolean).join(" ");

      rows.push({
        _rowNum: i + 1,
        _productName: productName,
        _serialNo: serialNo,
        name: name || `匯入列 ${i}`,
        customer,
        engineer,
        region,   // null = let client decide; "north"/"central"/"south" = pre-determined
        estArrival:  estArrival  || null,
        estComplete: estComplete || null,
        actArrival:  actArrival  || null,
        actComplete: actComplete || null,
        ...(warnings.length ? { _warn: warnings.join("; ") } : {}),
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "沒有找到有效的資料列" }, { status: 400 });
    }

    return NextResponse.json({ rows, totalRows: rows.length });
  } catch (err) {
    console.error("[parse-excel] error:", err);
    return NextResponse.json(
      { error: `解析失敗：${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
