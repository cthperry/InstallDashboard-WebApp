import type { DashboardAnalytics } from "@/features/dashboard/dashboardAnalytics";
import type { DashboardGovernanceReport } from "@/features/dashboard/dashboardGovernance";

export type InsightsReportInput = {
  today: string;
  appVersion: string;
  filterSummary: string;
  governance: DashboardGovernanceReport;
  analytics: DashboardAnalytics;
};

function linesForRows<T>(
  rows: T[],
  mapper: (row: T, index: number) => string,
  emptyText: string,
  max = 8,
): string[] {
  const sliced = rows.slice(0, max);
  if (sliced.length === 0) return [`- ${emptyText}`];
  return sliced.map(mapper);
}

export function buildInsightsMarkdownReport(input: InsightsReportInput): string {
  const { analytics, governance } = input;
  const lines: string[] = [
    `# Install Dashboard Insights - ${input.today}`,
    "",
    "## Scope",
    `- App version: ${input.appVersion}`,
    `- Filters: ${input.filterSummary || "全部資料"}`,
    `- Active installations: ${governance.activeInstallations}`,
    `- Equipment: ${governance.equipments}`,
    "",
    "## Governance Health",
    `- Score: ${governance.score}`,
    `- Total issues: ${governance.totalIssues}`,
    `- Critical issues: ${governance.criticalIssues}`,
    ...linesForRows(
      governance.issueRows.filter((row) => row.count > 0),
      (row) => `- ${row.label}: ${row.count} (${row.detail})`,
      "No active governance issues.",
      12,
    ),
    "",
    "## Delivery Cycle Time",
    `- Completed cases with actual completion date: ${analytics.cycleTime.completedCount}`,
    `- Average days: ${analytics.cycleTime.avgDays}`,
    `- P50 days: ${analytics.cycleTime.p50Days}`,
    ...linesForRows(
      analytics.cycleTime.longestRows,
      (row) => `- ${row.title} | ${row.customer} | ${row.days} days | completed ${row.completedAt}`,
      "No completed rows available for cycle time.",
      5,
    ),
    "",
    "## Phase Aging / SLA",
    ...analytics.phaseAging.map((row) => `- ${row.label}: ${row.count} cases; avg ${row.avgAgeDays} days; max ${row.maxAgeDays} days; breached ${row.breached}`),
    "",
    "## Due Within 14 Days",
    ...linesForRows(
      analytics.due,
      (row) => `- ${row.modelCode} ${row.name || row.id} | ${row.customer} | phase ${row.phase} | due ${row.estComplete || "-"} | D${row.dl >= 0 ? `-${row.dl}` : `+${Math.abs(row.dl)}`}`,
      "No installations due within 14 days.",
      10,
    ),
    "",
    "## Customer Health Watch",
    ...linesForRows(
      analytics.customerHealth,
      (row) => `- ${row.name}: health ${row.health}; installs ${row.installs}; active ${row.activeInstalls}; equipment ${row.equipments}; overdue ${row.overdue}; blocked ${row.blocked}`,
      "No customer health rows.",
      8,
    ),
    "",
    "## Model Health Watch",
    ...linesForRows(
      analytics.modelHealth,
      (row) => `- ${row.name}: health ${row.health}; installs ${row.installs}; active ${row.activeInstalls}; equipment ${row.equipments}; overdue ${row.overdue}; blocked ${row.blocked}`,
      "No model health rows.",
      8,
    ),
    "",
    "## Recommended Follow-up",
    "- Resolve critical governance issues first: missing serials, missing owners, overdue next actions, breached SLA, and active equipment blocking.",
    "- Confirm ETA and next action for every active installation before the next review.",
    "- Use War Room meeting mode for decision tracking when governance score is below 72.",
  ];

  return `${lines.join("\n")}\n`;
}
