import { getLiveUtilization } from "@/domain/capacity";
import { getEquipmentBlockingAgeDays, normalizeEquipmentBlockingStatus } from "@/domain/equipmentBlocking";
import type { Equipment, Installation } from "@/domain/types";
import { todayInTaipeiYmd } from "@/lib/utils";

const INSTALLATION_CSV_COLUMNS = [
  "name",
  "modelCode",
  "region",
  "customer",
  "phase",
  "engineer",
  "progress",
  "orderDate",
  "estArrival",
  "actArrival",
  "estComplete",
  "actComplete",
  "nextAction",
  "nextOwner",
  "nextDueDate",
  "overdueReason",
  "notes",
  "updatedAt",
] satisfies Array<keyof Installation>;

type EquipmentCsvColumn = {
  key: string;
  getValue: (row: Equipment) => unknown;
};

const EQUIPMENT_CSV_COLUMNS: EquipmentCsvColumn[] = [
  { key: "equipmentId", getValue: (row) => row.equipmentId },
  { key: "serialNo", getValue: (row) => row.serialNo },
  { key: "region", getValue: (row) => row.region },
  { key: "customer", getValue: (row) => row.customer },
  { key: "site", getValue: (row) => row.site },
  { key: "modelCode", getValue: (row) => row.modelCode },
  { key: "statusMain", getValue: (row) => row.statusMain },
  { key: "statusSub", getValue: (row) => row.statusSub },
  { key: "owner", getValue: (row) => row.owner },
  { key: "installStart", getValue: (row) => row.milestones.installStart },
  { key: "installDone", getValue: (row) => row.milestones.installDone },
  { key: "trialStart", getValue: (row) => row.milestones.trialStart },
  { key: "trialPass", getValue: (row) => row.milestones.trialPass },
  { key: "prodStart", getValue: (row) => row.milestones.prodStart },
  { key: "reachTargetDate", getValue: (row) => row.milestones.reachTargetDate },
  { key: "blockingStatus", getValue: (row) => row.blocking?.reasonCode ? normalizeEquipmentBlockingStatus(row.blocking.status) : "" },
  { key: "blockingReason", getValue: (row) => row.blocking?.reasonCode },
  { key: "blockingDetail", getValue: (row) => row.blocking?.detail },
  { key: "blockingOwner", getValue: (row) => row.blocking?.owner },
  { key: "blockingEta", getValue: (row) => row.blocking?.eta },
  { key: "blockingAgeDays", getValue: (row) => getEquipmentBlockingAgeDays(row.blocking) },
  { key: "blockingReopenCount", getValue: (row) => row.blocking?.reopenCount },
  { key: "resolutionNote", getValue: (row) => row.blocking?.resolutionNote },
  { key: "utilization", getValue: (row) => getLiveUtilization(row.capacity) },
  { key: "uph", getValue: (row) => row.capacity.uph },
  { key: "targetUph", getValue: (row) => row.capacity.targetUph },
  { key: "capacityLevel", getValue: (row) => row.capacity.level },
  { key: "products", getValue: (row) => (row.products ?? []).map((product) => `${product.name}:${product.dailyCap}`).join("; ") },
  { key: "updatedAt", getValue: (row) => row.updatedAt },
];

function formatTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTimestampValue(value: unknown): string {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? formatTimestamp(timestamp) : "";
}

function formatExcelCsvValue(key: keyof Installation, value: Installation[keyof Installation]): string {
  if (value == null) return "";
  if (key === "updatedAt" || key === "createdAt") {
    return formatTimestampValue(value);
  }
  return String(value).replace(/\r?\n/g, " ");
}

function formatCsvValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value).replace(/\r?\n/g, " ");
}

function toCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildInstallationsCsv(rows: Installation[]): string {
  return [
    INSTALLATION_CSV_COLUMNS.join(","),
    ...rows.map((row) =>
      INSTALLATION_CSV_COLUMNS
        .map((key) => toCsvCell(formatExcelCsvValue(key, row[key])))
        .join(",")
    ),
  ].join("\r\n");
}

export function buildEquipmentsCsv(rows: Equipment[]): string {
  return [
    EQUIPMENT_CSV_COLUMNS.map((column) => column.key).join(","),
    ...rows.map((row) =>
      EQUIPMENT_CSV_COLUMNS
        .map((column) => toCsvCell(column.key === "updatedAt" ? formatTimestampValue(column.getValue(row)) : formatCsvValue(column.getValue(row))))
        .join(",")
    ),
  ].join("\r\n");
}

export function downloadInstallationsCsv(rows: Installation[]): void {
  const csv = buildInstallationsCsv(rows);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `installations_${todayInTaipeiYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadEquipmentsCsv(rows: Equipment[]): void {
  const csv = buildEquipmentsCsv(rows);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `equipments_${todayInTaipeiYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
