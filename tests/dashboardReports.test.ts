import assert from "node:assert/strict";

import type { Equipment, Installation } from "@/domain/types";
import { buildEquipmentActionQueue, buildInstallActionQueue } from "@/features/dashboard/dashboardActionQueue";
import { buildDashboardAnalytics } from "@/features/dashboard/dashboardAnalytics";
import { buildBulkInstallTargets } from "@/features/dashboard/dashboardBulkInstall";
import { buildDashboardDirectoryOptions } from "@/features/dashboard/dashboardDirectoryOptions";
import { buildEquipmentsCsv } from "@/features/dashboard/dashboardExports";
import { filterAndSortEquipments, filterAndSortInstallations } from "@/features/dashboard/dashboardFilters";
import { buildDashboardGovernanceReport } from "@/features/dashboard/dashboardGovernance";
import { calcEquipmentStats, calcInstallStats } from "@/features/dashboard/dashboardStats";
import { buildGanttViewModel } from "@/features/dashboard/ganttViewModel";
import { buildEquipmentImportPreviewMetrics, buildInstallationImportPreviewMetrics } from "@/features/dashboard/importPreviewMetrics";
import { buildInsightsMarkdownReport } from "@/features/dashboard/insightsReport";
import { buildWarRoomViewModel } from "@/features/dashboard/warRoomViewModel";

const DAY_MS = 24 * 60 * 60 * 1000;

function localYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

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

const bulkInstallTargets = buildBulkInstallTargets([
  install({ id: "bulk-ordered", phase: "ordered" }),
  install({ id: "bulk-released", phase: "released" }),
  install({ id: "bulk-installing", phase: "installing" }),
]);
assert.deepEqual(bulkInstallTargets.ids, ["bulk-ordered", "bulk-installing"]);
assert.equal(bulkInstallTargets.count, 2);
assert.ok(analytics.phaseAging.some((row) => row.key === "installing" && row.breached === 1));
assert.ok(analytics.region.some((row) => row.key === "north" && row.total === 3 && row.avg === 83 && row.rows.length === 3));
assert.deepEqual(analytics.engineer.find((row) => row.name === "Alice"), { name: "Alice", total: 2, active: 0, pct: 67 });
assert.deepEqual(analytics.regionProductStats[0]?.products, [
  { name: "GB100", cap: 1200 },
  { name: "GB200", cap: 800 },
]);
assert.ok(analytics.customerHealth.some((row) => row.name === "Customer A" && row.blocked === 1 && row.health < 100));

const healthRankingAnalytics = buildDashboardAnalytics({
  installations: [
    install({ id: "health-risk", customer: "Risk Customer", modelCode: "M-RISK", estComplete: "2020-01-01", progress: 10 }),
    ...Array.from({ length: 9 }, (_, index) => install({
      id: `health-low-${index}`,
      customer: `Low Customer ${index}`,
      modelCode: `M-LOW-${index}`,
      estComplete: "2099-01-01",
      progress: 90,
    })),
  ],
  equipments: [
    equipment({
      id: "health-blocked",
      customer: "Blocked Customer",
      modelCode: "M-BLOCKED",
      blocking: {
        reasonCode: "WAIT_PART",
        detail: "Waiting",
        owner: "Bob",
        status: "open",
        openedAt: Date.now() - DAY_MS,
      },
    }),
  ],
  engineers: [],
});

assert.equal(healthRankingAnalytics.customerHealth.length, 8);
assert.deepEqual(healthRankingAnalytics.customerHealth.slice(0, 2).map((row) => row.name), ["Risk Customer", "Blocked Customer"]);
assert.equal(healthRankingAnalytics.customerHealth[0].overdue, 1);
assert.equal(healthRankingAnalytics.customerHealth[1].blocked, 1);

const installStats = calcInstallStats([...completedInstallations, { ...riskyInstallation, estComplete: "2020-01-03" }], "2026-06-29");

assert.equal(installStats.total, 3);
assert.equal(installStats.wip, 1);
assert.equal(installStats.released, 2);
assert.equal(installStats.overdue, 1);
assert.equal(installStats.avgProg, 83);
assert.equal(installStats.byPhase.released, 2);
assert.equal(installStats.byPhase.installing, 1);

const equipmentStats = calcEquipmentStats([blockingEquipment]);

assert.equal(equipmentStats.total, 1);
assert.equal(equipmentStats.avgUtil, 90);
assert.equal(equipmentStats.byStatus["正式生產中"], 1);
assert.equal(equipmentStats.byCap["紅"], 1);
assert.equal(equipmentStats.blocked, 1);
assert.equal(equipmentStats.resolvedBlocking, 0);
assert.equal(equipmentStats.avgBlockingDays, 5);

const filteredInstallations = filterAndSortInstallations([
  install({ id: "filter-b", name: "SN-B", region: "central", customer: "Beta", phase: "trial", engineer: "bob.lin@example.com", updatedAt: 300 }),
  install({ id: "filter-a", name: "SN-A", region: "north", customer: "Alpha", phase: "installing", engineer: "alice.chen@example.com", notes: "Valve tuning", updatedAt: 200 }),
  install({ id: "filter-c", name: "SN-C", region: "north", customer: "Gamma", phase: "released", engineer: "alice.chen@example.com", updatedAt: 100 }),
], {
  region: "north",
  model: "",
  phase: "",
  customer: "",
  engineer: "Alice",
  keyword: "sn",
  sortKey: "phase",
  sortDir: "asc",
});

assert.deepEqual(filteredInstallations.map((row) => row.id), ["filter-a", "filter-c"]);

const filteredEquipments = filterAndSortEquipments([
  equipment({ id: "equip-b", equipmentId: "EQ-B", region: "north", serialNo: "SN-B", statusMain: "正式生產中", statusSub: "blocked", owner: "bob.lin@example.com", updatedAt: 300 }),
  equipment({ id: "equip-a", equipmentId: "EQ-A", region: "north", serialNo: "SN-A", statusMain: "裝機", statusSub: "blocked", owner: "alice.chen@example.com", updatedAt: 200 }),
  equipment({ id: "equip-c", equipmentId: "EQ-C", region: "central", serialNo: "SN-C", statusMain: "試產", statusSub: "blocked", owner: "alice.chen@example.com", updatedAt: 100 }),
], {
  region: "north",
  status: "",
  capacity: "紅",
  keyword: "blocked",
  sortKey: "statusMain",
  sortDir: "asc",
});

assert.deepEqual(filteredEquipments.map((row) => row.id), ["equip-a", "equip-b"]);

const installQueue = buildInstallActionQueue([
  install({ id: "queue-released", phase: "released", updatedAt: Date.now() - 30 * DAY_MS }),
  install({ id: "queue-stale", name: "SN-STALE", phase: "ordered", updatedAt: Date.now() - 8 * DAY_MS }),
  install({ id: "queue-owner", name: "SN-OWNER", phase: "trial", engineer: "", estComplete: "2099-01-01" }),
  install({ id: "queue-serial", name: "", phase: "installing", engineer: "Alice", estComplete: "2099-01-01" }),
]);

assert.deepEqual(installQueue.map((row) => row.id), [
  "install-serial-queue-serial",
  "install-owner-queue-owner",
  "install-stale-queue-stale",
]);
assert.equal(installQueue[0]?.target.id, "queue-serial");

const boundedInstallQueue = buildInstallActionQueue(Array.from({ length: 8 }, (_, index) => install({
  id: `bounded-stale-${index}`,
  name: `SN-STALE-${index}`,
  phase: "ordered",
  orderDate: "2099-01-01",
  updatedAt: Date.now() - (7 + index) * DAY_MS,
})));

assert.equal(boundedInstallQueue.length, 5);
assert.deepEqual(boundedInstallQueue.map((row) => row.id), [
  "install-stale-bounded-stale-0",
  "install-stale-bounded-stale-1",
  "install-stale-bounded-stale-2",
  "install-stale-bounded-stale-3",
  "install-stale-bounded-stale-4",
]);

const equipmentQueue = buildEquipmentActionQueue([
  equipment({ id: "queue-high-util", equipmentId: "EQ-HIGH", capacity: { utilization: 85, uph: 0, targetUph: 100, level: "綠", trend7d: [] } }),
  equipment({ id: "queue-red", equipmentId: "EQ-RED", capacity: { utilization: 0, uph: 90, targetUph: 100, level: "紅", trend7d: [] } }),
  blockingEquipment,
], (region) => region);

assert.deepEqual(equipmentQueue.map((row) => row.id), [
  "equipment-blocked-blocked-equipment",
  "equipment-capacity-queue-red",
  "equipment-util-queue-high-util",
]);
assert.equal(equipmentQueue[0]?.target.id, "blocked-equipment");

const boundedEquipmentQueue = buildEquipmentActionQueue(Array.from({ length: 8 }, (_, index) => equipment({
  id: `bounded-capacity-${index}`,
  equipmentId: `EQ-CAP-${index}`,
  capacity: { utilization: 0, uph: 88 + index, targetUph: 100, level: "綠", trend7d: [] },
})), (region) => region);

assert.equal(boundedEquipmentQueue.length, 5);
assert.deepEqual(boundedEquipmentQueue.map((row) => row.id), [
  "equipment-capacity-bounded-capacity-7",
  "equipment-capacity-bounded-capacity-6",
  "equipment-capacity-bounded-capacity-5",
  "equipment-capacity-bounded-capacity-4",
  "equipment-capacity-bounded-capacity-3",
]);

const warRoomNow = new Date(2026, 5, 29, 12).getTime();
const warRoomModel = buildWarRoomViewModel([
  install({
    id: "war-overdue",
    name: "SN-OVERDUE",
    region: "north",
    customer: "Alpha",
    phase: "installing",
    engineer: "alice.chen@example.com",
    estComplete: "2026-06-20",
    nextDueDate: "2026-06-21",
    updatedAt: warRoomNow - 9 * DAY_MS,
  }),
  install({
    id: "war-due",
    name: "SN-DUE",
    region: "central",
    customer: "Beta",
    phase: "trial",
    engineer: "Bob",
    estComplete: "2026-07-03",
    nextAction: "Site check",
    updatedAt: warRoomNow - DAY_MS,
  }),
  install({
    id: "war-stale",
    name: "SN-STALE",
    region: "south",
    customer: "Gamma",
    phase: "ordered",
    estComplete: "2026-07-20",
    updatedAt: warRoomNow - 8 * DAY_MS,
  }),
  install({
    id: "war-released",
    name: "SN-RELEASED",
    region: "north",
    phase: "released",
    progress: 100,
    estComplete: "2026-06-01",
    updatedAt: warRoomNow,
  }),
], [
  equipment({
    id: "war-blocked",
    equipmentId: "EQ-BLOCK",
    region: "north",
    customer: "Alpha",
    capacity: { utilization: 85, uph: 0, targetUph: 100, level: "綠", trend7d: [] },
    blocking: {
      reasonCode: "PART_DELAY",
      detail: "Waiting",
      owner: "Owner",
      status: "open",
      openedAt: warRoomNow - DAY_MS,
    },
  }),
  equipment({
    id: "war-hot",
    equipmentId: "EQ-HOT",
    region: "central",
    customer: "Beta",
    capacity: { utilization: 82, uph: 0, targetUph: 100, level: "黃", trend7d: [] },
  }),
], "2026-06-29", warRoomNow);

assert.equal(warRoomModel.total, 4);
assert.equal(warRoomModel.wip, 3);
assert.equal(warRoomModel.released, 1);
assert.equal(warRoomModel.overdue.length, 1);
assert.equal(warRoomModel.dueSoon.length, 1);
assert.equal(warRoomModel.stale.length, 2);
assert.equal(warRoomModel.blocked.length, 1);
assert.equal(warRoomModel.hot.length, 2);
assert.equal(warRoomModel.avgUtilization, 84);
assert.equal(warRoomModel.healthScore, 79);
assert.equal(warRoomModel.maxPhaseCount, 1);
assert.deepEqual(warRoomModel.queue.map((row) => row.id), [
  "overdue-war-overdue",
  "blocked-war-blocked",
  "due-war-due",
  "stale-war-overdue",
  "stale-war-stale",
  "hot-war-blocked",
  "hot-war-hot",
]);
assert.deepEqual(warRoomModel.briefLines, [
  "1 件裝機逾期，先要求 owner 更新 ETA 與下一步。",
  "1 台設備有 blocking，需確認責任人與解除日期。",
  "1 件本週到期，適合排進 morning standup。",
  "2 台設備稼動率超過 80%，產能壓力需追蹤。",
]);
assert.deepEqual(warRoomModel.regionRows.find((row) => row.key === "north"), {
  key: "north",
  label: "北區",
  color: "#3b82f6",
  installs: 2,
  equipments: 1,
  overdue: 1,
  blocked: 1,
  hot: 1,
  score: 70,
});

const boundedWarRoomModel = buildWarRoomViewModel(
  Array.from({ length: 15 }, (_, index) => install({
    id: `war-overdue-${index}`,
    name: `SN-WAR-${index}`,
    estComplete: "2026-06-01",
    updatedAt: warRoomNow,
  })),
  [],
  "2026-06-29",
  warRoomNow,
);

assert.equal(boundedWarRoomModel.queue.length, 12);
assert.deepEqual(
  boundedWarRoomModel.queue.map((row) => row.id),
  Array.from({ length: 12 }, (_, index) => `overdue-war-overdue-${index}`),
);

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
assert.equal(governance.activeInstallations, 1);
assert.equal(governance.equipments, 1);
assert.equal(governance.totalIssues, 10);
assert.equal(governance.criticalIssues, 6);
assert.equal(governance.issueRows[0].tone, "critical");
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

const installationPreviewRows = [
  { _idx: 0, _selected: true, _regionMatched: true },
  { _idx: 1, _selected: true, _regionMatched: false },
  { _idx: 2, _selected: false, _regionMatched: false },
];
const installationPreviewMetrics = buildInstallationImportPreviewMetrics(installationPreviewRows);

assert.equal(installationPreviewMetrics.selectedRows.length, 2);
assert.equal(installationPreviewMetrics.allSelected, false);
assert.equal(installationPreviewMetrics.unmatchedCount, 1);

const equipmentPreviewRows = [
  { _idx: 0, _selected: true, _regionMatched: true, serialNo: " EQ-A " },
  { _idx: 1, _selected: true, _regionMatched: false, serialNo: "" },
  { _idx: 2, _selected: false, _regionMatched: false, serialNo: "EQ-C" },
];
const equipmentPreviewMetrics = buildEquipmentImportPreviewMetrics(equipmentPreviewRows);

assert.equal(equipmentPreviewMetrics.selectedRows.length, 2);
assert.deepEqual(equipmentPreviewMetrics.selectedSerials, ["EQ-A"]);
assert.equal(equipmentPreviewMetrics.allSelected, false);
assert.equal(equipmentPreviewMetrics.someSelected, true);
assert.equal(equipmentPreviewMetrics.unmatchedCount, 1);
assert.equal(equipmentPreviewMetrics.noSerialCount, 1);

const ganttToday = new Date(2026, 5, 29);
const ganttModel = buildGanttViewModel([
  install({ id: "gantt-normal", orderDate: "2024-02-01", estComplete: "2024-02-10", progress: 65 }),
  install({ id: "gantt-inverted", orderDate: "2024-01-10", estComplete: "2024-01-08", progress: 20 }),
  install({ id: "gantt-default", orderDate: "", estComplete: "", createdAt: new Date(2024, 0, 20).getTime(), progress: 40 }),
], ganttToday);

assert.deepEqual(ganttModel.rows.map((row) => row.id), ["gantt-inverted", "gantt-default", "gantt-normal"]);
assert.equal(localYmd(ganttModel.rows[0].start), "2024-01-08");
assert.equal(localYmd(ganttModel.rows[0].end), "2024-01-11");
assert.equal(localYmd(ganttModel.rows[1].end), "2026-07-29");
assert.equal(localYmd(ganttModel.timeline.minDate), "2024-01-05");
assert.ok(ganttModel.timeline.months.some((month) => month.label === "2024/01"));

const emptyGanttModel = buildGanttViewModel([], ganttToday);

assert.equal(emptyGanttModel.rows.length, 0);
assert.equal(localYmd(emptyGanttModel.timeline.minDate), "2026-05-27");
assert.ok(emptyGanttModel.timeline.totalMs > 0);

const configuredDirectoryOptions = buildDashboardDirectoryOptions({
  managedUsers: [{ email: "pii@premtek.com.tw" }, { email: "alice.chen@premtek.com.tw" }, { email: "bob.lin@premtek.com.tw" }],
  appVars: {
    version: "test",
    engineers: ["Fallback Engineer"],
    customers: [
      { name: " Config B ", region: "south" },
      { name: "Config A", region: "north" },
      { name: "Config A", region: "central" },
    ],
    updatedAt: 0,
    updatedBy: "test",
  },
  installations: [
    install({ id: "directory-install", customer: "Data Customer", engineer: "data.engineer@example.com" }),
  ],
  equipments: [
    equipment({ id: "directory-equipment", customer: "Equipment Customer", owner: "equipment.owner@example.com" }),
  ],
});

assert.deepEqual(configuredDirectoryOptions.ownerList, ["Alice", "Bob"]);
assert.deepEqual(configuredDirectoryOptions.engineers, ["Alice", "Bob"]);
assert.deepEqual(configuredDirectoryOptions.customers, ["Config A", "Config B"]);
assert.deepEqual(configuredDirectoryOptions.customerRegionMap, { "Config B": "south", "Config A": "central" });

const dataDirectoryOptions = buildDashboardDirectoryOptions({
  managedUsers: [],
  appVars: {
    version: "test",
    engineers: ["app.engineer@example.com"],
    customers: [],
    updatedAt: 0,
    updatedBy: "test",
  },
  installations: [
    install({ id: "directory-alpha", customer: "Alpha", engineer: "alice.chen@example.com" }),
    install({ id: "directory-beta", customer: "Beta", engineer: "app.engineer@example.com" }),
  ],
  equipments: [
    equipment({ id: "directory-equip", customer: "Alpha", owner: "carol.lin@example.com" }),
  ],
});

assert.deepEqual(dataDirectoryOptions.ownerList, []);
assert.deepEqual(dataDirectoryOptions.engineers, ["Alice", "App", "Carol"]);
assert.deepEqual(dataDirectoryOptions.customers, ["Alpha", "Beta"]);
assert.deepEqual(dataDirectoryOptions.customerRegionMap, {});

const fallbackDirectoryOptions = buildDashboardDirectoryOptions({
  managedUsers: [],
  appVars: null,
  installations: [],
  equipments: [],
});

assert.deepEqual(fallbackDirectoryOptions.customers, ["ASE", "SPIL", "TSMC"]);
