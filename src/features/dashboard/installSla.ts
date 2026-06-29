import type { Installation, PhaseKey } from "@/domain/types";
import { todayInTaipeiYmd } from "@/lib/utils";

export type InstallSlaTone = "good" | "warning" | "critical" | "neutral";

export type InstallSlaStatus = {
  phase: PhaseKey;
  phaseLabel: string;
  slaDays: number;
  agingDays: number;
  remainingDays: number;
  status: "done" | "ok" | "warning" | "breached";
  tone: InstallSlaTone;
  color: string;
  label: string;
  title: string;
  basisLabel: string;
  basisDate: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const PHASE_SLA: Record<PhaseKey, { days: number; label: string }> = {
  ordered: { days: 14, label: "訂單" },
  shipping: { days: 14, label: "出貨" },
  arrived: { days: 7, label: "到廠" },
  installing: { days: 5, label: "裝機" },
  trial: { days: 7, label: "試產" },
  qual: { days: 7, label: "Qual" },
  released: { days: 0, label: "Release" },
};

const SLA_COLORS: Record<InstallSlaStatus["status"], string> = {
  done: "#10b981",
  ok: "#0ea5e9",
  warning: "#f59e0b",
  breached: "#ef4444",
};

function parseYmd(value?: string | null): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function timestampToYmd(timestamp?: number): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function daysBetween(startYmd: string | null, endYmd: string): number {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

function pickPhaseBasis(row: Installation): { date: string | null; label: string } {
  switch (row.phase) {
    case "ordered":
      return { date: row.orderDate || timestampToYmd(row.createdAt) || timestampToYmd(row.updatedAt), label: row.orderDate ? "訂單日" : "建立日" };
    case "shipping":
      return { date: row.orderDate || row.estArrival || timestampToYmd(row.updatedAt), label: row.orderDate ? "訂單日" : row.estArrival ? "預計到廠" : "更新日" };
    case "arrived":
      return { date: row.actArrival || row.estArrival || timestampToYmd(row.updatedAt), label: row.actArrival ? "實際到廠" : row.estArrival ? "預計到廠" : "更新日" };
    case "installing":
      return { date: row.actArrival || timestampToYmd(row.updatedAt), label: row.actArrival ? "實際到廠" : "更新日" };
    case "trial":
    case "qual":
      return { date: row.actArrival || timestampToYmd(row.updatedAt), label: row.actArrival ? "實際到廠" : "更新日" };
    case "released":
      return { date: row.actComplete || timestampToYmd(row.updatedAt), label: row.actComplete ? "完成日" : "更新日" };
    default:
      return { date: timestampToYmd(row.updatedAt), label: "更新日" };
  }
}

function getTone(status: InstallSlaStatus["status"]): InstallSlaTone {
  if (status === "breached") return "critical";
  if (status === "warning") return "warning";
  if (status === "done") return "good";
  return "neutral";
}

export function getInstallSlaStatus(row: Installation, today: string = todayInTaipeiYmd()): InstallSlaStatus {
  const config = PHASE_SLA[row.phase];
  const basis = pickPhaseBasis(row);
  const agingDays = row.phase === "released" ? 0 : daysBetween(basis.date, today);
  const remainingDays = config.days - agingDays;
  const status: InstallSlaStatus["status"] =
    row.phase === "released"
      ? "done"
      : remainingDays < 0
        ? "breached"
        : remainingDays <= 2
          ? "warning"
          : "ok";
  const label =
    status === "done"
      ? "已完成"
      : status === "breached"
        ? `逾 SLA ${Math.abs(remainingDays)} 天`
        : remainingDays === 0
          ? "SLA 今日"
          : `SLA 剩 ${remainingDays} 天`;

  return {
    phase: row.phase,
    phaseLabel: config.label,
    slaDays: config.days,
    agingDays,
    remainingDays,
    status,
    tone: getTone(status),
    color: SLA_COLORS[status],
    label,
    title: `${config.label}階段已 ${agingDays}/${config.days} 天，起算：${basis.label}${basis.date ? ` ${basis.date}` : " - "}`,
    basisLabel: basis.label,
    basisDate: basis.date,
  };
}
