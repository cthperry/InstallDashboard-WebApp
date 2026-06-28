import { PHASES, REGIONS } from "@/domain/constants";
import type { Equipment, Installation, RegionKey } from "@/domain/types";
import { toDisplayShortName } from "@/domain/personDisplay";
import { daysLeft } from "@/features/dashboard/dashboardViewUtils";

export type InstallationDueRow = Installation & {
  dl: number;
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
  regionProductStats: Array<{
    key: RegionKey;
    label: string;
    color: string;
    products: Array<{ name: string; cap: number }>;
  }>;
};

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
    regionProductStats,
  };
}
