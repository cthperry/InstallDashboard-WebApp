import type { Equipment, Installation, PhaseKey, RegionKey } from "@/domain/types";
import { PHASE_MAP } from "@/domain/constants";
import { getLiveUtilization } from "@/domain/capacity";
import { getInstallationSerial } from "@/domain/installationDisplay";
import { toDisplayShortName } from "@/domain/personDisplay";

export type WarRoomMeetingMode = "morning" | "weekly";

export type WarRoomQueueItem = {
  id: string;
  title: string;
  meta: string;
  value: string;
};

export type WarRoomBriefInput = {
  mode: WarRoomMeetingMode;
  today: string;
  healthScore: number;
  total: number;
  wip: number;
  released: number;
  avgUtilization: number;
  overdue: Installation[];
  dueSoon: Installation[];
  stale: Installation[];
  blocked: Equipment[];
  hot: Equipment[];
  queue: WarRoomQueueItem[];
  phaseRows: Array<{ key: PhaseKey; label: string; count: number }>;
  regionRows: Array<{ key: RegionKey; label: string; installs: number; equipments: number; overdue: number; blocked: number; hot: number; score: number }>;
};

function installTitle(row: Installation): string {
  return getInstallationSerial(row) || row.modelCode || row.customer || row.id;
}

function installOwner(row: Installation): string {
  return toDisplayShortName(row.nextOwner || row.engineer) || "未指派";
}

function lineItems<T>(rows: T[], mapper: (row: T, index: number) => string, emptyText: string, max = 8): string[] {
  const sliced = rows.slice(0, max);
  if (sliced.length === 0) return [`- ${emptyText}`];
  return sliced.map(mapper);
}

export function buildWarRoomMeetingMarkdown(input: WarRoomBriefInput): string {
  const title = input.mode === "morning" ? "Morning Standup Brief" : "Weekly Review Brief";
  const lines: string[] = [
    `# ${title} - ${input.today}`,
    "",
    "## Executive Snapshot",
    `- Ops health: ${input.healthScore}`,
    `- WIP installs: ${input.wip} / total ${input.total}; released ${input.released}`,
    `- Overdue installs: ${input.overdue.length}`,
    `- Due within 7 days: ${input.dueSoon.length}`,
    `- Active equipment blocking: ${input.blocked.length}`,
    `- High utilization equipment: ${input.hot.length}; average utilization ${input.avgUtilization}%`,
    "",
    "## Decision Queue",
    ...lineItems(input.queue, (row) => `- ${row.value}: ${row.title} (${row.meta})`, "No high-priority queue items.", input.mode === "morning" ? 10 : 14),
    "",
    "## Overdue Installs",
    ...lineItems(input.overdue, (row) => `- ${installTitle(row)} | ${row.customer || "-"} | ${PHASE_MAP[row.phase]?.label ?? row.phase} | owner ${installOwner(row)} | ETA ${row.nextDueDate || row.estComplete || "-"} | reason ${row.overdueReason || "未填"}`, "No overdue installs."),
    "",
    "## Blocking Equipment",
    ...lineItems(input.blocked, (row) => `- ${row.equipmentId || row.serialNo || row.id} | ${row.customer || "-"} | ${row.blocking?.reasonCode || "-"} | owner ${row.blocking?.owner || "未指派"} | ETA ${row.blocking?.eta || "-"}` , "No active equipment blocking."),
    "",
    "## Due Soon",
    ...lineItems(input.dueSoon, (row) => `- ${installTitle(row)} | ${row.customer || "-"} | due ${row.estComplete || "-"} | owner ${installOwner(row)} | next ${row.nextAction || "未設定"}`, "No installs due within 7 days."),
  ];

  if (input.mode === "weekly") {
    lines.push(
      "",
      "## Regional Review",
      ...input.regionRows.map((row) => `- ${row.label}: score ${row.score}; installs ${row.installs}; equipment ${row.equipments}; overdue ${row.overdue}; blocking ${row.blocked}; hot ${row.hot}`),
      "",
      "## Phase Distribution",
      ...input.phaseRows.map((row) => `- ${row.label}: ${row.count}`),
      "",
      "## Capacity Watch",
      ...lineItems(input.hot, (row) => `- ${row.equipmentId || row.serialNo || row.id} | ${row.customer || "-"} | ${row.modelCode} | utilization ${getLiveUtilization(row.capacity)}%`, "No equipment above 80% utilization."),
      "",
      "## Stale Updates",
      ...lineItems(input.stale, (row) => `- ${installTitle(row)} | ${row.customer || "-"} | ${PHASE_MAP[row.phase]?.label ?? row.phase} | last updated ${row.updatedAt ? new Date(row.updatedAt).toISOString().slice(0, 10) : "-"}`, "No stale install updates."),
    );
  }

  lines.push("", "## Required Follow-up", "- Confirm owners and ETA for every overdue/blocking item.", "- Update next action before the next review.");
  return `${lines.join("\n")}\n`;
}

export function downloadMarkdownFile(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
