import { getLiveUtilization } from "@/domain/capacity";
import { isActiveEquipmentBlocking, normalizeEquipmentBlockingStatus } from "@/domain/equipmentBlocking";
import {
  doesInstallationPhaseRequireEngineer,
  doesInstallationPhaseRequireSerial,
} from "@/domain/installationContract";
import { getInstallationSerial } from "@/domain/installationDisplay";
import { toDisplayShortName } from "@/domain/personDisplay";
import type { Equipment, Installation } from "@/domain/types";
import { getInstallSlaStatus } from "@/features/dashboard/installSla";
import { todayInTaipeiYmd } from "@/lib/utils";

export type GovernanceIssueTone = "critical" | "warning" | "info" | "good";

export type GovernanceIssueRow = {
  id: string;
  label: string;
  count: number;
  tone: GovernanceIssueTone;
  detail: string;
};

export type DashboardGovernanceReport = {
  score: number;
  tone: GovernanceIssueTone;
  activeInstallations: number;
  equipments: number;
  totalIssues: number;
  criticalIssues: number;
  issueRows: GovernanceIssueRow[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSinceTimestamp(timestamp?: number): number | null {
  if (!timestamp) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS));
}

function countBy<T>(rows: T[], predicate: (row: T) => boolean): number {
  return rows.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0);
}

function getReportTone(score: number): GovernanceIssueTone {
  if (score >= 88) return "good";
  if (score >= 72) return "info";
  if (score >= 55) return "warning";
  return "critical";
}

function getIssueTone(count: number, critical = false): GovernanceIssueTone {
  if (count <= 0) return "good";
  return critical ? "critical" : "warning";
}

function buildIssueRows(installations: Installation[], equipments: Equipment[]): GovernanceIssueRow[] {
  const today = todayInTaipeiYmd();
  const activeInstallations = installations.filter((row) => row.phase !== "released");
  const activeBlockingRows = equipments.filter((row) => isActiveEquipmentBlocking(row.blocking));
  const reopenedBlockingRows = activeBlockingRows.filter((row) => (
    row.blocking ? normalizeEquipmentBlockingStatus(row.blocking.status) === "reopened" : false
  ));

  const missingSerial = countBy(activeInstallations, (row) => doesInstallationPhaseRequireSerial(row.phase) && !getInstallationSerial(row));
  const missingEngineer = countBy(activeInstallations, (row) => doesInstallationPhaseRequireEngineer(row.phase) && !toDisplayShortName(row.engineer));
  const missingEta = countBy(activeInstallations, (row) => row.phase !== "ordered" && !row.estComplete);
  const missingNextAction = countBy(activeInstallations, (row) => !row.nextAction || !toDisplayShortName(row.nextOwner || row.engineer) || !(row.nextDueDate || row.estComplete));
  const nextDueOverdue = countBy(activeInstallations, (row) => Boolean(row.nextDueDate && row.nextDueDate < today));
  const slaBreached = countBy(activeInstallations, (row) => getInstallSlaStatus(row, today).status === "breached");
  const staleRows = countBy(activeInstallations, (row) => {
    const staleDays = daysSinceTimestamp(row.updatedAt);
    return staleDays != null && staleDays >= 7;
  });
  const highUtilization = countBy(equipments, (row) => getLiveUtilization(row.capacity) >= 85);

  return [
    {
      id: "missing-serial",
      label: "缺機台序號",
      count: missingSerial,
      tone: getIssueTone(missingSerial, true),
      detail: "到廠後階段需要序號才能建立可追溯的裝機與設備關聯。",
    },
    {
      id: "missing-engineer",
      label: "缺工程師",
      count: missingEngineer,
      tone: getIssueTone(missingEngineer, true),
      detail: "出貨後階段需要 owner，否則任務無法被 engineer 接手。",
    },
    {
      id: "missing-eta",
      label: "缺預計完成日",
      count: missingEta,
      tone: getIssueTone(missingEta),
      detail: "非訂單階段應維護 ETA，才能進入逾期與 cycle time 管控。",
    },
    {
      id: "missing-next-action",
      label: "缺下一步治理",
      count: missingNextAction,
      tone: getIssueTone(missingNextAction),
      detail: "進行中案件應有下一步、owner 與期限，避免卡在口頭追蹤。",
    },
    {
      id: "next-due-overdue",
      label: "下一步逾期",
      count: nextDueOverdue,
      tone: getIssueTone(nextDueOverdue, true),
      detail: "下一步期限已過，需在 War Room 或任務流中更新處置。",
    },
    {
      id: "sla-breached",
      label: "SLA 逾期",
      count: slaBreached,
      tone: getIssueTone(slaBreached, true),
      detail: "目前階段停留時間超過 SLA，需補 owner、原因與下一步。",
    },
    {
      id: "stale-updates",
      label: "久未更新",
      count: staleRows,
      tone: getIssueTone(staleRows),
      detail: "進行中案件超過 7 天未更新，容易造成晨會資訊失真。",
    },
    {
      id: "equipment-blocking",
      label: "設備阻塞中",
      count: activeBlockingRows.length,
      tone: getIssueTone(activeBlockingRows.length, true),
      detail: "設備 blocking 仍未解決，會直接影響產能與客戶健康分數。",
    },
    {
      id: "equipment-reopened",
      label: "阻塞重開",
      count: reopenedBlockingRows.length,
      tone: getIssueTone(reopenedBlockingRows.length, true),
      detail: "重開的 blocking 代表處置未根治，需要 admin/owner 重新確認。",
    },
    {
      id: "high-utilization",
      label: "高稼動壓力",
      count: highUtilization,
      tone: getIssueTone(highUtilization),
      detail: "稼動率達 85% 以上的設備需提前關注維護與產能風險。",
    },
  ];
}

export function buildDashboardGovernanceReport(
  installations: Installation[],
  equipments: Equipment[],
): DashboardGovernanceReport {
  const activeInstallations = installations.filter((row) => row.phase !== "released");
  const issueRows = buildIssueRows(installations, equipments);
  const totalIssues = issueRows.reduce((sum, row) => sum + row.count, 0);
  const criticalIssues = issueRows
    .filter((row) => row.tone === "critical")
    .reduce((sum, row) => sum + row.count, 0);
  const score = Math.max(0, Math.min(100, 100 - criticalIssues * 9 - (totalIssues - criticalIssues) * 4));

  return {
    score,
    tone: getReportTone(score),
    activeInstallations: activeInstallations.length,
    equipments: equipments.length,
    totalIssues,
    criticalIssues,
    issueRows: issueRows.sort((a, b) => {
      if (a.tone === "critical" && b.tone !== "critical") return -1;
      if (a.tone !== "critical" && b.tone === "critical") return 1;
      return b.count - a.count;
    }),
  };
}
