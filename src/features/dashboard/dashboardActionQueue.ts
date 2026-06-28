import { PHASE_MAP } from "@/domain/constants";
import type { Equipment, Installation } from "@/domain/types";
import {
  doesInstallationPhaseRequireEngineer,
  doesInstallationPhaseRequireSerial,
} from "@/domain/installationContract";
import { getInstallationSerial, getInstallationTaskTitle } from "@/domain/installationDisplay";
import { toDisplayShortName } from "@/domain/personDisplay";
import { getLiveUtilization } from "@/domain/capacity";
import { getEquipmentSerialLabel } from "@/features/dashboard/dashboardFilters";

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

function calcCapacityLevel(uph: number, targetUph: number): "綠" | "黃" | "紅" {
  if (targetUph <= 0) return "綠";
  const ratio = uph / targetUph;
  if (ratio >= 0.8) return "紅";
  if (ratio >= 0.3) return "黃";
  return "綠";
}

export function buildInstallActionQueue(rows: Installation[]): DashboardQueueEntry[] {
  return rows
    .map((row): DashboardQueueEntry | null => {
      if (row.phase === "released") return null;
      const phaseLabel = PHASE_MAP[row.phase]?.label ?? row.phase;
      const owner = toDisplayShortName(row.engineer) || "未指派";
      const meta = `${row.customer} · ${phaseLabel} · ${owner}`;
      const serial = getInstallationSerial(row);
      const label = getInstallationTaskTitle(row);

      if (doesInstallationPhaseRequireSerial(row.phase) && !serial) {
        return {
          id: `install-serial-${row.id}`,
          targetId: row.id,
          label,
          meta,
          value: "缺序號",
          tone: "critical",
          priority: 0,
        };
      }

      if (!toDisplayShortName(row.engineer) && doesInstallationPhaseRequireEngineer(row.phase)) {
        return {
          id: `install-owner-${row.id}`,
          targetId: row.id,
          label,
          meta,
          value: "未指派",
          tone: "warning",
          priority: 10,
        };
      }

      if (!row.estComplete && row.phase !== "ordered") {
        return {
          id: `install-date-${row.id}`,
          targetId: row.id,
          label,
          meta,
          value: "缺預計日",
          tone: "warning",
          priority: 20,
        };
      }

      const staleDays = daysSinceTimestamp(row.updatedAt);
      if (staleDays >= 7) {
        return {
          id: `install-stale-${row.id}`,
          targetId: row.id,
          label,
          meta,
          value: `${staleDays} 天未更新`,
          tone: "info",
          priority: 30 + staleDays,
        };
      }

      return null;
    })
    .filter((item): item is DashboardQueueEntry => Boolean(item))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);
}

export function buildEquipmentActionQueue(
  rows: Equipment[],
  regionLabel: (region: Equipment["region"]) => string,
): DashboardQueueEntry[] {
  return rows
    .map((row): DashboardQueueEntry | null => {
      const utilization = getLiveUtilization(row.capacity);
      const liveLevel = calcCapacityLevel(row.capacity.uph, row.capacity.targetUph);
      const serial = getEquipmentSerialLabel(row) || row.equipmentId || row.id;
      const meta = `${row.customer} · ${regionLabel(row.region)} · ${toDisplayShortName(row.owner) || "未指派"}`;

      if (row.blocking?.reasonCode) {
        return {
          id: `equipment-blocked-${row.id}`,
          targetId: row.id,
          label: serial,
          meta: `${meta} · ${row.blocking.reasonCode}`,
          value: "阻塞",
          tone: "critical",
          priority: 0,
        };
      }

      if (liveLevel === "紅") {
        return {
          id: `equipment-capacity-${row.id}`,
          targetId: row.id,
          label: serial,
          meta,
          value: `紅燈 ${utilization}%`,
          tone: "warning",
          priority: 10 + (100 - utilization),
        };
      }

      if (utilization >= 80) {
        return {
          id: `equipment-util-${row.id}`,
          targetId: row.id,
          label: serial,
          meta,
          value: `高稼動 ${utilization}%`,
          tone: "info",
          priority: 30 + (100 - utilization),
        };
      }

      return null;
    })
    .filter((item): item is DashboardQueueEntry => Boolean(item))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);
}
