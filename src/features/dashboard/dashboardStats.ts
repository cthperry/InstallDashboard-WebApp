import type { CapacityLevel, Equipment, EquipmentMainStatus, Installation, PhaseKey } from "@/domain/types";
import { getLiveUtilization } from "@/domain/capacity";
import { getEquipmentBlockingAgeDays, isActiveEquipmentBlocking, normalizeEquipmentBlockingStatus } from "@/domain/equipmentBlocking";

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

export function isOverdueInstall(row: Installation, today: string): boolean {
  const due = safeStr(row.estComplete);
  if (!due) return false;
  if (safeStr(row.phase) === "released") return false;
  return due < today;
}

export function calcInstallStats(rows: Installation[], today: string) {
  const total = rows.length;
  const wip = rows.filter((row) => row.phase !== "released").length;
  const released = rows.filter((row) => row.phase === "released").length;
  const overdue = rows.filter((row) => isOverdueInstall(row, today)).length;
  const avgProg = total ? Math.round(rows.reduce((sum, row) => sum + (row.progress ?? 0), 0) / total) : 0;
  const byPhase: Record<PhaseKey, number> = {
    ordered: 0,
    shipping: 0,
    arrived: 0,
    installing: 0,
    trial: 0,
    qual: 0,
    released: 0,
  };
  for (const row of rows) byPhase[row.phase] = (byPhase[row.phase] ?? 0) + 1;
  return { total, wip, released, overdue, avgProg, byPhase };
}

// Capacity risk: red means heavily loaded, green means capacity is available.
export function calcCapacityLevel(uph: number, targetUph: number): CapacityLevel {
  if (targetUph <= 0) return "綠";
  const ratio = uph / targetUph;
  if (ratio >= 0.8) return "紅";
  if (ratio >= 0.3) return "黃";
  return "綠";
}

export function calcEquipmentStats(rows: Equipment[]) {
  const total = rows.length;
  const avgUtil = total ? Math.round(rows.reduce((sum, row) => sum + getLiveUtilization(row.capacity), 0) / total) : 0;
  const byStatus: Record<EquipmentMainStatus, number> = { "裝機": 0, "試產": 0, "正式生產中": 0 };
  const byCap: Record<CapacityLevel, number> = { "綠": 0, "黃": 0, "紅": 0 };
  let blocked = 0;
  let resolvedBlocking = 0;
  let blockingDaysTotal = 0;
  let blockingDaysCount = 0;
  for (const row of rows) {
    byStatus[row.statusMain] = (byStatus[row.statusMain] ?? 0) + 1;
    const liveLevel = calcCapacityLevel(Number(row.capacity.uph), Number(row.capacity.targetUph));
    byCap[liveLevel] = (byCap[liveLevel] ?? 0) + 1;
    if (isActiveEquipmentBlocking(row.blocking)) blocked++;
    if (row.blocking?.reasonCode && normalizeEquipmentBlockingStatus(row.blocking.status) === "resolved") resolvedBlocking++;
    const blockingDays = getEquipmentBlockingAgeDays(row.blocking);
    if (blockingDays != null) {
      blockingDaysTotal += blockingDays;
      blockingDaysCount++;
    }
  }
  const avgBlockingDays = blockingDaysCount ? Math.round(blockingDaysTotal / blockingDaysCount) : 0;
  return { total, avgUtil, byStatus, byCap, blocked, resolvedBlocking, avgBlockingDays };
}
