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

type GovernanceIssueCounts = {
  activeInstallations: number;
  missingSerial: number;
  missingEngineer: number;
  missingEta: number;
  missingNextAction: number;
  nextDueOverdue: number;
  slaBreached: number;
  staleRows: number;
  activeBlockingRows: number;
  reopenedBlockingRows: number;
  highUtilization: number;
};

function createGovernanceIssueCounts(): GovernanceIssueCounts {
  return {
    activeInstallations: 0,
    missingSerial: 0,
    missingEngineer: 0,
    missingEta: 0,
    missingNextAction: 0,
    nextDueOverdue: 0,
    slaBreached: 0,
    staleRows: 0,
    activeBlockingRows: 0,
    reopenedBlockingRows: 0,
    highUtilization: 0,
  };
}

function collectGovernanceIssueCounts(installations: Installation[], equipments: Equipment[]): GovernanceIssueCounts {
  const today = todayInTaipeiYmd();
  const counts = createGovernanceIssueCounts();

  for (const row of installations) {
    if (row.phase === "released") continue;
    counts.activeInstallations += 1;
    if (doesInstallationPhaseRequireSerial(row.phase) && !getInstallationSerial(row)) counts.missingSerial += 1;
    if (doesInstallationPhaseRequireEngineer(row.phase) && !toDisplayShortName(row.engineer)) counts.missingEngineer += 1;
    if (row.phase !== "ordered" && !row.estComplete) counts.missingEta += 1;
    if (!row.nextAction || !toDisplayShortName(row.nextOwner || row.engineer) || !(row.nextDueDate || row.estComplete)) counts.missingNextAction += 1;
    if (row.nextDueDate && row.nextDueDate < today) counts.nextDueOverdue += 1;
    if (getInstallSlaStatus(row, today).status === "breached") counts.slaBreached += 1;
    const staleDays = daysSinceTimestamp(row.updatedAt);
    if (staleDays != null && staleDays >= 7) counts.staleRows += 1;
  }

  for (const row of equipments) {
    if (isActiveEquipmentBlocking(row.blocking)) {
      counts.activeBlockingRows += 1;
      if (row.blocking && normalizeEquipmentBlockingStatus(row.blocking.status) === "reopened") {
        counts.reopenedBlockingRows += 1;
      }
    }
    if (getLiveUtilization(row.capacity) >= 85) counts.highUtilization += 1;
  }

  return counts;
}

function buildIssueRows(counts: GovernanceIssueCounts): GovernanceIssueRow[] {
  return [
    {
      id: "missing-serial",
      label: "缺機台序號",
      count: counts.missingSerial,
      tone: getIssueTone(counts.missingSerial, true),
      detail: "到廠後階段需要序號才能建立可追溯的裝機與設備關聯。",
    },
    {
      id: "missing-engineer",
      label: "缺工程師",
      count: counts.missingEngineer,
      tone: getIssueTone(counts.missingEngineer, true),
      detail: "出貨後階段需要 owner，否則任務無法被 engineer 接手。",
    },
    {
      id: "missing-eta",
      label: "缺預計完成日",
      count: counts.missingEta,
      tone: getIssueTone(counts.missingEta),
      detail: "非訂單階段應維護 ETA，才能進入逾期與 cycle time 管控。",
    },
    {
      id: "missing-next-action",
      label: "缺下一步治理",
      count: counts.missingNextAction,
      tone: getIssueTone(counts.missingNextAction),
      detail: "進行中案件應有下一步、owner 與期限，避免卡在口頭追蹤。",
    },
    {
      id: "next-due-overdue",
      label: "下一步逾期",
      count: counts.nextDueOverdue,
      tone: getIssueTone(counts.nextDueOverdue, true),
      detail: "下一步期限已過，需在 War Room 或任務流中更新處置。",
    },
    {
      id: "sla-breached",
      label: "SLA 逾期",
      count: counts.slaBreached,
      tone: getIssueTone(counts.slaBreached, true),
      detail: "目前階段停留時間超過 SLA，需補 owner、原因與下一步。",
    },
    {
      id: "stale-updates",
      label: "久未更新",
      count: counts.staleRows,
      tone: getIssueTone(counts.staleRows),
      detail: "進行中案件超過 7 天未更新，容易造成晨會資訊失真。",
    },
    {
      id: "equipment-blocking",
      label: "設備阻塞中",
      count: counts.activeBlockingRows,
      tone: getIssueTone(counts.activeBlockingRows, true),
      detail: "設備 blocking 仍未解決，會直接影響產能與客戶健康分數。",
    },
    {
      id: "equipment-reopened",
      label: "阻塞重開",
      count: counts.reopenedBlockingRows,
      tone: getIssueTone(counts.reopenedBlockingRows, true),
      detail: "重開的 blocking 代表處置未根治，需要 admin/owner 重新確認。",
    },
    {
      id: "high-utilization",
      label: "高稼動壓力",
      count: counts.highUtilization,
      tone: getIssueTone(counts.highUtilization),
      detail: "稼動率達 85% 以上的設備需提前關注維護與產能風險。",
    },
  ];
}

export function buildDashboardGovernanceReport(
  installations: Installation[],
  equipments: Equipment[],
): DashboardGovernanceReport {
  const counts = collectGovernanceIssueCounts(installations, equipments);
  const issueRows = buildIssueRows(counts);
  let totalIssues = 0;
  let criticalIssues = 0;
  for (const row of issueRows) {
    totalIssues += row.count;
    if (row.tone === "critical") criticalIssues += row.count;
  }
  const score = Math.max(0, Math.min(100, 100 - criticalIssues * 9 - (totalIssues - criticalIssues) * 4));

  return {
    score,
    tone: getReportTone(score),
    activeInstallations: counts.activeInstallations,
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
