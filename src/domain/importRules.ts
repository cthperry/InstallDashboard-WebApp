import type { Equipment, EquipmentMainStatus, ImportConfigDoc, ImportFieldKey, Installation, MachineModel, PhaseKey, RegionKey } from "@/domain/types";
import { DEFAULT_MACHINE_MODELS } from "@/domain/constants";
import { resolveInstallationPhase, resolveInstallationProgress, shouldTransferInstallationToEquipment } from "@/domain/installPhase";
import { buildEquipmentMilestonesFromInstallationDates } from "@/domain/equipmentMilestones";
import { cleanMachineModelName, canonicalizeMachineModelCode } from "@/domain/machineModels";
import { toDisplayShortName } from "@/domain/personDisplay";
import { getInstallationValidationIssues } from "@/domain/installationContract";
import { normalizeInstallationSerialCandidate } from "@/domain/installationDisplay";
import { isDateYmd, normalizeCompactKey } from "@/lib/utils";

export type WorkbookRow = {
  serialNo: string;
  modelCode: string;
  customer: string;
  estArrival: string;
  estComplete: string;
  actArrival: string;
  actComplete: string;
  engineer: string;
};

export type ImportTarget = "installation" | "equipment";

export type ParsedWorkbookRow = WorkbookRow & {
  rowIndex: number;
  target: ImportTarget;
};

export type InstallationPayloadOverrides = {
  phase?: PhaseKey;
  progress?: number;
};

export type EquipmentPayloadOverrides = {
  statusMain?: EquipmentMainStatus;
};

export const DEFAULT_IMPORT_COLUMN_ALIASES: Record<ImportFieldKey, string[]> = {
  serialNo: ["產品序號", "機台序號", "Serial No", "SerialNo", "SN"],
  modelCode: ["產品名稱", "機型", "Model", "Model Code"],
  customer: ["訂單來源公司名稱", "客戶", "Customer", "Customer Name"],
  estArrival: ["預計出貨日", "預計到廠日", "ETA Ship", "Est Arrival"],
  estComplete: ["預計安裝日", "預計完成日", "Est Complete", "Install ETA"],
  actArrival: ["實際安裝日期", "實際到廠日", "Actual Arrival", "Install Start"],
  actComplete: ["驗收完成日期", "實際完成日", "Actual Complete", "Acceptance Date"],
  engineer: ["服務人員名稱", "工程師", "Engineer", "Owner"],
};

const DATE_FIELDS = new Set<keyof WorkbookRow>(["estArrival", "estComplete", "actArrival", "actComplete"]);
export const MAX_EXCEL_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_WORKBOOK_JSON_ROWS = 1200;
const ALLOWED_EXCEL_EXTENSIONS = new Set([".xlsx"]);

export function getWorkbookFileValidationError(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  const allowed = Array.from(ALLOWED_EXCEL_EXTENSIONS).some((ext) => lowerName.endsWith(ext));
  if (!allowed) return "僅支援 .xlsx 檔案";
  if (file.size > MAX_EXCEL_FILE_BYTES) return `Excel 檔案不可超過 ${Math.floor(MAX_EXCEL_FILE_BYTES / 1024 / 1024)}MB`;
  return null;
}

export function limitWorkbookJsonRows<T>(rows: T[]): T[] {
  if (rows.length > MAX_WORKBOOK_JSON_ROWS) {
    throw new Error(`Excel 資料列不可超過 ${MAX_WORKBOOK_JSON_ROWS} 筆，請拆批匯入`);
  }
  return rows;
}

function normalizeCellValue(value: unknown): unknown {
  if (value == null) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if ("result" in record) return normalizeCellValue(record.result);
  if ("text" in record && typeof record.text === "string") return record.text;
  if ("richText" in record && Array.isArray(record.richText)) {
    return record.richText
      .map((part) => typeof part === "object" && part && "text" in part ? String((part as { text?: unknown }).text ?? "") : "")
      .join("");
  }
  return String(value);
}

export async function readWorkbookJsonRows(data: ArrayBuffer): Promise<Array<Record<string, unknown>>> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = String(normalizeCellValue(cell.value) ?? "").trim();
    if (header) headers[colNumber] = header;
  });

  const rows: Array<Record<string, unknown>> = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const out: Record<string, unknown> = {};
    for (let colNumber = 1; colNumber < headers.length; colNumber += 1) {
      const header = headers[colNumber];
      if (!header) continue;
      out[header] = normalizeCellValue(row.getCell(colNumber).value);
    }
    rows.push(out);
  });

  return limitWorkbookJsonRows(rows);
}

function parseLooseDateString(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const normalized = trimmed
    .replace(/[./]/g, "-")
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function excelDateToString(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "string") {
    const parsed = parseLooseDateString(raw);
    return isDateYmd(parsed) ? parsed : "";
  }
  if (typeof raw === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const value = new Date(excelEpoch.getTime() + raw * 86400000);
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return "";
}

export function cleanModelName(raw: string, models: readonly MachineModel[] = DEFAULT_MACHINE_MODELS): string {
  return canonicalizeMachineModelCode(cleanMachineModelName(raw), models);
}

function cleanSerialNo(raw: unknown, modelCode: unknown): string {
  return normalizeInstallationSerialCandidate(raw, modelCode);
}

function normalizeHeaderKey(value: unknown): string {
  return normalizeCompactKey(value);
}

function buildHeaderFieldMap(config?: ImportConfigDoc | null): Map<string, keyof WorkbookRow> {
  const map = new Map<string, keyof WorkbookRow>();
  for (const [field, headers] of Object.entries(DEFAULT_IMPORT_COLUMN_ALIASES) as Array<[keyof WorkbookRow, string[]]>) {
    for (const header of headers) {
      const key = normalizeHeaderKey(header);
      if (key) map.set(key, field);
    }
  }
  for (const entry of config?.columnAliases ?? []) {
    for (const header of entry.headers ?? []) {
      const key = normalizeHeaderKey(header);
      if (key) map.set(key, entry.field);
    }
  }
  return map;
}

function resolveConfiguredCustomerName(raw: string, config?: ImportConfigDoc | null): string {
  const key = normalizeCompactKey(raw);
  if (!key) return "";
  const match = (config?.customerAliases ?? []).find((entry) => normalizeCompactKey(entry.alias) === key);
  return match?.customer?.trim() || raw.trim();
}

function resolveConfiguredMachineModel(raw: string, config?: ImportConfigDoc | null): string {
  const key = normalizeCompactKey(raw);
  if (!key) return "";
  const match = (config?.machineModelAliases ?? []).find((entry) => normalizeCompactKey(entry.alias) === key);
  return match?.modelCode?.trim() || raw.trim();
}

export function resolveWorkbookImportDisposition(row: WorkbookRow, phaseOverride?: PhaseKey, now: Date = new Date()) {
  const phase = phaseOverride ?? resolveInstallationPhase(row, now);
  const progress = resolveInstallationProgress(phase);
  const transferToEquipment = shouldTransferInstallationToEquipment({
    phase,
    name: cleanSerialNo(row.serialNo, row.modelCode),
  });

  return {
    phase,
    progress,
    transferToEquipment,
    keepInstallation: !transferToEquipment,
  };
}

export function shouldCreateEquipmentFromRow(row: WorkbookRow, phaseOverride?: PhaseKey): boolean {
  return resolveWorkbookImportDisposition(row, phaseOverride).transferToEquipment;
}

export function classifyImportTarget(row: WorkbookRow, phaseOverride?: PhaseKey): ImportTarget {
  return shouldCreateEquipmentFromRow(row, phaseOverride) ? "equipment" : "installation";
}

export function buildWorkbookInstallationImportKey(row: WorkbookRow, sourceRowIndex: number): string {
  const serialKey = normalizeCompactKey(cleanSerialNo(row.serialNo, row.modelCode));
  if (serialKey) return `serial:${serialKey}`;

  const customerKey = normalizeCompactKey(row.customer);
  const modelKey = normalizeCompactKey(row.modelCode);
  const engineerKey = normalizeCompactKey(row.engineer);
  const excelRow = String(sourceRowIndex + 2).padStart(5, "0");

  return `excel-row:${customerKey}|${modelKey}|${engineerKey}|${excelRow}`;
}


export function inferRegionByCustomer(customer: string, customerRegionMap: Record<string, RegionKey>): {
  region: RegionKey;
  matched: boolean;
} {
  const region = customerRegionMap[customer];
  return {
    region: region ?? "north",
    matched: region !== undefined,
  };
}

export function inferEquipmentStatus(row: WorkbookRow): EquipmentMainStatus {
  if (row.actComplete) return "正式生產中";
  if (row.actArrival) return "試產";
  return "裝機";
}

export function validateWorkbookRow(row: WorkbookRow, target: ImportTarget, phaseOverride?: PhaseKey): string[] {
  const errors = new Set<string>();
  if (!row.customer.trim()) errors.add("客戶不可空白");
  if (!row.modelCode.trim()) errors.add("機型不可空白");

  const phase = phaseOverride ?? resolveInstallationPhase(row);
  for (const issue of getInstallationValidationIssues({
    phase,
    name: row.serialNo,
    modelCode: row.modelCode,
    engineer: row.engineer,
    estArrival: row.estArrival,
    estComplete: row.estComplete,
    actArrival: row.actArrival,
    actComplete: row.actComplete,
    nextDueDate: "",
  })) {
    errors.add(issue.message);
  }

  if (target === "equipment" && !cleanSerialNo(row.serialNo, row.modelCode)) errors.add("設備台帳缺少機台序號");
  if (row.estArrival && row.estComplete && row.estArrival > row.estComplete) errors.add("預計安裝日不可早於預計出貨日");
  if (row.actArrival && row.actComplete && row.actArrival > row.actComplete) errors.add("驗收完成日期不可早於實際安裝日期");
  return Array.from(errors);
}

export function parseWorkbookJsonRows(
  jsonRows: Array<Record<string, unknown>>,
  models: readonly MachineModel[] = DEFAULT_MACHINE_MODELS,
  importConfig?: ImportConfigDoc | null,
): ParsedWorkbookRow[] {
  const headerFieldMap = buildHeaderFieldMap(importConfig);
  return jsonRows
    .map((rowObj, rowIndex) => {
      const row: Record<keyof WorkbookRow, string> = {
        serialNo: "",
        modelCode: "",
        customer: "",
        estArrival: "",
        estComplete: "",
        actArrival: "",
        actComplete: "",
        engineer: "",
      };

      for (const [columnName, rawValue] of Object.entries(rowObj)) {
        const targetField = headerFieldMap.get(normalizeHeaderKey(columnName));
        if (!targetField) continue;
        row[targetField] = DATE_FIELDS.has(targetField)
          ? excelDateToString(rawValue)
          : typeof rawValue === "string"
            ? rawValue.trim()
            : String(rawValue ?? "").trim();
      }

      const configuredModel = resolveConfiguredMachineModel(row.modelCode, importConfig);
      const modelCode = cleanModelName(configuredModel, models);
      const customer = resolveConfiguredCustomerName(row.customer, importConfig);
      const normalized: WorkbookRow = {
        serialNo: cleanSerialNo(row.serialNo, modelCode),
        modelCode,
        customer,
        estArrival: row.estArrival,
        estComplete: row.estComplete,
        actArrival: row.actArrival,
        actComplete: row.actComplete,
        engineer: row.engineer,
      };

      return {
        ...normalized,
        rowIndex,
        target: classifyImportTarget(normalized),
      } satisfies ParsedWorkbookRow;
    })
    .filter((row) => row.customer.length > 0 || row.modelCode.length > 0 || row.serialNo.length > 0);
}

export function buildInstallationPayload(
  row: WorkbookRow,
  region: RegionKey,
  now: Date = new Date(),
  overrides: InstallationPayloadOverrides = {},
): Omit<Installation, "id"> {
  if (!row.modelCode.trim()) throw new Error("匯入缺少機型");
  if (!row.customer.trim()) throw new Error("匯入缺少客戶");
  const phase = overrides.phase ?? resolveInstallationPhase(row, now);
  const serialNo = cleanSerialNo(row.serialNo, row.modelCode);
  return {
    name: serialNo,
    modelCode: row.modelCode,
    region,
    customer: row.customer,
    phase,
    engineer: toDisplayShortName(row.engineer),
    orderDate: "",
    estArrival: row.estArrival,
    actArrival: row.actArrival,
    estComplete: row.estComplete,
    actComplete: row.actComplete,
    notes: "",
    progress: overrides.progress ?? resolveInstallationProgress(phase),
    custContact: "",
    custPhone: "",
    checklist: {},
  };
}

export function buildEquipmentPayload(
  row: WorkbookRow,
  region: RegionKey,
  overrides: EquipmentPayloadOverrides = {},
): Omit<Equipment, "id"> {
  const serialNo = cleanSerialNo(row.serialNo, row.modelCode);
  if (!serialNo) throw new Error("設備台帳缺少機台序號");
  if (!row.modelCode.trim()) throw new Error("匯入缺少機型");
  if (!row.customer.trim()) throw new Error("匯入缺少客戶");
  const milestones = buildEquipmentMilestonesFromInstallationDates({
    actArrival: row.actArrival,
    actComplete: row.actComplete,
  });

  return {
    equipmentId: serialNo,
    region,
    customer: row.customer,
    site: "",
    modelCode: row.modelCode,
    serialNo,
    statusMain: overrides.statusMain ?? inferEquipmentStatus(row),
    statusSub: "",
    owner: toDisplayShortName(row.engineer),
    milestones,
    capacity: {
      utilization: 0,
      uph: 0,
      targetUph: 0,
      level: "綠",
      trend7d: [0, 0, 0, 0, 0, 0, 0],
    },
    products: [],
  };
}
