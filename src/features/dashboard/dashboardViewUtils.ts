import type { CapacityLevel, EquipmentMainStatus, Installation, PhaseKey, RegionKey } from "@/domain/types";
import { CAPACITY_LEVELS, EQUIPMENT_MAIN_STATUSES, PHASES, REGIONS } from "@/domain/constants";
import { getInstallationModelSerial, getInstallationSerial, getInstallationTaskTitle } from "@/domain/installationDisplay";
import { todayInTaipeiYmd } from "@/lib/utils";

export type InsightsTab = "analytics" | "logs";
export type InstallView = "table" | "pipeline" | "gantt";
export type FieldErrorMap = Record<string, string>;

export function parseInstallView(v: string | null): InstallView {
  if (v === "table" || v === "gantt") return v;
  return "pipeline";
}

export function parseInsightsTab(v: string | null): InsightsTab {
  if (v === "logs") return "logs";
  return "analytics";
}

export function collectFieldErrors(issues: ReadonlyArray<{ path?: Array<string | number>; message: string }>) {
  const fieldErrors: FieldErrorMap = {};
  const summary: string[] = [];
  for (const issue of issues) {
    const field = typeof issue.path?.[0] === "string" ? String(issue.path[0]) : "form";
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    if (!summary.includes(issue.message)) summary.push(issue.message);
  }
  return { fieldErrors, summary };
}

export function fmtDate(ts?: number): string {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseYmd(s?: string): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export function daysLeft(ymd?: string): number | null {
  const dt = parseYmd(ymd);
  if (!dt) return null;
  const today = parseYmd(todayInTaipeiYmd());
  if (!today) return null;
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function taipeiNowParts(): { ymd: string; hhmm: string } {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const y = get("year");
  const m = get("month");
  const dd = get("day");
  const hh = get("hour");
  const mm = get("minute");
  return { ymd: `${y}-${m}-${dd}`, hhmm: `${hh}:${mm}` };
}

export function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function normalizeOptionList(rows: string[]): string[] {
  return Array.from(new Set(rows.map((s) => String(s).trim()).filter(Boolean)));
}

export function parsePhaseFilter(value: string): "" | PhaseKey {
  return PHASES.some((phase) => phase.key === value) ? (value as PhaseKey) : "";
}

export function parsePhaseKey(value: string): PhaseKey {
  return parsePhaseFilter(value) || "ordered";
}

export function parseRegionKey(value: string): RegionKey {
  if (value === "north" || value === "central" || value === "south") return value;
  return "north";
}

export function parseEquipmentStatusFilter(value: string): "" | EquipmentMainStatus {
  return EQUIPMENT_MAIN_STATUSES.some((status) => status === value) ? (value as EquipmentMainStatus) : "";
}

export function parseCapacityFilter(value: string): "" | CapacityLevel {
  return CAPACITY_LEVELS.some((level) => level === value) ? (value as CapacityLevel) : "";
}

export function getInstallSerial(r: Installation): string {
  return getInstallationSerial(r);
}

export function getInstallModelSerial(r: Installation): string {
  return getInstallationModelSerial(r);
}

export function getInstallTaskLabel(r: Installation): string {
  return getInstallationTaskTitle(r);
}

export function regionLabel(k: RegionKey): string {
  return REGIONS[k]?.label ?? k;
}

export function getPhaseHint(phase: PhaseKey): string {
  switch (phase) {
    case "ordered":
      return "先建立需求即可，機台序號與工程師可稍後補。";
    case "shipping":
      return "備貨 / 出貨階段可先追預計出貨與預計安裝日。";
    case "arrived":
      return "到廠後需補機台序號與負責工程師。";
    case "installing":
      return "開始安裝後需填實際安裝日期，進度可由檢查清單帶出。";
    case "trial":
      return "試產階段請維護工程師與試產檢查清單。";
    case "qual":
      return "Qual 驗證階段請追驗證與客戶確認項目。";
    case "released":
      return "正式量產會轉入設備台帳，請確認序號與工程師。";
    default:
      return "";
  }
}

export function pickColorByUtil(u: number): string {
  if (u >= 80) return "#10b981";
  if (u >= 50) return "#f59e0b";
  return "#ef4444";
}

export function resolveCustomerRegionFromMap(customerRegionMap: Record<string, RegionKey>, customer: string): RegionKey | null {
  const target = customer.trim();
  if (!target) return null;
  const direct = customerRegionMap[target];
  if (direct) return direct;
  const lower = target.toLowerCase();
  const match = Object.entries(customerRegionMap).find(([name]) => name.trim().toLowerCase() === lower);
  return match?.[1] ?? null;
}
