import type { Installation } from "@/domain/types";
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
  "notes",
  "updatedAt",
] satisfies Array<keyof Installation>;

function formatTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatExcelCsvValue(key: keyof Installation, value: Installation[keyof Installation]): string {
  if (value == null) return "";
  if (key === "updatedAt" || key === "createdAt") {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? formatTimestamp(timestamp) : "";
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

export function downloadInstallationsCsv(rows: Installation[]): void {
  const csv = buildInstallationsCsv(rows);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `installations_${todayInTaipeiYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
