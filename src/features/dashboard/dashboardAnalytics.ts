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

function buildCycleTimeStats(installations: Installation[]): InstallationCycleTimeStats {
  const rows = installations.flatMap((row): InstallationCycleTimeRow[] => {
    if (!row.actComplete) return [];
    const startDate = row.orderDate || row.estArrival || row.actArrival;
    const days = daysBetweenYmd(startDate, row.actComplete);
    if (days == null) return [];
    return [{
      id: row.id,
      title: getInstallModelSerial(row),
      customer: row.customer,
      modelCode: row.modelCode,
      days,
      completedAt: row.actComplete,
    }];
  });
  const values = rows.map((row) => row.days);

  return {
    completedCount: rows.length,
    avgDays: averageRounded(values),
    p50Days: medianRounded(values),
    longestRows: [...rows].sort((a, b) => b.days - a.days).slice(0, 5),
  };
}

function buildPhaseAgingStats(installations: Installation[]): PhaseAgingRow[] {
  return PHASES.filter((phase) => phase.key !== "released").map((phase) => {
    const rows = installations.filter((row) => row.phase === phase.key);
    const slaRows = rows.map((row) => getInstallSlaStatus(row));
    const agingValues = slaRows.map((row) => row.agingDays);
    return {
      key: phase.key,
      label: phase.label,
      color: phase.color,
      count: rows.length,
      avgAgeDays: averageRounded(agingValues),
      maxAgeDays: agingValues.length ? Math.max(...agingValues) : 0,
      breached: slaRows.filter((row) => row.status === "breached").length,
    };
  });
}

type HealthDimension = "customer" | "modelCode";

type HealthAccumulator = {
  installations: Installation[];
  equipments: Equipment[];
};

function buildHealthRows(
  installations: Installation[],
  equipments: Equipment[],
  dimension: HealthDimension,
): DashboardHealthRow[] {
  const map = new Map<string, HealthAccumulator>();
  const ensure = (name: string) => {
    const key = name.trim() || "未指定";
    const existing = map.get(key);
    if (existing) return existing;
    const next = { installations: [], equipments: [] };
    map.set(key, next);
    return next;
  };

  for (const row of installations) {
    ensure(dimension === "customer" ? row.customer : row.modelCode).installations.push(row);
  }
  for (const row of equipments) {
    ensure(dimension === "customer" ? row.customer : row.modelCode).equipments.push(row);
  }

  return [...map.entries()]
    .map(([name, value]) => {
      const activeInstalls = value.installations.filter((row) => row.phase !== "released");
      const overdue = activeInstalls.filter((row) => {
        const dl = row.estComplete ? daysLeft(row.estComplete) : null;
        return dl != null && dl < 0;
      }).length;
      const blocked = value.equipments.filter((row) => isActiveEquipmentBlocking(row.blocking)).length;
      const avgProgress = averageRounded(value.installations.map((row) => row.progress ?? 0));
      const loadPenalty = Math.min(18, Math.max(0, activeInstalls.length - 3) * 3);
      const progressPenalty = Math.max(0, 70 - avgProgress) * 0.25;
      const health = clampHealth(100 - overdue * 14 - blocked * 16 - loadPenalty - progressPenalty);

      return {
        name,
        installs: value.installations.length,
        activeInstalls: activeInstalls.length,
        equipments: value.equipments.length,
        overdue,
        blocked,
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

export function buildDashboardAnalytics({
  installations,
  equipments,
  engineers,
}: {
  installations: Installation[];
  equipments: Equipment[];
  engineers: string[];
}): DashboardAnalytics {
  const total = installations.length;
  const by: Record<string, number> = {};
  for (const phase of PHASES) by[phase.key] = 0;
  for (const row of installations) by[row.phase] = (by[row.phase] ?? 0) + 1;

  const region = (Object.keys(REGIONS) as RegionKey[]).map((key) => {
    const regionMeta = REGIONS[key];
    const rows = installations.filter((row) => row.region === key);
    const avg = rows.length ? Math.round(rows.reduce((sum, row) => sum + (row.progress ?? 0), 0) / rows.length) : 0;
    return { key, label: regionMeta.label, color: regionMeta.color, total: rows.length, avg, rows: rows.slice(0, 10) };
  });

  const engineerTotal = installations.length || 1;
  const engineer = engineers.map((name) => {
    const rows = installations.filter((row) => toDisplayShortName(row.engineer) === name);
    const active = rows.filter((row) => row.phase !== "released").length;
    const pct = Math.round((rows.length / engineerTotal) * 100);
    return { name, total: rows.length, active, pct };
  });

  const due = installations
    .filter((row) => row.phase !== "released" && row.estComplete)
    .map((row) => ({
      ...row,
      dl: daysLeft(row.estComplete || ""),
    }))
    .filter((row): row is InstallationDueRow => row.dl != null && row.dl < 14)
    .sort((a, b) => a.dl - b.dl);

  type RegionProductEntry = { label: string; color: string; productMap: Record<string, number> };
  const regionProductMap: Partial<Record<RegionKey, RegionProductEntry>> = {};
  for (const equipment of equipments) {
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
    phase: { total, by },
    region,
    engineer,
    due,
    cycleTime: buildCycleTimeStats(installations),
    phaseAging: buildPhaseAgingStats(installations),
    customerHealth: buildHealthRows(installations, equipments, "customer"),
    modelHealth: buildHealthRows(installations, equipments, "modelCode"),
    regionProductStats,
  };
}
