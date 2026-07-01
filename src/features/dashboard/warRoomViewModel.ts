import type { Equipment, Installation, PhaseKey, RegionKey } from "@/domain/types";
import { PHASES, PHASE_MAP, REGIONS } from "@/domain/constants";
import { getLiveUtilization } from "@/domain/capacity";
import { isActiveEquipmentBlocking } from "@/domain/equipmentBlocking";
import { getInstallationSerial } from "@/domain/installationDisplay";
import { toDisplayShortName } from "@/domain/personDisplay";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_QUEUE_ITEMS = 12;
const MAX_LOW_PRIORITY_QUEUE_ITEMS = 8;

export type Tone = "critical" | "warning" | "info" | "good";

export type QueueItem = {
  id: string;
  title: string;
  meta: string;
  value: string;
  tone: Tone;
  href: string;
  priority: number;
};

export type RegionCommandRow = {
  key: RegionKey;
  label: string;
  color: string;
  installs: number;
  equipments: number;
  overdue: number;
  blocked: number;
  hot: number;
  score: number;
};

export type PhaseCommandRow = (typeof PHASES)[number] & {
  count: number;
};

type RegionAccumulator = {
  installs: number;
  equipments: number;
  overdue: number;
  blocked: number;
  hot: number;
};

export type WarRoomViewModel = {
  total: number;
  wip: number;
  released: number;
  overdue: Installation[];
  dueSoon: Installation[];
  stale: Installation[];
  blocked: Equipment[];
  hot: Equipment[];
  avgUtilization: number;
  healthScore: number;
  phaseRows: PhaseCommandRow[];
  maxPhaseCount: number;
  regionRows: RegionCommandRow[];
  queue: QueueItem[];
  briefLines: string[];
};

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function parseYmd(ymd?: string): Date | null {
  const value = safeStr(ymd).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function daysBetween(aYmd: string, bYmd: string): number | null {
  const a = parseYmd(aYmd);
  const b = parseYmd(bYmd);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function isReleased(row: Installation) {
  return row.phase === "released";
}

function isOverdue(row: Installation, today: string) {
  const due = safeStr(row.estComplete);
  return Boolean(due && !isReleased(row) && due < today);
}

function daysSinceUpdated(ts: number | undefined, nowMs: number): number {
  if (!ts) return 999;
  return Math.max(0, Math.floor((nowMs - ts) / DAY_MS));
}

function getInstallTitle(row: Installation) {
  return getInstallationSerial(row) || safeStr(row.modelCode) || safeStr(row.customer) || row.id;
}

function createRegionAccumulator(): Record<RegionKey, RegionAccumulator> {
  return (Object.keys(REGIONS) as RegionKey[]).reduce(
    (acc, key) => {
      acc[key] = { installs: 0, equipments: 0, overdue: 0, blocked: 0, hot: 0 };
      return acc;
    },
    {} as Record<RegionKey, RegionAccumulator>,
  );
}

function buildQueue(
  overdue: Installation[],
  blocked: Equipment[],
  dueSoon: Installation[],
  stale: Installation[],
  hot: Equipment[],
  today: string,
  nowMs: number,
): QueueItem[] {
  const queue: QueueItem[] = [];

  for (const row of overdue) {
    if (queue.length >= MAX_QUEUE_ITEMS) return queue;
    queue.push({
      id: `overdue-${row.id}`,
      title: getInstallTitle(row),
      meta: `${row.customer || "未填客戶"} · ${PHASE_MAP[row.phase]?.label ?? row.phase} · ${toDisplayShortName(row.nextOwner || row.engineer) || "未指派"} · ${row.nextDueDate || "未設定 ETA"}`,
      value: `逾期 ${Math.abs(daysBetween(today, safeStr(row.estComplete)) ?? 0)} 天`,
      tone: "critical",
      href: "/dashboard/install?view=pipeline",
      priority: 100,
    });
  }

  for (const row of blocked) {
    if (queue.length >= MAX_QUEUE_ITEMS) return queue;
    queue.push({
      id: `blocked-${row.id}`,
      title: row.equipmentId || row.serialNo || row.id,
      meta: `${row.customer || "未填客戶"} · ${row.blocking?.reasonCode || "阻塞"} · ${row.blocking?.owner || "未指派 owner"}`,
      value: "BLOCK",
      tone: "warning",
      href: "/dashboard/equipment",
      priority: 90,
    });
  }

  for (const row of dueSoon) {
    if (queue.length >= MAX_QUEUE_ITEMS) return queue;
    queue.push({
      id: `due-${row.id}`,
      title: getInstallTitle(row),
      meta: `${row.customer || "未填客戶"} · 預計 ${row.estComplete} · ${toDisplayShortName(row.nextOwner || row.engineer) || "未指派"} · ${row.nextAction || "未設定下一步"}`,
      value: `${daysBetween(today, safeStr(row.estComplete)) ?? 0} 天內`,
      tone: "info",
      href: "/dashboard/install?view=table",
      priority: 70,
    });
  }

  const staleLimit = Math.min(stale.length, MAX_LOW_PRIORITY_QUEUE_ITEMS);
  for (let i = 0; i < staleLimit; i += 1) {
    if (queue.length >= MAX_QUEUE_ITEMS) return queue;
    const row = stale[i];
    queue.push({
      id: `stale-${row.id}`,
      title: getInstallTitle(row),
      meta: `${row.customer || "未填客戶"} · ${PHASE_MAP[row.phase]?.label ?? row.phase} · ${daysSinceUpdated(row.updatedAt, nowMs)} 天未更新`,
      value: "STALE",
      tone: "warning",
      href: "/dashboard/install?view=pipeline",
      priority: 60,
    });
  }

  const hotLimit = Math.min(hot.length, MAX_LOW_PRIORITY_QUEUE_ITEMS);
  for (let i = 0; i < hotLimit; i += 1) {
    if (queue.length >= MAX_QUEUE_ITEMS) return queue;
    const row = hot[i];
    queue.push({
      id: `hot-${row.id}`,
      title: row.equipmentId || row.serialNo || row.id,
      meta: `${row.customer || "未填客戶"} · ${row.modelCode} · ${getLiveUtilization(row.capacity)}% utilization`,
      value: "高負載",
      tone: "good",
      href: "/dashboard/equipment",
      priority: 40,
    });
  }

  return queue;
}

function buildBriefLines(overdue: Installation[], blocked: Equipment[], dueSoon: Installation[], hot: Equipment[]): string[] {
  const lines: string[] = [];
  if (overdue.length > 0) lines.push(`${overdue.length} 件裝機逾期，先要求 owner 更新 ETA 與下一步。`);
  if (blocked.length > 0) lines.push(`${blocked.length} 台設備有 blocking，需確認責任人與解除日期。`);
  if (dueSoon.length > 0) lines.push(`${dueSoon.length} 件本週到期，適合排進 morning standup。`);
  if (hot.length > 0) lines.push(`${hot.length} 台設備稼動率超過 80%，產能壓力需追蹤。`);
  if (lines.length === 0) lines.push("目前沒有紅色警戒，建議把焦點放在資料完整度與下週交付排序。");
  return lines;
}

export function buildWarRoomViewModel(
  installs: Installation[],
  equips: Equipment[],
  today: string,
  nowMs = Date.now(),
): WarRoomViewModel {
  const total = installs.length;
  let wip = 0;
  let released = 0;
  let utilizationSum = 0;
  const overdue: Installation[] = [];
  const dueSoon: Installation[] = [];
  const stale: Installation[] = [];
  const blocked: Equipment[] = [];
  const hot: Equipment[] = [];

  const phaseCount: Record<PhaseKey, number> = {
    ordered: 0,
    shipping: 0,
    arrived: 0,
    installing: 0,
    trial: 0,
    qual: 0,
    released: 0,
  };

  const regionAccumulator = createRegionAccumulator();

  for (const row of installs) {
    const releasedRow = isReleased(row);
    if (releasedRow) released += 1;
    else wip += 1;

    phaseCount[row.phase] = (phaseCount[row.phase] ?? 0) + 1;

    const regionStats = regionAccumulator[row.region];
    if (regionStats) regionStats.installs += 1;

    const overdueRow = isOverdue(row, today);
    if (overdueRow) {
      overdue.push(row);
      if (regionStats) regionStats.overdue += 1;
    }

    if (!releasedRow) {
      const daysUntilDue = daysBetween(today, safeStr(row.estComplete));
      if (daysUntilDue != null && daysUntilDue >= 0 && daysUntilDue <= 7) dueSoon.push(row);
      if (daysSinceUpdated(row.updatedAt, nowMs) >= 7) stale.push(row);
    }
  }

  for (const row of equips) {
    const utilization = getLiveUtilization(row.capacity);
    utilizationSum += utilization;
    const regionStats = regionAccumulator[row.region];
    if (regionStats) regionStats.equipments += 1;

    if (isActiveEquipmentBlocking(row.blocking)) {
      blocked.push(row);
      if (regionStats) regionStats.blocked += 1;
    }

    if (utilization >= 80) {
      hot.push(row);
      if (regionStats) regionStats.hot += 1;
    }
  }

  const avgUtilization = equips.length ? Math.round(utilizationSum / equips.length) : 0;
  const healthScore = clamp(100 - overdue.length * 8 - blocked.length * 6 - dueSoon.length * 3 - stale.length * 2, 0, 100);

  const regionRows: RegionCommandRow[] = (Object.keys(REGIONS) as RegionKey[]).map((key) => {
    const regionStats = regionAccumulator[key];
    const score = clamp(100 - regionStats.overdue * 14 - regionStats.blocked * 12 - regionStats.hot * 4, 0, 100);
    return {
      key,
      label: REGIONS[key].label,
      color: REGIONS[key].color,
      installs: regionStats.installs,
      equipments: regionStats.equipments,
      overdue: regionStats.overdue,
      blocked: regionStats.blocked,
      hot: regionStats.hot,
      score,
    };
  });

  let maxPhaseCount = 1;
  const phaseRows = PHASES.map((phase) => {
    const count = phaseCount[phase.key] ?? 0;
    if (count > maxPhaseCount) maxPhaseCount = count;
    return { ...phase, count };
  });

  return {
    total,
    wip,
    released,
    overdue,
    dueSoon,
    stale,
    blocked,
    hot,
    avgUtilization,
    healthScore,
    phaseRows,
    maxPhaseCount,
    regionRows,
    queue: buildQueue(overdue, blocked, dueSoon, stale, hot, today, nowMs),
    briefLines: buildBriefLines(overdue, blocked, dueSoon, hot),
  };
}
