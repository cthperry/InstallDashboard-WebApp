import { PHASE_MAP } from "@/domain/constants";
import type { Equipment, Installation } from "@/domain/types";
import {
  doesInstallationPhaseRequireEngineer,
  doesInstallationPhaseRequireSerial,
} from "@/domain/installationContract";
import { getInstallationSerial, getInstallationTaskTitle } from "@/domain/installationDisplay";
import { toDisplayShortName } from "@/domain/personDisplay";
import { getLiveUtilization } from "@/domain/capacity";
import { isActiveEquipmentBlocking } from "@/domain/equipmentBlocking";
import { getEquipmentSerialLabel } from "@/features/dashboard/dashboardFilters";
import { getInstallSlaStatus } from "@/features/dashboard/installSla";
import { todayInTaipeiYmd } from "@/lib/utils";

export type MissionQueueTone = "critical" | "warning" | "info" | "good";

export type DashboardQueueEntry = {
  id: string;
  targetId: string;
  label: string;
  meta: string;
  value: string;
  tone: MissionQueueTone;
  priority: number;
};

function daysSinceTimestamp(ts?: number): number {
  if (!ts) return 999;
  return Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
}

function hasGovernanceFields(row: Installation): boolean {
  return Boolean(toDisplayShortName(row.nextOwner || row.engineer) && (row.nextDueDate || row.estComplete));
}

function calcCapacityLevel(uph: number, targetUph: number): "綠" | "黃" | "紅" {
  if (targetUph <= 0) return "綠";
  const ratio = uph / targetUph;
  if (ratio >= 0.8) return "紅";
  if (ratio >= 0.3) return "黃";
  return "綠";
}

export function buildInstallActionQueue(rows: Installation[]): DashboardQueueEntry[] {
  const today = todayInTaipeiYmd();
  const queue: DashboardQueueEntry[] = [];

  for (const row of rows) {
    if (row.phase === "released") continue;
    const phaseLabel = PHASE_MAP[row.phase]?.label ?? row.phase;
    const owner = toDisplayShortName(row.nextOwner || row.engineer) || "未指派";
    const meta = `${row.customer} · ${phaseLabel} · ${owner}`;
    const serial = getInstallationSerial(row);
    const label = getInstallationTaskTitle(row);

    if (doesInstallationPhaseRequireSerial(row.phase) && !serial) {
      queue.push({
        id: `install-serial-${row.id}`,
        targetId: row.id,
        label,
        meta,
        value: "缺序號",
        tone: "critical",
        priority: 0,
      });
      continue;
    }

    if (!toDisplayShortName(row.engineer) && doesInstallationPhaseRequireEngineer(row.phase)) {
      queue.push({
        id: `install-owner-${row.id}`,
        targetId: row.id,
        label,
        meta,
        value: "未指派",
        tone: "warning",
        priority: 10,
      });
      continue;
    }

    const sla = getInstallSlaStatus(row);
    if (sla.status === "breached") {
      const missingGovernance = !hasGovernanceFields(row);
      const missingReason = !row.overdueReason;
      queue.push({
        id: `install-sla-${row.id}`,
        targetId: row.id,
        label,
        meta: `${meta} · ${sla.basisLabel}${sla.basisDate ? ` ${sla.basisDate}` : ""}`,
        value: missingGovernance || missingReason ? `${sla.label} · 缺治理` : sla.label,
        tone: "critical",
        priority: (missingGovernance || missingReason ? 5 : 15) - Math.abs(sla.remainingDays),
      });
      continue;
    }

    if (!row.estComplete && row.phase !== "ordered") {
      queue.push({
        id: `install-date-${row.id}`,
        targetId: row.id,
        label,
        meta,
        value: "缺預計日",
        tone: "warning",
        priority: 20,
      });
      continue;
    }

    if (row.nextDueDate && row.nextDueDate < today) {
      queue.push({
        id: `install-next-due-${row.id}`,
        targetId: row.id,
        label,
        meta: `${meta} · ${row.nextAction || "下一步未描述"}`,
        value: "下一步逾期",
        tone: "critical",
        priority: 18,
      });
      continue;
    }

    if (sla.status === "warning") {
      queue.push({
        id: `install-sla-warning-${row.id}`,
        targetId: row.id,
        label,
        meta,
        value: sla.label,
        tone: "warning",
        priority: 25 + sla.remainingDays,
      });
      continue;
    }

    const staleDays = daysSinceTimestamp(row.updatedAt);
    if (staleDays >= 7) {
      queue.push({
        id: `install-stale-${row.id}`,
        targetId: row.id,
        label,
        meta,
        value: `${staleDays} 天未更新`,
        tone: "info",
        priority: 30 + staleDays,
      });
    }
  }

  return queue.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

export function buildEquipmentActionQueue(
  rows: Equipment[],
  regionLabel: (region: Equipment["region"]) => string,
): DashboardQueueEntry[] {
  const queue: DashboardQueueEntry[] = [];

  for (const row of rows) {
    const utilization = getLiveUtilization(row.capacity);
    const liveLevel = calcCapacityLevel(row.capacity.uph, row.capacity.targetUph);
    const serial = getEquipmentSerialLabel(row) || row.equipmentId || row.id;
    const meta = `${row.customer} · ${regionLabel(row.region)} · ${toDisplayShortName(row.owner) || "未指派"}`;
    const blocking = row.blocking;

    if (isActiveEquipmentBlocking(blocking)) {
      queue.push({
        id: `equipment-blocked-${row.id}`,
        targetId: row.id,
        label: serial,
        meta: `${meta} · ${blocking.reasonCode}`,
        value: "阻塞",
        tone: "critical",
        priority: 0,
      });
      continue;
    }

    if (liveLevel === "紅") {
      queue.push({
        id: `equipment-capacity-${row.id}`,
        targetId: row.id,
        label: serial,
        meta,
        value: `紅燈 ${utilization}%`,
        tone: "warning",
        priority: 10 + (100 - utilization),
      });
      continue;
    }

    if (utilization >= 80) {
      queue.push({
        id: `equipment-util-${row.id}`,
        targetId: row.id,
        label: serial,
        meta,
        value: `高稼動 ${utilization}%`,
        tone: "info",
        priority: 30 + (100 - utilization),
      });
    }
  }

  return queue.sort((a, b) => a.priority - b.priority).slice(0, 5);
}
