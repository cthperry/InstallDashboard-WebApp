import type { Installation, PhaseKey } from "@/domain/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type GanttRow = {
  id: string;
  install: Installation;
  phase: PhaseKey;
  start: Date;
  end: Date;
  progress: number;
};

export type GanttTimeline = {
  minDate: Date;
  totalMs: number;
  todayPct: number;
  months: Array<{ label: string; left: number }>;
};

export type GanttViewModel = {
  rows: GanttRow[];
  timeline: GanttTimeline;
};

function parseYmd(s?: string): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function createTimeline(minTime: number, maxTime: number, today: Date): GanttTimeline {
  const minDate = new Date(minTime);
  const maxDate = new Date(maxTime);
  minDate.setDate(minDate.getDate() - 3);
  maxDate.setDate(maxDate.getDate() + 7);

  const totalMs = maxDate.getTime() - minDate.getTime();
  const pct = (d: Date) => ((d.getTime() - minDate.getTime()) / totalMs) * 100;
  const months: GanttTimeline["months"] = [];
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    months.push({
      label: `${cur.getFullYear()}/${String(cur.getMonth() + 1).padStart(2, "0")}`,
      left: pct(cur),
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  return { minDate, totalMs, todayPct: pct(today), months };
}

export function buildGanttViewModel(rows: Installation[], today: Date): GanttViewModel {
  const ganttRows: GanttRow[] = [];
  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const sourceStart = parseYmd(row.orderDate) ?? (row.createdAt ? new Date(row.createdAt) : new Date(today.getTime() - 14 * DAY_MS));
    const sourceEnd = parseYmd(row.estComplete) ?? new Date(today.getTime() + 30 * DAY_MS);
    const start = sourceStart < sourceEnd ? sourceStart : sourceEnd;
    const end = sourceStart < sourceEnd ? sourceEnd : new Date(sourceStart.getTime() + DAY_MS);
    const startTime = start.getTime();
    const endTime = end.getTime();
    if (startTime < minTime) minTime = startTime;
    if (endTime > maxTime) maxTime = endTime;
    ganttRows.push({
      id: row.id,
      install: row,
      phase: row.phase,
      start,
      end,
      progress: row.progress ?? 0,
    });
  }

  ganttRows.sort((a, b) => a.start.getTime() - b.start.getTime());

  if (ganttRows.length === 0) {
    minTime = today.getTime() - 30 * DAY_MS;
    maxTime = today.getTime() + 60 * DAY_MS;
  }

  return {
    rows: ganttRows,
    timeline: createTimeline(minTime, maxTime, today),
  };
}
