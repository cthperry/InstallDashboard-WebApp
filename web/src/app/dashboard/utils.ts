import type { Installation, RegionKey, PhaseKey } from "@/domain/types";
import { PHASES, REGIONS } from "@/domain/constants";

const C = {
  bg: "#15191f",           // 深灰底（中性不帶藍調）
  panel: "#1d2330",        // 主面板
  panelHigh: "#26303f",    // 卡片/hover
  border: "rgba(118,185,0,0.12)",
  borderMed: "rgba(118,185,0,0.28)",
  accent: "#76b900",       // NVIDIA 綠主色
  accentDim: "rgba(118,185,0,0.15)",
  success: "#4ade80",      // 翠綠成功
  successDim: "rgba(74,222,128,0.12)",
  warning: "#fbbf24",      // 琥珀警告
  warningDim: "rgba(251,191,36,0.12)",
  danger: "#f43f5e",       // 紅色危險
  dangerDim: "rgba(244,63,94,0.12)",
  info: "#38bdf8",         // 天藍資訊
  infoDim: "rgba(56,189,248,0.12)",
  text1: "#edf2f7",        // 主文字
  text2: "#8fa3b8",        // 輔助文字
  text3: "#4e6480",        // 三級文字
} as const;

export function todayYYYYMMDD(): string {
  const d = new Date();
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

export function fmtDate(ts?: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function safeStr(v: any): string {
  return v && typeof v === "string" ? v : "";
}

export function daysLeft(estComplete?: string): number | null {
  if (!estComplete) return null;
  const today = new Date(todayYYYYMMDD());
  const est = new Date(estComplete);
  const diff = Math.floor((est.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function isOverdueInstall(r: Installation, today: string): boolean {
  return r.phase !== "released" && r.estComplete ? r.estComplete < today : false;
}

export function calcInstallStats(rows: Installation[], today: string): {
  total: number;
  wip: number;
  released: number;
  overdue: number;
  avgProg: number;
  byPhase: Record<string, number>;
  thisMonth: number;
} {
  const total = rows.length;
  const wip = rows.filter(r => r.phase !== "released").length;
  const released = rows.filter(r => r.phase === "released").length;
  const overdue = rows.filter(r => isOverdueInstall(r, today)).length;
  const avgProg = total ? Math.round(rows.reduce((s, r) => s + (r.progress || 0), 0) / total) : 0;
  const thisMonth = rows.filter(r => {
    const d = r.orderDate || r.estComplete || r.actComplete;
    if (!d) return false;
    const dStr = typeof d === "string" ? d : fmtDate(d as number);
    return dStr.startsWith(todayYYYYMMDD().slice(0, 7));
  }).length;

  const byPhase: Record<string, number> = {};
  PHASES.forEach(p => { byPhase[p.key] = rows.filter(r => r.phase === p.key).length; });

  return { total, wip, released, overdue, avgProg, byPhase, thisMonth };
}

export function calcEquipmentStats(rows: any[]): {
  total: number;
  avgUtil: number;
  byStatus: Record<string, number>;
  byCap: Record<string, number>;
  blocked: number;
} {
  const total = rows.length;
  const avgUtil = total ? Math.round(rows.reduce((s, r) => s + (r.capacity?.utilization || 0), 0) / total) : 0;
  const byStatus: Record<string, number> = {};
  const byCap: Record<string, number> = { 綠: 0, 黃: 0, 紅: 0 };
  let blocked = 0;

  // Initialize with all main statuses
  const EQUIPMENT_MAIN_STATUSES = ["裝機", "運轉", "保養", "故障", "報廢"];
  EQUIPMENT_MAIN_STATUSES.forEach(st => { byStatus[st] = 0; });

  rows.forEach(r => {
    byStatus[r.statusMain]++;
    byCap[r.capacity?.level || "綠"]++;
    if (r.blocking) blocked++;
  });

  return { total, avgUtil, byStatus, byCap, blocked };
}

export function exportInstallationsCSV(rows: Installation[]): void {
  const cols = ["名稱", "地區", "客戶", "階段", "工程師", "進度%", "預計完成", "實際完成", "狀態"];
  const lines = [cols.join(",")];
  const today = todayYYYYMMDD();
  rows.forEach(r => {
    const status = isOverdueInstall(r, today) ? "逾期" : r.phase === "released" ? "已量產" : "進行中";
    lines.push([
      `"${r.name || ""}"`,
      REGIONS[r.region as RegionKey]?.label || r.region || "",
      `"${r.customer || ""}"`,
      PHASES.find(p => p.key === r.phase)?.label || r.phase,
      r.engineer || "",
      r.progress || 0,
      r.estComplete || "",
      r.actComplete || "",
      status,
    ].join(","));
  });
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `installs_${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function slaLabel(dl: number | null): { text: string; color: string } | null {
  if (dl === null) return null;
  if (dl < 0) return { text: `逾期 ${-dl} 天`, color: C.danger };
  if (dl <= 7) return { text: `${dl} 天到期`, color: C.warning };
  return null;
}

export { C };
