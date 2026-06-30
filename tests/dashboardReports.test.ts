import assert from "node:assert/strict";

import type { Equipment, Installation } from "@/domain/types";
import { buildDashboardAnalytics } from "@/features/dashboard/dashboardAnalytics";
import { buildEquipmentsCsv } from "@/features/dashboard/dashboardExports";
import { buildDashboardGovernanceReport } from "@/features/dashboard/dashboardGovernance";
import { buildInsightsMarkdownReport } from "@/features/dashboard/insightsReport";

const DAY_MS = 24 * 60 * 60 * 1000;

function install(overrides: Partial<Installation>): Installation {
  return {
    id: "install-default",
    name: "SN-DEFAULT",
    modelCode: "M100",
    region: "north",
    customer: "Customer A",
    phase: "installing",
    engineer: "Alice",
    progress: 50,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function equipment(overrides: Partial<Equipment>): Equipment {
  return {
    id: "equipment-default",
    equipmentId: "EQ-DEFAULT",
    region: "north",
    customer: "Customer A",
    site: "Fab 1",
    modelCode: "M100",
    serialNo: "EQ-SN",
    statusMain: "正式生產中",
    statusSub: "量產穩定",
    owner: "Alice",
    milestones: {},
    capacity: {
      utilization: 0,
      uph: 90,
      targetUph: 100,
      level: "紅",
      trend7d: [70, 72, 75, 78, 82, 88, 90],
    },
    updatedAt: Date.now(),
    ...overrides,
  };
}

const completedInstallations = [
  install({
    id: "released-10",
    name: "SN-10",
    phase: "released",
    progress: 100,
    orderDate: "2024-01-01",
    actComplete: "2024-01-11",
  }),
  install({
    id: "released-20",
    name: "SN-20",
    phase: "released",
    progress: 100,
    orderDate: "2024-02-01",
    actComplete: "2024-02-21",
  }),
];

const riskyInstallation = install({
  id: "risky-install",
  name: "",
  phase: "installing",
  engineer: "",
  actArrival: "2020-01-01",
  nextDueDate: "2020-01-02",
  updatedAt: Date.now() - 8 * DAY_MS,
});

const blockingEquipment = equipment({
  id: "blocked-equipment",
  products: [
    { name: "GB100", dailyCap: 1200 },
    { name: "GB200", dailyCap: 800 },
  ],
  blocking: {
    reasonCode: "PART_DELAY",
    detail: "Waiting for replacement valve\nvendor ETA shifted",
    owner: "Bob",
    status: "reopened",
    openedAt: Date.now() - 5 * DAY_MS,
    reopenedAt: Date.now() - DAY_MS,
    reopenCount: 1,
  },
});

const analytics = buildDashboardAnalytics({
  installations: [...completedInstallations, riskyInstallation],
  equipments: [blockingEquipment],
  engineers: ["Alice", "Bob"],
});

assert.equal(analytics.cycleTime.completedCount, 2);
assert.equal(analytics.cycleTime.avgDays, 15);
assert.equal(analytics.cycleTime.p50Days, 15);
assert.equal(analytics.cycleTime.longestRows[0].days, 20);
assert.ok(analytics.phaseAging.some((row) => row.key === "installing" && row.breached === 1));
assert.ok(analytics.region.some((row) => row.key === "north" && row.total === 3 && row.avg === 83 && row.rows.length === 3));
assert.deepEqual(analytics.engineer.find((row) => row.name === "Alice"), { name: "Alice", total: 2, active: 0, pct: 67 });
assert.deepEqual(analytics.regionProductStats[0]?.products, [
  { name: "GB100", cap: 1200 },
  { name: "GB200", cap: 800 },
]);
assert.ok(analytics.customerHealth.some((row) => row.name === "Customer A" && row.blocked === 1 && row.health < 100));

const governance = buildDashboardGovernanceReport([riskyInstallation], [blockingEquipment]);
const issueCount = new Map(governance.issueRows.map((row) => [row.id, row.count]));

assert.equal(issueCount.get("missing-serial"), 1);
assert.equal(issueCount.get("missing-engineer"), 1);
assert.equal(issueCount.get("missing-eta"), 1);
assert.equal(issueCount.get("missing-next-action"), 1);
assert.equal(issueCount.get("next-due-overdue"), 1);
assert.equal(issueCount.get("sla-breached"), 1);
assert.equal(issueCount.get("stale-updates"), 1);
assert.equal(issueCount.get("equipment-blocking"), 1);
assert.equal(issueCount.get("equipment-reopened"), 1);
assert.equal(issueCount.get("high-utilization"), 1);
assert.ok(governance.score < 72);

const markdown = buildInsightsMarkdownReport({
  today: "2026-06-29",
  appVersion: "test-version",
  filterSummary: "區域=北區 / 客戶=Customer A",
  governance,
  analytics,
});

assert.ok(markdown.includes("# Install Dashboard Insights - 2026-06-29"));
assert.ok(markdown.includes("## Governance Health"));
assert.ok(markdown.includes("- Filters: 區域=北區 / 客戶=Customer A"));
assert.ok(markdown.includes("## Delivery Cycle Time"));
assert.ok(markdown.includes("## Customer Health Watch"));

const equipmentCsv = buildEquipmentsCsv([blockingEquipment]);

assert.ok(equipmentCsv.startsWith("equipmentId,serialNo,region,customer,site,modelCode,statusMain"));
assert.ok(equipmentCsv.includes("\"EQ-DEFAULT\""));
assert.ok(equipmentCsv.includes("\"PART_DELAY\""));
assert.ok(equipmentCsv.includes("\"Waiting for replacement valve vendor ETA shifted\""));
assert.ok(equipmentCsv.includes("\"reopened\""));
assert.ok(equipmentCsv.includes("\"90\""));
assert.ok(equipmentCsv.includes("\"GB100:1200; GB200:800\""));
