import type { WorkSheet } from "xlsx";

import type { Equipment, EquipmentMainStatus, Installation, MachineModel, PhaseKey, RegionKey } from "@/domain/types";
import { DEFAULT_MACHINE_MODELS } from "@/domain/constants";
import { resolveInstallationPhase, resolveInstallationProgress, shouldTransferInstallationToEquipment } from "@/domain/installPhase";
import { buildEquipmentMilestonesFromInstallationDates } from "@/domain/equipmentMilestones";
import { cleanMachineModelName, canonicalizeMachineModelCode } from "@/domain/machineModels";
import { toDisplayShortName } from "@/domain/personDisplay";
import { getInstallationValidationIssues } from "@/domain/installationContract";
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

const COLUMN_MAP: Record<string, keyof WorkbookRow> = {
  "產品序號": "serialNo",
  "產品名稱": "modelCode",
  "訂單來源公司名稱": "customer",
  "預計出貨日": "estArrival",
  "預計安裝日": "estComplete",
  "實際安裝日期": "actArrival",
  "驗收完成日期": "actComplete",
  "服務人員名稱": "engineer",
};

const DATE_FIELDS = new Set<keyof WorkbookRow>(["estArrival", "estComplete", "actArrival", "actComplete"]);

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

export function resolveWorkbookImportDisposition(row: WorkbookRow, phaseOverride?: PhaseKey, now: Date = new Date()) {
  const phase = phaseOverride ?? resolveInstallationPhase(row, now);
  const progress = resolveInstallationProgress(phase);
  const transferToEquipment = shouldTransferInstallationToEquipment({
    phase,
    name: row.serialNo,
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
  const serialKey = normalizeCompactKey(row.serialNo);
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
    engineer: row.engineer,
    estArrival: row.estArrival,
    estComplete: row.estComplete,
    actArrival: row.actArrival,
    actComplete: row.actComplete,
  })) {
    errors.add(issue.message);
  }

  if (target === "equipment" && !row.serialNo.trim()) errors.add("設備台帳缺少機台序號");
  if (row.estArrival && row.estComplete && row.estArrival > row.estComplete) errors.add("預計安裝日不可早於預計出貨日");
  if (row.actArrival && row.actComplete && row.actArrival > row.actComplete) errors.add("驗收完成日期不可早於實際安裝日期");
  return Array.from(errors);
}

export function parseWorkbookJsonRows(
  jsonRows: Array<Record<string, unknown>>,
  models: readonly MachineModel[] = DEFAULT_MACHINE_MODELS,
): ParsedWorkbookRow[] {
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

      for (const [columnName, targetField] of Object.entries(COLUMN_MAP)) {
        const rawValue = rowObj[columnName];
        row[targetField] = DATE_FIELDS.has(targetField)
          ? excelDateToString(rawValue)
          : typeof rawValue === "string"
            ? rawValue.trim()
            : String(rawValue ?? "").trim();
      }

      const normalized: WorkbookRow = {
        serialNo: row.serialNo,
        modelCode: cleanModelName(row.modelCode, models),
        customer: row.customer,
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

export function parseWorkbookSheet(
  ws: WorkSheet,
  models: readonly MachineModel[] = DEFAULT_MACHINE_MODELS,
): ParsedWorkbookRow[] {
  void ws;
  throw new Error("請改用 parseWorkbookJsonRows，並由呼叫端先將工作表轉成 JSON 資料列");
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
  return {
    name: row.serialNo,
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
  if (!row.serialNo.trim()) throw new Error("設備台帳缺少機台序號");
  if (!row.modelCode.trim()) throw new Error("匯入缺少機型");
  if (!row.customer.trim()) throw new Error("匯入缺少客戶");
  const milestones = buildEquipmentMilestonesFromInstallationDates({
    actArrival: row.actArrival,
    actComplete: row.actComplete,
  });

  return {
    equipmentId: row.serialNo,
    region,
    customer: row.customer,
    site: "",
    modelCode: row.modelCode,
    serialNo: row.serialNo,
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
