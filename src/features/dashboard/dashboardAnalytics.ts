import { PHASES, REGIONS } from "@/domain/constants";
import { isActiveEquipmentBlocking } from "@/domain/equipmentBlocking";
import type { Equipment, Installation, RegionKey } from "@/domain/types";
import { toDisplayShortName } from "@/domain/personDisplay";
import { daysLeft, getInstallModelSerial } from "@/features/dashboard/dashboardViewUtils";
import { getInstallSlaStatus } from "@/features/dashboard/installSla";

export type InstallationDueRow = Installation & {
  dl: number;
};

export type InstallationCycleTimeRow = {
  id: string;
  title: string;
  customer: string;
  modelCode: string;
  days: number;
  completedAt: string;
};

export type InstallationCycleTimeStats = {
  completedCount: number;
  avgDays: number;
  p50Days: number;
  longestRows: InstallationCycleTimeRow[];
};

export type PhaseAgingRow = {
  key: string;
  label: string;
  color: string;
  count: number;
  avgAgeDays: number;
  maxAgeDays: number;
  breached: number;
};

export type DashboardHealthRow = {
  name: string;
  installs: number;
  activeInstalls: number;
  equipments: number;
  overdue: number;
  blocked: number;
  avgProgress: number;
  health: number;
};

export type DashboardAnalytics = {
  phase: {
    total: number;
    by: Record<string, number>;
  };
  region: Array<{
    key: RegionKey;
    label: string;
    color: string;
    total: number;
    avg: number;
    rows: Installation[];
  }>;
  engineer: Array<{
    name: string;
    total: number;
    active: number;
    pct: number;
  }>;
  due: InstallationDueRow[];
  cycleTime: InstallationCycleTimeStats;
  phaseAging: PhaseAgingRow[];
  customerHealth: DashboardHealthRow[];
  modelHealth: DashboardHealthRow[];
  regionProductStats: Array<{
    key: RegionKey;
    label: string;
    color: string;
    products: Array<{ name: string; cap: number }>;
  }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseYmd(value?: string | null): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function daysBetweenYmd(startYmd?: string | null, endYmd?: string | null): number | null {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

function averageRounded(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function medianRounded(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function clampHealth(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

type HealthBucket = {
  installs: number;
  activeInstalls: number;
  equipments: number;
  overdue: number;
  blocked: number;
  progressTotal: number;
};

type PhaseAgingAccumulator = {
  count: number;
  totalAgeDays: number;
  maxAgeDays: number;
  breached: number;
};

type RegionAccumulator = {
  rows: Installation[];
  progressTotal: number;
  total: number;
};

type EngineerAccumulator = {
  total: number;
  active: number;
};

type AnalyticsAccumulator = {
  by: Record<string, number>;
  region: Record<RegionKey, RegionAccumulator>;
  engineer: Map<string, EngineerAccumulator>;
  due: InstallationDueRow[];
  cycleRows: InstallationCycleTimeRow[];
  cycleDays: number[];
  phaseAging: Record<string, PhaseAgingAccumulator>;
  customerHealth: Map<string, HealthBucket>;
  modelHealth: Map<string, HealthBucket>;
};

function createHealthBucket(): HealthBucket {
  return {
    installs: 0,
    activeInstalls: 0,
    equipments: 0,
    overdue: 0,
    blocked: 0,
    progressTotal: 0,
  };
}

function ensureHealthBucket(map: Map<string, HealthBucket>, name: string): HealthBucket {
  const key = name.trim() || "未指定";
  const existing = map.get(key);
  if (existing) return existing;
  const next = createHealthBucket();
  map.set(key, next);
  return next;
}

function createAnalyticsAccumulator(): AnalyticsAccumulator {
  const by: Record<string, number> = {};
  const phaseAging: Record<string, PhaseAgingAccumulator> = {};
  for (const phase of PHASES) {
    by[phase.key] = 0;
    phaseAging[phase.key] = { count: 0, totalAgeDays: 0, maxAgeDays: 0, breached: 0 };
  }

  const region = {} as Record<RegionKey, RegionAccumulator>;
  for (const key of Object.keys(REGIONS) as RegionKey[]) {
    region[key] = { rows: [], progressTotal: 0, total: 0 };
  }

  return {
    by,
    region,
    engineer: new Map(),
    due: [],
    cycleRows: [],
    cycleDays: [],
    phaseAging,
    customerHealth: new Map(),
    modelHealth: new Map(),
  };
}

function addInstallationToAccumulator(acc: AnalyticsAccumulator, row: Installation): void {
  const isActive = row.phase !== "released";
  acc.by[row.phase] = (acc.by[row.phase] ?? 0) + 1;

  const regionBucket = acc.region[row.region];
  regionBucket.total += 1;
  regionBucket.progressTotal += row.progress ?? 0;
  if (regionBucket.rows.length < 10) regionBucket.rows.push(row);

  const engineerName = toDisplayShortName(row.engineer);
  const engineerBucket = acc.engineer.get(engineerName) ?? { total: 0, active: 0 };
  engineerBucket.total += 1;
  if (isActive) engineerBucket.active += 1;
  acc.engineer.set(engineerName, engineerBucket);

  const overdue = isActive && row.estComplete ? daysLeft(row.estComplete) : null;
  if (overdue != null && overdue < 14) {
    acc.due.push({ ...row, dl: overdue });
  }

  if (row.actComplete) {
    const startDate = row.orderDate || row.estArrival || row.actArrival;
    const days = daysBetweenYmd(startDate, row.actComplete);
    if (days != null) {
      acc.cycleDays.push(days);
      acc.cycleRows.push({
        id: row.id,
        title: getInstallModelSerial(row),
        customer: row.customer,
        modelCode: row.modelCode,
        days,
        completedAt: row.actComplete,
      });
    }
  }

  if (isActive) {
    const sla = getInstallSlaStatus(row);
    const agingBucket = acc.phaseAging[row.phase];
    agingBucket.count += 1;
    agingBucket.totalAgeDays += sla.agingDays;
    agingBucket.maxAgeDays = Math.max(agingBucket.maxAgeDays, sla.agingDays);
    if (sla.status === "breached") agingBucket.breached += 1;
  }

  for (const bucket of [
    ensureHealthBucket(acc.customerHealth, row.customer),
    ensureHealthBucket(acc.modelHealth, row.modelCode),
  ]) {
    bucket.installs += 1;
    bucket.progressTotal += row.progress ?? 0;
    if (isActive) {
      bucket.activeInstalls += 1;
      if (row.estComplete) {
        const dl = daysLeft(row.estComplete);
        if (dl != null && dl < 0) bucket.overdue += 1;
      }
    }
  }
}

function buildHealthRows(map: Map<string, HealthBucket>): DashboardHealthRow[] {
  return [...map.entries()]
    .map(([name, value]) => {
      const avgProgress = value.installs ? Math.round(value.progressTotal / value.installs) : 0;
      const loadPenalty = Math.min(18, Math.max(0, value.activeInstalls - 3) * 3);
      const progressPenalty = Math.max(0, 70 - avgProgress) * 0.25;
      const health = clampHealth(100 - value.overdue * 14 - value.blocked * 16 - loadPenalty - progressPenalty);

      return {
        name,
        installs: value.installs,
        activeInstalls: value.activeInstalls,
        equipments: value.equipments,
        overdue: value.overdue,
        blocked: value.blocked,
        avgProgress,
        health,
      };
    })
    .sort((a, b) => {
      const riskDiff = b.overdue + b.blocked - (a.overdue + a.blocked);
      if (riskDiff !== 0) return riskDiff;
      return b.installs + b.equipments - (a.installs + a.equipments);
    })
    .slice(0, 8);
}

function buildRegionRows(acc: AnalyticsAccumulator): DashboardAnalytics["region"] {
  return (Object.keys(REGIONS) as RegionKey[]).map((key) => {
    const regionMeta = REGIONS[key];
    const bucket = acc.region[key];
    return {
      key,
      label: regionMeta.label,
      color: regionMeta.color,
      total: bucket.total,
      avg: bucket.total ? Math.round(bucket.progressTotal / bucket.total) : 0,
      rows: bucket.rows,
    };
  });
}

function buildEngineerRows(acc: AnalyticsAccumulator, engineers: string[], totalInstallations: number): DashboardAnalytics["engineer"] {
  const engineerTotal = totalInstallations || 1;
  return engineers.map((name) => {
    const bucket = acc.engineer.get(name);
    const total = bucket?.total ?? 0;
    return {
      name,
      total,
      active: bucket?.active ?? 0,
      pct: Math.round((total / engineerTotal) * 100),
    };
  });
}

function buildCycleTimeStatsFromAccumulator(acc: AnalyticsAccumulator): InstallationCycleTimeStats {
  return {
    completedCount: acc.cycleRows.length,
    avgDays: averageRounded(acc.cycleDays),
    p50Days: medianRounded(acc.cycleDays),
    longestRows: [...acc.cycleRows].sort((a, b) => b.days - a.days).slice(0, 5),
  };
}

function buildPhaseAgingStatsFromAccumulator(acc: AnalyticsAccumulator): PhaseAgingRow[] {
  return PHASES.filter((phase) => phase.key !== "released").map((phase) => {
    const bucket = acc.phaseAging[phase.key];
    return {
      key: phase.key,
      label: phase.label,
      color: phase.color,
      count: bucket.count,
      avgAgeDays: bucket.count ? Math.round(bucket.totalAgeDays / bucket.count) : 0,
      maxAgeDays: bucket.maxAgeDays,
      breached: bucket.breached,
    };
  });
}

export function buildDashboardAnalytics({
  installations,
  equipments,
  engineers,
}: {
  installations: Installation[];
  equipments: Equipment[];
  engineers: string[];
}): DashboardAnalytics {
  const acc = createAnalyticsAccumulator();
  const total = installations.length;
  for (const row of installations) addInstallationToAccumulator(acc, row);

  type RegionProductEntry = { label: string; color: string; productMap: Record<string, number> };
  const regionProductMap: Partial<Record<RegionKey, RegionProductEntry>> = {};
  for (const equipment of equipments) {
    const blocked = isActiveEquipmentBlocking(equipment.blocking);
    for (const bucket of [
      ensureHealthBucket(acc.customerHealth, equipment.customer),
      ensureHealthBucket(acc.modelHealth, equipment.modelCode),
    ]) {
      bucket.equipments += 1;
      if (blocked) bucket.blocked += 1;
    }

    if ((equipment.products ?? []).length === 0) continue;
    const regionKey = equipment.region;
    const regionMeta = REGIONS[regionKey];
    regionProductMap[regionKey] ??= { label: regionMeta.label, color: regionMeta.color, productMap: {} };
    for (const product of equipment.products ?? []) {
      const productName = product.name.trim();
      if (!productName) continue;
      regionProductMap[regionKey].productMap[productName] =
        (regionProductMap[regionKey].productMap[productName] ?? 0) + product.dailyCap;
    }
  }

  const regionProductStats = (Object.entries(regionProductMap) as Array<[RegionKey, RegionProductEntry]>).map(([key, value]) => ({
    key,
    label: value.label,
    color: value.color,
    products: Object.entries(value.productMap)
      .map(([name, cap]) => ({ name, cap }))
      .sort((a, b) => b.cap - a.cap),
  }));

  return {
    phase: { total, by: acc.by },
    region: buildRegionRows(acc),
    engineer: buildEngineerRows(acc, engineers, total),
    due: acc.due.sort((a, b) => a.dl - b.dl),
    cycleTime: buildCycleTimeStatsFromAccumulator(acc),
    phaseAging: buildPhaseAgingStatsFromAccumulator(acc),
    customerHealth: buildHealthRows(acc.customerHealth),
    modelHealth: buildHealthRows(acc.modelHealth),
    regionProductStats,
  };
}
