"use client";

import { useRef, useState } from "react";
import { Modal } from "@/features/ui/Modal";
import { createEquipment, listExistingEquipmentSerialKeys } from "@/features/data/equipments";
import type { EquipmentMainStatus, RegionKey } from "@/domain/types";
import { EQUIPMENT_MAIN_STATUSES, REGIONS } from "@/domain/constants";
import { buildEquipmentPayload, cleanModelName, excelDateToString, getWorkbookFileValidationError, readWorkbookJsonRows } from "@/domain/importRules";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** 依日期推斷設備主狀態 */
function inferStatus(actInstall: string, actAccept: string): EquipmentMainStatus {
  if (actAccept)   return "正式生產中";
  if (actInstall)  return "試產";
  return "裝機";
}

// ─── types ───────────────────────────────────────────────────────────────────

type RawRow = {
  serialNo:    string;
  modelCode:   string;
  customer:    string;
  estArrival:  string;   // 預計出貨日
  estInstall:  string;   // 預計安裝日
  actInstall:  string;   // 實際安裝日期
  actAccept:   string;   // 驗收完成日期
  engineer:    string;
};

type PreviewRow = RawRow & {
  _idx:          number;
  _region:       RegionKey;
  _regionMatched: boolean;
  _status:       EquipmentMainStatus;
  _selected:     boolean;
};

// ─── Column mapping ──────────────────────────────────────────────────────────

type ColKey = keyof RawRow;

const COL_MAP: Record<string, ColKey> = {
  "產品序號":        "serialNo",
  "產品名稱":        "modelCode",
  "訂單來源公司名稱": "customer",
  "預計出貨日":       "estArrival",
  "預計安裝日":       "estInstall",
  "實際安裝日期":     "actInstall",
  "驗收完成日期":     "actAccept",
  "服務人員名稱":     "engineer",
};

const DATE_FIELDS = new Set<ColKey>(["estArrival", "estInstall", "actInstall", "actAccept"]);

function parseSheet(data: Array<Record<string, unknown>>): RawRow[] {
  return data.map((rowObj) => {
    const out: Record<ColKey, string> = {
      serialNo: "", modelCode: "", customer: "",
      estArrival: "", estInstall: "", actInstall: "", actAccept: "", engineer: "",
    };
    for (const [col, field] of Object.entries(COL_MAP)) {
      const val = rowObj[col];
      out[field] = DATE_FIELDS.has(field)
        ? excelDateToString(val)
        : typeof val === "string" ? val.trim() : String(val ?? "").trim();
    }
    return {
      serialNo:   out.serialNo,
      modelCode:  cleanModelName(out.modelCode),
      customer:   out.customer,
      estArrival: out.estArrival,
      estInstall: out.estInstall,
      actInstall: out.actInstall,
      actAccept:  out.actAccept,
      engineer:   out.engineer,
    };
  }).filter((r) => r.customer.length > 0 || r.modelCode.length > 0);
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: (count: number) => void;
  customerRegionMap?: Record<string, RegionKey>;
};

export function ImportEquipmentModal({ open, onClose, onImported, customerRegionMap = {} }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]         = useState<PreviewRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [importing, setImporting] = useState(false);
  const [done, setDone]         = useState<number | null>(null);

  function reset() {
    setRows([]); setError(""); setLoading(false); setImporting(false); setDone(null);
  }
  function handleClose() { reset(); onClose(); }

  function handleFile(file: File) {
    if (!file) return;
    const fileError = getWorkbookFileValidationError(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setError(""); setLoading(true); setRows([]); setDone(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setError("讀取 Excel 檔案失敗，請重新選擇檔案後再試");
      setLoading(false);
    };
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!(data instanceof ArrayBuffer)) throw new Error("讀取 Excel 檔案失敗");
        const jsonRows = await readWorkbookJsonRows(data);
        const parsed = parseSheet(jsonRows);
        if (parsed.length === 0) {
          setError("找不到有效資料列，請確認欄位名稱符合範本格式。");
          setLoading(false); return;
        }
        const preview: PreviewRow[] = parsed.map((r, i) => {
          const mappedRegion = customerRegionMap[r.customer];
          return {
            ...r,
            _idx:          i,
            _region:       mappedRegion ?? "north",
            _regionMatched: mappedRegion !== undefined,
            _status:       inferStatus(r.actInstall, r.actAccept),
            _selected:     r.serialNo.length > 0,   // 預設只選有序號的
          };
        });
        setRows(preview);
      } catch {
        setError("解析 Excel 失敗，請確認檔案格式正確。");
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function toggleRow(idx: number) {
    setRows((prev) => prev.map((r) => r._idx === idx ? { ...r, _selected: !r._selected } : r));
  }
  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, _selected: checked })));
  }
  function setRowRegion(idx: number, region: RegionKey) {
    setRows((prev) => prev.map((r) => r._idx === idx ? { ...r, _region: region, _regionMatched: true } : r));
  }
  function setRowStatus(idx: number, status: EquipmentMainStatus) {
    setRows((prev) => prev.map((r) => r._idx === idx ? { ...r, _status: status } : r));
  }

  const selectedRows   = rows.filter((r) => r._selected);
  const allSelected    = rows.length > 0 && rows.every((r) => r._selected);
  const someSelected   = rows.some((r) => r._selected) && !allSelected;
  const unmatchedCount = rows.filter((r) => r._selected && !r._regionMatched).length;
  const noSerialCount  = rows.filter((r) => r._selected && !r.serialNo).length;

  async function handleImport() {
    if (selectedRows.length === 0) return;
    setImporting(true); setError("");
    let count = 0;
    let skippedDuplicates = 0;
    const errors: string[] = [];
    const selectedSerials = selectedRows.map((r) => r.serialNo.trim()).filter(Boolean);
    const existingSerials = await listExistingEquipmentSerialKeys(selectedSerials);
    const importedSerials = new Set<string>();
    for (const r of selectedRows) {
      try {
        const serialNo = r.serialNo.trim();
        if (!serialNo) {
          errors.push(`第 ${r._idx + 1} 筆：設備台帳缺少機台序號`);
          continue;
        }

        if (existingSerials.has(serialNo) || importedSerials.has(serialNo)) {
          skippedDuplicates += 1;
          continue;
        }

        if (!r.customer.trim()) {
          errors.push(`第 ${r._idx + 1} 筆：客戶不可空白`);
          continue;
        }
        if (!r.modelCode.trim()) {
          errors.push(`第 ${r._idx + 1} 筆：機型不可空白`);
          continue;
        }

        const payload = buildEquipmentPayload(
          {
            serialNo,
            modelCode: r.modelCode,
            customer: r.customer,
            estArrival: r.estArrival,
            estComplete: r.estInstall,
            actArrival: r.actInstall,
            actComplete: r.actAccept,
            engineer: r.engineer,
          },
          r._region,
          { statusMain: r._status },
        );
        await createEquipment(payload);
        importedSerials.add(serialNo);
        count++;
      } catch (err) {
        errors.push(`第 ${r._idx + 1} 筆：${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setImporting(false);
    if (errors.length > 0) {
      setError(`已匯入 ${count} 筆，略過重複 ${skippedDuplicates} 筆，${errors.length} 筆失敗：${errors.slice(0, 3).join("；")}${errors.length > 3 ? "…" : ""}`);
    } else if (count > 0 || skippedDuplicates > 0) {
      setDone(count);
      onImported?.(count);
    }
  }

  if (!open) return null;

  return (
    <Modal title="Excel 批次匯入設備台帳" open={open} onClose={handleClose} width={rows.length > 0 ? 1100 : 560}>
      {done !== null ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>匯入完成</div>
          <div style={{ color: "var(--muted-foreground)", marginBottom: 24 }}>
            成功新增 <strong>{done}</strong> 筆設備台帳（重複序號已自動略過）
          </div>
          <button className="btn btnAccent" onClick={handleClose}>關閉</button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{
              border: "2px dashed var(--border)", borderRadius: 10,
              padding: "48px 24px", textAlign: "center", cursor: "pointer",
              background: "var(--muted)/30",
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              拖曳或點擊上傳 Excel 檔案
            </div>
            <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
              支援 .xlsx（欄位需含：產品序號、產品名稱、訂單來源公司名稱、實際安裝日期、驗收完成日期、服務人員名稱）
            </div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={onFileChange} />
          </div>

          {loading && <div style={{ textAlign: "center", color: "var(--muted-foreground)" }}>解析中…</div>}
          {error && <div style={{ color: "var(--destructive)", fontSize: 13, padding: "8px 12px", background: "color-mix(in oklab, var(--destructive) 12%, transparent)", borderRadius: 6 }}>{error}</div>}

          <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.8 }}>
            <strong>自動判斷狀態規則：</strong><br />
            驗收完成日 有填 → 正式生產中 ／ 僅實際安裝日 有填 → 試產 ／ 兩者皆空 → 裝機
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
              共解析 <strong>{rows.length}</strong> 筆，已選 <strong>{selectedRows.length}</strong> 筆
            </div>
            <button className="btn btnSmall" onClick={reset} style={{ fontSize: 12 }}>重新上傳</button>
          </div>

          {error && <div style={{ color: "var(--destructive)", fontSize: 13, padding: "8px 12px", background: "color-mix(in oklab, var(--destructive) 12%, transparent)", borderRadius: 6 }}>{error}</div>}

          {unmatchedCount > 0 && (
            <div style={{ fontSize: 12, padding: "8px 12px", background: "color-mix(in oklab, #f59e0b 12%, transparent)", borderRadius: 6, color: "#92400e", border: "1px solid #f59e0b44" }}>
              ⚠ <strong>{unmatchedCount} 筆</strong>客戶未在客戶設定中找到，區域預設為北區（橘色標示）。
              可在下方手動調整，或至「管理 → 客戶清單設定」新增客戶對照。
            </div>
          )}

          {noSerialCount > 0 && (
            <div style={{ fontSize: 12, padding: "8px 12px", background: "color-mix(in oklab, #3b82f6 10%, transparent)", borderRadius: 6, color: "#1e40af", border: "1px solid #3b82f644" }}>
              ℹ <strong>{noSerialCount} 筆</strong>無產品序號（預設不勾選）。設備台帳必須有序號，請先補齊 Excel 後再匯入。
            </div>
          )}

          <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--muted)", position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={thStyle}>
                    <input type="checkbox" checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={(e) => toggleAll(e.target.checked)} />
                  </th>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>序號</th>
                  <th style={thStyle}>型號</th>
                  <th style={thStyle}>客戶</th>
                  <th style={thStyle}>工程師</th>
                  <th style={thStyle}>區域</th>
                  <th style={thStyle}>狀態</th>
                  <th style={thStyle}>實際安裝</th>
                  <th style={thStyle}>驗收完成</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._idx} style={{
                    background: r._selected ? undefined : "var(--muted)/40",
                    opacity: r._selected ? 1 : 0.45,
                    borderTop: "1px solid var(--border)",
                  }}>
                    <td style={tdStyle}><input type="checkbox" checked={r._selected} onChange={() => toggleRow(r._idx)} /></td>
                    <td style={{ ...tdStyle, color: "var(--muted-foreground)" }}>{r._idx + 1}</td>
                    <td style={{
                      ...tdStyle, fontWeight: 700,
                      background: !r.serialNo ? "color-mix(in oklab, #3b82f6 12%, transparent)" : undefined,
                    }}>
                      {r.serialNo || <span style={{ color: "var(--muted-foreground)", fontWeight: 400, fontStyle: "italic" }}>（自動）</span>}
                    </td>
                    <td style={tdStyle}>{r.modelCode}</td>
                    <td style={{ ...tdStyle, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.customer}>{r.customer}</td>
                    <td style={tdStyle}>{r.engineer}</td>
                    <td style={{
                      ...tdStyle,
                      background: !r._regionMatched ? "color-mix(in oklab, #f59e0b 18%, transparent)" : undefined,
                    }}>
                      <select value={r._region} onChange={(e) => setRowRegion(r._idx, e.target.value as RegionKey)}
                        style={{ fontSize: 12, padding: "2px 4px", minWidth: 60, border: !r._regionMatched ? "1px solid #f59e0b" : undefined }}>
                        {(Object.entries(REGIONS) as [RegionKey, { label: string }][]).map(([key, rg]) => (
                          <option key={key} value={key}>{rg.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select value={r._status} onChange={(e) => setRowStatus(r._idx, e.target.value as EquipmentMainStatus)}
                        style={{ fontSize: 12, padding: "2px 4px", minWidth: 90 }}>
                        {EQUIPMENT_MAIN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>{r.actInstall || "—"}</td>
                    <td style={tdStyle}>{r.actAccept  || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button className="btn" onClick={handleClose} disabled={importing}>取消</button>
            <button className="btn btnAccent" onClick={handleImport} disabled={importing || selectedRows.length === 0}>
              {importing ? `匯入中… (${selectedRows.length} 筆)` : `匯入 ${selectedRows.length} 筆至設備台帳`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "8px 10px", textAlign: "left", fontWeight: 600,
  whiteSpace: "nowrap", borderRight: "1px solid var(--border)",
};
const tdStyle: React.CSSProperties = {
  padding: "6px 10px", whiteSpace: "nowrap", borderRight: "1px solid var(--border)",
};
