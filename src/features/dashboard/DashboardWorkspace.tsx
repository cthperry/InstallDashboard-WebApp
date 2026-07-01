"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/AuthProvider";

import { createInstallation, updateInstallation, updateInstallationsBulk, removeInstallation } from "@/features/data/installations";
import { createEquipment, updateEquipment, removeEquipment, type EquipmentUpdatePatch } from "@/features/data/equipments";
import { deleteField } from "firebase/firestore";
import { saveRetentionSettings } from "@/features/data/settings";
import {
  purgeAuditLogsOlderThan,
  purgeEventsOlderThan,
  clearAllAuditLogs,
  clearAllEvents,
} from "@/features/data/logs";
import { writeAuditLog } from "@/features/data/audit";
import { trackEvent } from "@/features/telemetry/track";

import type { CapacityLevel, Equipment, EquipmentMainStatus, Installation, MachineModel, PhaseKey, RegionKey, RetentionSettingsDoc } from "@/domain/types";
import {
  CAPACITY_COLOR,
  CAPACITY_LEVELS,
  DEFAULT_MACHINE_MODELS,
  EQUIPMENT_SUB_STATUS_OPTIONS,
  EQUIPMENT_MAIN_STATUSES,
  PHASE_MAP,
  PHASES,
  REGIONS,
  STATUS_COLOR,
  PHASE_CHECKLIST
} from "@/domain/constants";
import { equipmentSchema, installationSchema } from "@/domain/schemas";
import { getInstallationDefaultDraft, INSTALLATION_DATE_FIELDS, doesInstallationPhaseRequireEngineer, doesInstallationPhaseRequireSerial, type InstallationDraft } from "@/domain/installationContract";
import {
  EQUIPMENT_BLOCKING_STATUS_COLOR,
  EQUIPMENT_BLOCKING_STATUS_LABEL,
  getEquipmentBlockingAgeDays,
  isActiveEquipmentBlocking,
  mergeEquipmentBlockingLifecycle,
  normalizeEquipmentBlockingStatus,
} from "@/domain/equipmentBlocking";
import { toDisplayShortName } from "@/domain/personDisplay";

import { useDashboardData } from "@/features/dashboard/hooks/useDashboardData";
import { useInstallationFormState } from "@/features/dashboard/hooks/useInstallationFormState";
import { useSavedFilters, type SavedFilter } from "@/features/dashboard/hooks/useSavedFilters";
import {
  didInstallationEnterReleased,
  getInstallationProgressByPhase,
  normalizeInstallationForSave,
  shouldTransferInstallationToEquipment,
} from "@/features/dashboard/services/installationLifecycleService";
import {
  getEquipmentTransferToast,
  transferReleasedInstallationToEquipment,
} from "@/features/dashboard/services/equipmentTransferService";

// Capacity formatting helpers
import { formatUphValue } from "@/domain/capacity";

import { Modal } from "@/features/ui/Modal";
import { DateInput } from "@/features/ui/DateInput";
import { Badge } from "@/features/ui/Badge";
import { Drawer } from "@/features/ui/Drawer";
import { MiniTrend } from "@/features/ui/MiniTrend";
import {
  filterAndSortEquipments,
  filterAndSortInstallations,
  getEquipmentSerialLabel,
  type EquipSortKey,
  type InstallSortKey,
} from "@/features/dashboard/dashboardFilters";
import { buildDashboardAnalytics, type DashboardAnalytics } from "@/features/dashboard/dashboardAnalytics";
import {
  buildEquipmentActionQueue,
  buildInstallActionQueue,
} from "@/features/dashboard/dashboardActionQueue";
import { getInstallSlaStatus } from "@/features/dashboard/installSla";
import { buildDashboardGovernanceReport, type DashboardGovernanceReport, type GovernanceIssueTone } from "@/features/dashboard/dashboardGovernance";
import { buildInsightsMarkdownReport } from "@/features/dashboard/insightsReport";
import { downloadMarkdownFile } from "@/features/dashboard/warRoomBrief";
import { buildDashboardDirectoryOptions } from "@/features/dashboard/dashboardDirectoryOptions";
import { buildBulkInstallTargets } from "@/features/dashboard/dashboardBulkInstall";
import { downloadEquipmentsCsv, downloadInstallationsCsv } from "@/features/dashboard/dashboardExports";
import { DashboardEmptyState, type ActiveFilterChip } from "@/features/dashboard/DashboardSharedControls";
import { DashboardEquipmentSection } from "@/features/dashboard/DashboardEquipmentSection";
import { DashboardInstallSection } from "@/features/dashboard/DashboardInstallSection";
import { DashboardInsightsSection } from "@/features/dashboard/DashboardInsightsSection";
import { buildEditInstallationDraft, buildNewInstallationDraft } from "@/features/dashboard/installationForm";
import { calcEquipmentStats, calcInstallStats, isOverdueInstall } from "@/features/dashboard/dashboardStats";
import {
  buildEquipmentFormDraftFromEquipment,
  buildEquipmentPayloadFromDraft,
  buildSafeEquipmentBlocking,
  buildSafeEquipmentMilestones,
  defaultEquipSubStatus,
  getEquipmentDefaultFormDraft,
  updateEquipmentCapacityDraft,
  type EquipmentFormDraft,
  type EquipmentProductDraft,
} from "@/features/dashboard/equipmentForm";
import { SortableTh, type MissionQueueItem, type SortDirection } from "@/features/dashboard/dashboardWidgets";
import { getErrorMessage } from "@/lib/errors";
import { todayInTaipeiYmd } from "@/lib/utils";
import { getLiveUtilization } from "@/domain/capacity";
import {
  clamp,
  daysLeft,
  fmtDate,
  getInstallModelSerial,
  getInstallSerial,
  getInstallTaskLabel,
  getPhaseHint,
  normalizeOptionList,
  parseInsightsTab,
  parseInstallView,
  parsePhaseKey,
  parseRegionKey,
  pickColorByUtil,
  regionLabel,
  resolveCustomerRegionFromMap,
  safeStr,
  taipeiNowParts,
  type InsightsTab,
  type InstallView,
} from "@/features/dashboard/dashboardViewUtils";

const SmartImportModal = dynamic(
  () => import("@/features/dashboard/SmartImportModal").then((mod) => mod.SmartImportModal),
  { ssr: false },
);

function GanttViewLoading() {
  return (
    <div className="card" style={{ marginTop: 12, padding: 24, color: "var(--muted-foreground)" }}>
      載入甘特圖...
    </div>
  );
}

const GanttView = dynamic(
  () => import("@/features/dashboard/GanttView").then((mod) => mod.GanttView),
  { ssr: false, loading: GanttViewLoading },
);

type DashboardSection = "install" | "equipment" | "insights";
const TABLE_PAGE_SIZE = 120;
const EMPTY_MISSION_QUEUE: MissionQueueItem[] = [];

const EMPTY_DASHBOARD_ANALYTICS: DashboardAnalytics = {
  phase: { total: 0, by: {} },
  region: [],
  engineer: [],
  due: [],
  cycleTime: { completedCount: 0, avgDays: 0, p50Days: 0, longestRows: [] },
  phaseAging: [],
  customerHealth: [],
  modelHealth: [],
  regionProductStats: [],
};

const EMPTY_GOVERNANCE_REPORT: DashboardGovernanceReport = {
  score: 100,
  tone: "good",
  activeInstallations: 0,
  equipments: 0,
  totalIssues: 0,
  criticalIssues: 0,
  issueRows: [],
};

type EquipmentValidationIssue = { path: readonly PropertyKey[]; message: string };
type EquipmentFieldErrorMap = Partial<Record<string, string>>;

const EQUIPMENT_VALIDATION_LABELS: Record<string, string> = {
  equipmentId: "設備 ID",
  region: "區域",
  customer: "客戶",
  site: "站點",
  modelCode: "機型",
  serialNo: "機台序號",
  statusMain: "主狀態",
  statusSub: "子狀態",
  owner: "Owner",
  capacity: "容量",
  "capacity.uph": "UPH",
  "capacity.targetUph": "Target UPH",
  "capacity.trend7d": "7 天趨勢",
  products: "產品產能",
  blocking: "阻塞資料",
  "blocking.reasonCode": "阻塞原因",
  "blocking.owner": "阻塞 Owner",
  "blocking.eta": "阻塞 ETA",
};

function getEquipmentValidationFieldKey(path: string[]): string {
  if (path[0] === "capacity" && path[1]) return `capacity.${path[1]}`;
  if (path[0] === "blocking" && path[1]) return `blocking.${path[1]}`;
  if (path[0] === "products") return "products";
  return path[0] ?? "equipment";
}

function formatEquipmentValidationIssue(issue: EquipmentValidationIssue): string {
  const path = issue.path.map(String);
  const key = path.join(".");
  const root = path[0] ?? "";
  const label = EQUIPMENT_VALIDATION_LABELS[key] ?? EQUIPMENT_VALIDATION_LABELS[root] ?? "設備資料";
  const rowIndex = root === "products" && path.length > 1 && Number.isFinite(Number(path[1]))
    ? `第 ${Number(path[1]) + 1} 筆`
    : "";
  return `${label}${rowIndex ? `（${rowIndex}）` : ""}：${issue.message}`;
}

function formatEquipmentValidationIssues(issues: EquipmentValidationIssue[]): string[] {
  const messages = issues.map(formatEquipmentValidationIssue);

  return Array.from(new Set(messages));
}

function buildEquipmentFieldErrors(issues: EquipmentValidationIssue[]): EquipmentFieldErrorMap {
  return issues.reduce<EquipmentFieldErrorMap>((acc, issue) => {
    const path = issue.path.map(String);
    const key = getEquipmentValidationFieldKey(path);
    if (!acc[key]) acc[key] = formatEquipmentValidationIssue(issue);
    return acc;
  }, {});
}

function pickHealthColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function pickGovernanceToneColor(tone: GovernanceIssueTone): string {
  if (tone === "good") return "#10b981";
  if (tone === "info") return "#3b82f6";
  if (tone === "warning") return "#f59e0b";
  return "#ef4444";
}

export function DashboardWorkspace({ section }: { section: DashboardSection }) {
  const { user, isAdmin, appVersion } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const installViewParam = searchParams.get("view");
  const insightsTabParam = searchParams.get("tab");

  const [installView, setInstallView] = useState<InstallView>(parseInstallView(installViewParam));
  const [insightsTab, setInsightsTab] = useState<InsightsTab>(parseInsightsTab(insightsTabParam));
  const activeInsightsTab: InsightsTab = isAdmin ? insightsTab : "analytics";
  const [showInstallAdvancedFilters, setShowInstallAdvancedFilters] = useState(false);

  const {
    machineModels,
    appVars,
    retention,
    importConfig,
    managedUsers,
    installations,
    installLoading,
    installErr,
    equipments,
    equipLoading,
    equipErr,
    auditLogs,
    events,
  } = useDashboardData({ isAdmin, section, insightsTab: activeInsightsTab });

  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeHint, setPurgeHint] = useState<string>("");

  const [retAuditDays, setRetAuditDays] = useState<number>(0);
  const [retEventDays, setRetEventDays] = useState<number>(0);
  const [retAutoEnabled, setRetAutoEnabled] = useState<boolean>(false);
  const [retAutoTime, setRetAutoTime] = useState<string>("03:00");

  // ───────── Filters: Installations ─────────
  const [fRegion, setFRegion] = useState<"" | RegionKey>("");
  const [fModel, setFModel] = useState<string>("");
  const [fPhase, setFPhase] = useState<"" | PhaseKey>("");
  const [fCustomer, setFCustomer] = useState<string>("");
  const [fEngineer, setFEngineer] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const deferredKeyword = useDeferredValue(keyword);
  const [installSortKey, setInstallSortKey] = useState<InstallSortKey>("updatedAt");
  const [installSortDir, setInstallSortDir] = useState<"asc" | "desc">("desc");
  const [installVisibleCount, setInstallVisibleCount] = useState(TABLE_PAGE_SIZE);
  const [bulkInstallOwner, setBulkInstallOwner] = useState("");
  const [bulkInstallEta, setBulkInstallEta] = useState("");
  const [bulkInstallAction, setBulkInstallAction] = useState("");
  const [bulkInstallBusy, setBulkInstallBusy] = useState(false);
  // ───────── Saved Filters ─────────
  const { savedFilters, addSavedFilter, deleteSavedFilter } = useSavedFilters();
  const [saveFilterName, setSaveFilterName] = useState<string>("");
  const [showSaveFilterInput, setShowSaveFilterInput] = useState(false);

  // ───────── Filters: Equipments ─────────
  const [eRegion, setERegion] = useState<"" | RegionKey>("");
  const [eStatus, setEStatus] = useState<"" | EquipmentMainStatus>("");
  const [eCap, setECap] = useState<"" | CapacityLevel>("");
  const [eKeyword, setEKeyword] = useState<string>("");
  const deferredEquipmentKeyword = useDeferredValue(eKeyword);
  const [equipSortKey, setEquipSortKey] = useState<EquipSortKey>("updatedAt");
  const [equipSortDir, setEquipSortDir] = useState<"asc" | "desc">("desc");
  const [equipVisibleCount, setEquipVisibleCount] = useState(TABLE_PAGE_SIZE);

  // ───────── UI state ─────────
  const [toast, setToast] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEq, setDrawerEq] = useState<Equipment | null>(null);

  // ───────── Modal: Installation ─────────
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installEditId, setInstallEditId] = useState<string | null>(null);
  const [installSubmitBusy, setInstallSubmitBusy] = useState(false);
  const {
    installForm,
    setInstallForm,
    installErrors,
    installErrorSummary,
    installFieldRefs,
    clearInstallErrors,
    updateInstallField,
    updateInstallCustomer: updateInstallCustomerDraft,
    updateInstallPhase,
    showInstallValidationErrors,
  } = useInstallationFormState(getInstallationDefaultDraft(DEFAULT_MACHINE_MODELS));

  // ───────── Modal: Excel Import ─────────
  const [smartImportOpen, setSmartImportOpen] = useState(false);

  // ───────── Modal: Equipment ─────────
  const [equipModalOpen, setEquipModalOpen] = useState(false);
  const [equipEditId, setEquipEditId] = useState<string | null>(null);
  const [equipSubmitBusy, setEquipSubmitBusy] = useState(false);
  const [equipErrorSummary, setEquipErrorSummary] = useState<string[]>([]);
  const [equipErrors, setEquipErrors] = useState<EquipmentFieldErrorMap>({});
  const [equipForm, setEquipForm] = useState<EquipmentFormDraft>(() => getEquipmentDefaultFormDraft());

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (section !== "install") return;
    setInstallView(parseInstallView(installViewParam));
  }, [section, installViewParam]);

  useEffect(() => {
    if (section !== "insights") return;
    setInsightsTab(parseInsightsTab(insightsTabParam));
  }, [section, insightsTabParam]);

  useEffect(() => {
    setInstallVisibleCount(TABLE_PAGE_SIZE);
  }, [deferredKeyword, fRegion, fModel, fPhase, fCustomer, fEngineer, installSortKey, installSortDir]);

  useEffect(() => {
    setEquipVisibleCount(TABLE_PAGE_SIZE);
  }, [deferredEquipmentKeyword, eRegion, eStatus, eCap, equipSortKey, equipSortDir]);

  const today = todayInTaipeiYmd();

  const retentionCfg: RetentionSettingsDoc = useMemo(() => {
    if (retention) return retention;
    return {
      version: "default",
      auditLogsRetentionDays: 0,
      eventsRetentionDays: 0,
      autoPurgeEnabled: false,
      autoPurgeTime: "03:00",
      updatedAt: 0,
      updatedBy: "",
    };
  }, [retention]);

  useEffect(() => {
    setRetAuditDays(Number(retentionCfg.auditLogsRetentionDays || 0));
    setRetEventDays(Number(retentionCfg.eventsRetentionDays || 0));
    setRetAutoEnabled(Boolean(retentionCfg.autoPurgeEnabled));
    setRetAutoTime(retentionCfg.autoPurgeTime || "03:00");
  }, [retentionCfg.auditLogsRetentionDays, retentionCfg.eventsRetentionDays, retentionCfg.autoPurgeEnabled, retentionCfg.autoPurgeTime]);

  const saveRetention = useCallback(async (patch: Partial<RetentionSettingsDoc>) => {
    if (!isAdmin) return;
    if (!user?.email) return;
    const next: RetentionSettingsDoc = {
      ...retentionCfg,
      ...patch,
      version: String(patch.version ?? retentionCfg.version ?? "default"),
      updatedAt: Date.now(),
      updatedBy: user.email,
    };
    await saveRetentionSettings(next);
    await writeAuditLog(
      "更新清除設定",
      "settings/retention",
      `保留 auditLogs=${next.auditLogsRetentionDays} 天、events=${next.eventsRetentionDays} 天；自動=${next.autoPurgeEnabled ? "ON" : "OFF"} ${next.autoPurgeTime}`,
      user.email
    );
  }, [isAdmin, retentionCfg, user?.email]);

  const doPurgeByRetention = useCallback(async () => {
    if (!isAdmin) return;
    if (!user?.email) return;
    if (purgeBusy) return;

    const aDays = Number(retentionCfg.auditLogsRetentionDays || 0);
    const eDays = Number(retentionCfg.eventsRetentionDays || 0);

    setPurgeBusy(true);
    setPurgeHint("清除中...");
    try {
      let aDeleted = 0;
      let eDeleted = 0;

      if (aDays > 0) {
        const cutoff = new Date(Date.now() - aDays * 24 * 60 * 60 * 1000);
        // 可能超過 800 筆時需要多次點擊（刻意避免一次刪過多造成逾時）
        aDeleted = await purgeAuditLogsOlderThan(cutoff, 800);
      }
      if (eDays > 0) {
        const cutoff = new Date(Date.now() - eDays * 24 * 60 * 60 * 1000);
        eDeleted = await purgeEventsOlderThan(cutoff, 800);
      }

      setToast(`已清除：auditLogs ${aDeleted} 筆、events ${eDeleted} 筆（依保留天數）`);
      trackEvent("admin_purge_by_retention", { aDeleted, eDeleted, aDays, eDays, appVersion });
    } catch (e: unknown) {
      setToast(`清除失敗：${getErrorMessage(e, "unknown")}`);
    } finally {
      setPurgeBusy(false);
      setPurgeHint("");
    }
  }, [isAdmin, user?.email, purgeBusy, retentionCfg, appVersion]);

  const doClearAllLogs = useCallback(async () => {
    if (!isAdmin) return;
    if (!user?.email) return;
    if (purgeBusy) return;
    const ok = confirm("確定要清除全部 auditLogs/events 嗎？此動作不可復原。\n\n注意：清除 auditLogs 會失去稽核追溯能力。");
    if (!ok) return;

    setPurgeBusy(true);
    setPurgeHint("清除全部中...");
    try {
      const aDeleted = await clearAllAuditLogs(800);
      const eDeleted = await clearAllEvents(800);
      setToast(`已清除：auditLogs ${aDeleted} 筆、events ${eDeleted} 筆（最多 800 筆/次）`);
      trackEvent("admin_clear_all_logs", { aDeleted, eDeleted, appVersion });
    } catch (e: unknown) {
      setToast(`清除失敗：${getErrorMessage(e, "unknown")}`);
    } finally {
      setPurgeBusy(false);
      setPurgeHint("");
    }
  }, [isAdmin, user?.email, purgeBusy, appVersion]);

  // ───────── Auto purge (定時清除) ─────────
  useEffect(() => {
    if (!isAdmin) return;
    if (!user?.email) return;
    if (!retentionCfg.autoPurgeEnabled) return;
    const timer = setInterval(async () => {
      try {
        const { ymd, hhmm } = taipeiNowParts();
        const target = retentionCfg.autoPurgeTime || "03:00";
        // 容忍 2 分鐘視窗，避免剛好錯過
        const [th, tm] = target.split(":").map((x) => Number(x));
        const [nh, nm] = hhmm.split(":").map((x) => Number(x));
        if (!Number.isFinite(th) || !Number.isFinite(tm) || !Number.isFinite(nh) || !Number.isFinite(nm)) return;
        const tMin = th * 60 + tm;
        const nMin = nh * 60 + nm;
        if (Math.abs(nMin - tMin) > 2) return;

        const last = retentionCfg.lastAutoPurgeAt ? new Date(retentionCfg.lastAutoPurgeAt) : null;
        const lastYmd = last ? `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}` : "";
        if (lastYmd === ymd) return;

        await doPurgeByRetention();
        await saveRetention({ lastAutoPurgeAt: Date.now() });
      } catch {
        // ignore
      }
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, [isAdmin, user?.email, retentionCfg.autoPurgeEnabled, retentionCfg.autoPurgeTime, retentionCfg.lastAutoPurgeAt, doPurgeByRetention, saveRetention]);

  const directoryOptions = useMemo(
    () => buildDashboardDirectoryOptions({ managedUsers, appVars, installations, equipments }),
    [managedUsers, appVars, installations, equipments],
  );
  const { ownerList, engineers, customers, customerRegionMap } = directoryOptions;

  const resolveCustomerRegion = useCallback((customer: string): RegionKey | null => {
    return resolveCustomerRegionFromMap(customerRegionMap, customer);
  }, [customerRegionMap]);

  const filteredInstallations = useMemo(() => {
    return filterAndSortInstallations(installations, {
      region: fRegion,
      model: fModel,
      phase: fPhase,
      customer: fCustomer,
      engineer: fEngineer,
      keyword: deferredKeyword,
      sortKey: installSortKey,
      sortDir: installSortDir,
    });
  }, [installations, fRegion, fModel, fPhase, fCustomer, fEngineer, deferredKeyword, installSortDir, installSortKey]);

  const visibleInstallations = useMemo(
    () => filteredInstallations.slice(0, installVisibleCount),
    [filteredInstallations, installVisibleCount],
  );

  const installStats = useMemo(() => calcInstallStats(filteredInstallations, today), [filteredInstallations, today]);

  const installationRowsByPhase = useMemo(() => {
    const rowsByPhase = new Map<PhaseKey, Installation[]>();
    for (const phase of PHASES) rowsByPhase.set(phase.key, []);
    for (const row of filteredInstallations) rowsByPhase.get(row.phase)?.push(row);
    return rowsByPhase;
  }, [filteredInstallations]);

  const filteredEquipments = useMemo(() => {
    return filterAndSortEquipments(equipments, {
      region: eRegion,
      status: eStatus,
      capacity: eCap,
      keyword: deferredEquipmentKeyword,
      sortKey: equipSortKey,
      sortDir: equipSortDir,
    });
  }, [equipments, eRegion, eStatus, eCap, deferredEquipmentKeyword, equipSortDir, equipSortKey]);

  const visibleEquipments = useMemo(
    () => filteredEquipments.slice(0, equipVisibleCount),
    [filteredEquipments, equipVisibleCount],
  );

  const equipStats = useMemo(() => calcEquipmentStats(filteredEquipments), [filteredEquipments]);

  const bulkInstallTargets = useMemo(
    () => buildBulkInstallTargets(filteredInstallations),
    [filteredInstallations],
  );
  const bulkInstallTargetCount = bulkInstallTargets.count;
  const hasBulkInstallPatch = Boolean(bulkInstallOwner.trim() || bulkInstallEta.trim() || bulkInstallAction.trim());
  const installCsvDisabled = installLoading || Boolean(installErr) || filteredInstallations.length === 0;
  const equipmentCsvDisabled = equipLoading || Boolean(equipErr) || filteredEquipments.length === 0;
  const insightsReportDisabled = installLoading || Boolean(installErr) || filteredInstallations.length === 0;
  const bulkInstallDisabled = bulkInstallBusy || installLoading || Boolean(installErr) || bulkInstallTargetCount === 0 || !hasBulkInstallPatch;
  const installCsvTitle = installLoading
    ? "裝機資料同步完成後可匯出"
    : installErr
      ? "裝機資料讀取失敗，暫無法匯出"
      : filteredInstallations.length === 0
        ? "目前篩選沒有可匯出的裝機案"
        : `匯出目前篩選 ${filteredInstallations.length} 筆裝機案`;
  const equipmentCsvTitle = equipLoading
    ? "設備資料同步完成後可匯出"
    : equipErr
      ? "設備資料讀取失敗，暫無法匯出"
      : filteredEquipments.length === 0
        ? "目前篩選沒有可匯出的設備"
        : `匯出目前篩選 ${filteredEquipments.length} 台設備`;
  const insightsReportTitle = installLoading
    ? "分析資料同步完成後可下載"
    : installErr
      ? "分析資料讀取失敗，暫無法下載"
      : filteredInstallations.length === 0
        ? "目前沒有可產生報告的裝機案"
        : "下載目前分析報告";
  const bulkInstallTitle = bulkInstallBusy
    ? "批次更新中"
    : installLoading
      ? "裝機資料同步完成後可批次更新"
      : installErr
        ? "裝機資料讀取失敗，暫無法批次更新"
        : bulkInstallTargetCount === 0
          ? "目前篩選沒有可批次更新的進行中裝機案"
          : !hasBulkInstallPatch
            ? "請先填寫 Owner、ETA 或下一步"
            : `套用至目前篩選 ${bulkInstallTargetCount} 筆進行中裝機案`;

  const shouldBuildInsightsData = section === "insights" && activeInsightsTab === "analytics";

  const governanceReport = useMemo(
    () => (
      shouldBuildInsightsData
        ? buildDashboardGovernanceReport(filteredInstallations, equipments)
        : EMPTY_GOVERNANCE_REPORT
    ),
    [filteredInstallations, equipments, shouldBuildInsightsData],
  );

  // ───────── Analytics ─────────
  const analytics = useMemo(
    () => (
      shouldBuildInsightsData
        ? buildDashboardAnalytics({
          installations: filteredInstallations,
          equipments,
          engineers,
        })
        : EMPTY_DASHBOARD_ANALYTICS
    ),
    [filteredInstallations, equipments, engineers, shouldBuildInsightsData],
  );
  const anPhase = analytics.phase;
  const anRegion = analytics.region;
  const anEngineer = analytics.engineer;
  const anDue = analytics.due;
  const cycleTime = analytics.cycleTime;
  const phaseAging = analytics.phaseAging;
  const customerHealth = analytics.customerHealth;
  const modelHealth = analytics.modelHealth;
  const regionProductStats = analytics.regionProductStats;

  const insightsFilterSummary = useMemo(() => {
    const parts = [
      fRegion ? `區域=${regionLabel(fRegion)}` : "",
      fCustomer ? `客戶=${fCustomer}` : "",
      fModel ? `機型=${fModel}` : "",
      fPhase ? `階段=${PHASE_MAP[fPhase]?.label ?? fPhase}` : "",
      fEngineer ? `工程師=${fEngineer}` : "",
      deferredKeyword ? `關鍵字=${deferredKeyword}` : "",
    ].filter(Boolean);
    return parts.join(" / ");
  }, [deferredKeyword, fCustomer, fEngineer, fModel, fPhase, fRegion]);

  const clearInstallFilters = useCallback(() => {
    setFRegion("");
    setFModel("");
    setFPhase("");
    setFCustomer("");
    setFEngineer("");
    setKeyword("");
    setInstallSortKey("updatedAt");
    setInstallSortDir("desc");
  }, []);

  const clearEquipmentFilters = useCallback(() => {
    setERegion("");
    setEStatus("");
    setECap("");
    setEKeyword("");
    setEquipSortKey("updatedAt");
    setEquipSortDir("desc");
  }, []);

  const installActiveFilters = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (fRegion) chips.push({ id: "region", label: "區域", value: regionLabel(fRegion), onClear: () => setFRegion("") });
    if (fPhase) chips.push({ id: "phase", label: "階段", value: PHASE_MAP[fPhase]?.label ?? fPhase, onClear: () => setFPhase("") });
    if (deferredKeyword) chips.push({ id: "keyword", label: "關鍵字", value: deferredKeyword, onClear: () => setKeyword("") });
    if (fModel) {
      const modelLabel = machineModels.find((model) => model.code === fModel)?.displayName ?? fModel;
      chips.push({ id: "model", label: "機型", value: modelLabel, onClear: () => setFModel("") });
    }
    if (fCustomer) chips.push({ id: "customer", label: "客戶", value: fCustomer, onClear: () => setFCustomer("") });
    if (fEngineer) chips.push({ id: "engineer", label: "工程師", value: fEngineer, onClear: () => setFEngineer("") });
    return chips;
  }, [deferredKeyword, fCustomer, fEngineer, fModel, fPhase, fRegion, machineModels]);
  const saveFilterNameTrimmed = saveFilterName.trim();
  const hasSavableInstallFilter = installActiveFilters.length > 0;
  const saveFilterDisabled = !saveFilterNameTrimmed || !hasSavableInstallFilter;
  const saveFilterTitle = !hasSavableInstallFilter
    ? "請先設定至少一個裝機篩選條件"
    : !saveFilterNameTrimmed
      ? "請輸入書籤名稱"
      : "儲存目前裝機篩選";

  const equipmentActiveFilters = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (eRegion) chips.push({ id: "region", label: "區域", value: regionLabel(eRegion), onClear: () => setERegion("") });
    if (eStatus) chips.push({ id: "status", label: "主狀態", value: eStatus, onClear: () => setEStatus("") });
    if (eCap) chips.push({ id: "capacity", label: "容量", value: eCap, onClear: () => setECap("") });
    if (deferredEquipmentKeyword) chips.push({ id: "keyword", label: "關鍵字", value: deferredEquipmentKeyword, onClear: () => setEKeyword("") });
    return chips;
  }, [deferredEquipmentKeyword, eCap, eRegion, eStatus]);

  const updateInstallCustomer = (value: string) => {
    const inferredRegion = resolveCustomerRegion(value);
    updateInstallCustomerDraft(value, inferredRegion);
  };

  const downloadInstallationsCsvReport = () => {
    if (installCsvDisabled) return;
    downloadInstallationsCsv(filteredInstallations);
  };

  const downloadInsightsReport = () => {
    if (insightsReportDisabled) return;
    const reportGovernance = shouldBuildInsightsData
      ? governanceReport
      : buildDashboardGovernanceReport(filteredInstallations, equipments);
    const reportAnalytics = shouldBuildInsightsData
      ? analytics
      : buildDashboardAnalytics({
        installations: filteredInstallations,
        equipments,
        engineers,
      });
    const markdown = buildInsightsMarkdownReport({
      today,
      appVersion,
      filterSummary: insightsFilterSummary,
      governance: reportGovernance,
      analytics: reportAnalytics,
    });
    downloadMarkdownFile(`install_insights_${today}.md`, markdown);
    trackEvent("insights_markdown_download", {
      appVersion,
      score: reportGovernance.score,
      issues: reportGovernance.totalIssues,
      installs: filteredInstallations.length,
      equipments: equipments.length,
    });
  };

  const downloadEquipmentCsvReport = () => {
    if (equipmentCsvDisabled) return;
    downloadEquipmentsCsv(filteredEquipments);
    trackEvent("equipment_csv_download", {
      appVersion,
      rows: filteredEquipments.length,
      total: equipments.length,
    });
  };

  // ───────── Actions: Installations ─────────
  const openAddInstall = () => {
    setInstallEditId(null);
    setInstallSubmitBusy(false);
    const inferredRegion = fCustomer ? resolveCustomerRegion(fCustomer) : null;
    setInstallForm(buildNewInstallationDraft(machineModels, {
      customer: fCustomer,
      region: fRegion,
      modelCode: fModel,
      phase: fPhase,
      engineer: fEngineer,
      inferredRegion,
    }));
    clearInstallErrors();
    setInstallModalOpen(true);
  };

  const openEditInstall = useCallback((r: Installation) => {
    setInstallEditId(r.id);
    setInstallSubmitBusy(false);
    setInstallForm(buildEditInstallationDraft(r, machineModels));
    clearInstallErrors();
    setInstallModalOpen(true);
  }, [clearInstallErrors, machineModels, setInstallForm]);


  const submitInstall = async () => {
    if (!user?.email) return;
    if (installSubmitBusy) return;
    const previousInstall = installEditId ? installations.find((row) => row.id === installEditId) ?? null : null;
    const normalized = normalizeInstallationForSave({
      ...installForm,
      progress: clamp(Number(installForm.progress), 0, 100),
    }, machineModels);
    const parsed = installationSchema.safeParse(normalized);
    if (!parsed.success) {
      setToast(showInstallValidationErrors(parsed.error.issues ?? []));
      return;
    }
    clearInstallErrors();
    setInstallSubmitBusy(true);
    try {
      let createdInstallId: string | null = null;
      if (installEditId) {
        await updateInstallation(installEditId, parsed.data);
        await writeAuditLog("更新", parsed.data.name, `更新裝機案：${parsed.data.phase}`, user.email);
        trackEvent("installation_update", { name: parsed.data.name, phase: parsed.data.phase });
      } else {
        createdInstallId = await createInstallation(parsed.data);
        await writeAuditLog("新增", parsed.data.name, `新增至${regionLabel(parsed.data.region)} — ${parsed.data.customer}`, user.email);
        trackEvent("installation_create", { name: parsed.data.name, phase: parsed.data.phase });
      }

      const baseVerb = installEditId ? "已更新" : "已新增";
      let finalToast = baseVerb;

      if (shouldTransferInstallationToEquipment(parsed.data)) {
        const transferResult = await transferReleasedInstallationToEquipment({
          installation: { id: installEditId || createdInstallId || "", ...parsed.data },
          installationId: installEditId || createdInstallId,
          userEmail: user.email,
          trigger: didInstallationEnterReleased(previousInstall?.phase, parsed.data.phase) ? "transition" : "refresh",
        });
        finalToast = getEquipmentTransferToast(transferResult);
      }

      setToast(finalToast);
      setInstallModalOpen(false);
    } catch (e) {
      setToast(`儲存失敗：${safeStr(e)}`);
    } finally {
      setInstallSubmitBusy(false);
    }
  };

  const delInstall = async (r: Installation) => {
    if (!user?.email) return;
    const label = getInstallTaskLabel(r);
    if (!confirm(`確定刪除「${label}」？`)) return;
    try {
      await removeInstallation(r.id);
      await writeAuditLog("刪除", label, "刪除裝機案", user.email);
      trackEvent("installation_delete", { name: label });
      setToast("已刪除");
    } catch (e) {
      setToast(`刪除失敗：${safeStr(e)}`);
    }
  };

  const advanceInstall = async (r: Installation) => {
    if (!user?.email) return;
    const cur = PHASE_MAP[r.phase];
    const next = PHASES.find((p) => p.seq === (cur?.seq ?? 0) + 1);
    if (!next) return;

    const nextDraft = normalizeInstallationForSave({
      ...r,
      phase: next.key,
      progress: getInstallationProgressByPhase(next.key),
    }, machineModels);
    const parsed = installationSchema.safeParse(nextDraft);
    if (!parsed.success) {
      setToast(parsed.error.issues?.[0]?.message ?? "階段推進驗證失敗");
      return;
    }

    try {
      if (shouldTransferInstallationToEquipment(parsed.data)) {
        const label = getInstallTaskLabel(r);
        const transferResult = await transferReleasedInstallationToEquipment({
          installation: { id: r.id, ...parsed.data },
          installationId: r.id,
          userEmail: user.email,
          trigger: didInstallationEnterReleased(r.phase, next.key) ? "transition" : "refresh",
        });
        await writeAuditLog("推進", label, `${cur?.label ?? r.phase} → ${next.label}`, user.email);
        trackEvent("installation_advance", { name: label, from: r.phase, to: next.key });
        setToast(getEquipmentTransferToast(transferResult));
        return;
      }

      const label = getInstallTaskLabel(r);
      await updateInstallation(r.id, { phase: next.key, progress: getInstallationProgressByPhase(next.key) });
      await writeAuditLog("推進", label, `${cur?.label ?? r.phase} → ${next.label}`, user.email);
      trackEvent("installation_advance", { name: label, from: r.phase, to: next.key });
      setToast("已推進階段");
    } catch (e) {
      setToast(`推進失敗：${safeStr(e)}`);
    }
  };

  const applyBulkInstallGovernance = async () => {
    if (!isAdmin) return;
    if (!user?.email) return;
    if (bulkInstallBusy) return;

    const owner = bulkInstallOwner.trim();
    const eta = bulkInstallEta.trim();
    const nextAction = bulkInstallAction.trim();
    if (!owner && !eta && !nextAction) {
      setToast("請至少填寫 Owner、ETA 或下一步動作");
      return;
    }

    const targetIds = bulkInstallTargets.ids;
    if (targetIds.length === 0) {
      setToast("目前篩選下沒有可批次更新的進行中裝機案");
      return;
    }

    const ok = confirm(`將批次更新目前篩選下 ${targetIds.length} 筆進行中裝機案。是否繼續？`);
    if (!ok) return;

    setBulkInstallBusy(true);
    try {
      const count = await updateInstallationsBulk(targetIds, {
        ...(owner ? { engineer: owner, nextOwner: owner } : {}),
        ...(eta ? { estComplete: eta, nextDueDate: eta } : {}),
        ...(nextAction ? { nextAction } : {}),
      });
      await writeAuditLog("批次治理", "installations", `更新 ${count} 筆 owner/ETA/nextAction`, user.email);
      trackEvent("installation_bulk_governance_update", { count, owner: Boolean(owner), eta: Boolean(eta), nextAction: Boolean(nextAction) });
      setToast(`已批次更新 ${count} 筆裝機案`);
      setBulkInstallOwner("");
      setBulkInstallEta("");
      setBulkInstallAction("");
    } catch (e) {
      setToast(`批次更新失敗：${getErrorMessage(e, "unknown")}`);
    } finally {
      setBulkInstallBusy(false);
    }
  };

  // ───────── Actions: Equipments ─────────
  const openAddEquip = () => {
    setEquipEditId(null);
    setEquipSubmitBusy(false);
    setEquipErrorSummary([]);
    setEquipErrors({});
    setEquipForm(getEquipmentDefaultFormDraft(machineModels?.[0]?.code ?? "FlexTRAK-S"));
    setEquipModalOpen(true);
  };

  const openEditEquip = (r: Equipment) => {
    setEquipEditId(r.id);
    setEquipSubmitBusy(false);
    setEquipErrorSummary([]);
    setEquipErrors({});
    setEquipForm(buildEquipmentFormDraftFromEquipment(r));
    setEquipModalOpen(true);
  };

  const submitEquip = async () => {
    if (!user?.email) return;
    if (equipSubmitBusy) return;

    const payload = buildEquipmentPayloadFromDraft(equipForm);
    const parsed = equipmentSchema.safeParse(payload);
    if (!parsed.success) {
      const summary = formatEquipmentValidationIssues(parsed.error.issues ?? []);
      setEquipErrorSummary(summary);
      setEquipErrors(buildEquipmentFieldErrors(parsed.error.issues ?? []));
      setToast(summary[0] ?? "表單驗證失敗");
      return;
    }

    setEquipErrorSummary([]);
    setEquipErrors({});
    const safeMilestones = buildSafeEquipmentMilestones(parsed.data.milestones);
    const safeBlocking = buildSafeEquipmentBlocking(parsed.data.blocking);
    const previousEquipment = equipEditId ? equipments.find((row) => row.id === equipEditId) : undefined;
    const lifecycleBlocking = mergeEquipmentBlockingLifecycle(previousEquipment?.blocking, safeBlocking);
    const equipmentData = { ...parsed.data };
    delete equipmentData.blocking;

    setEquipSubmitBusy(true);
    try {
      if (equipEditId) {
        const patch: EquipmentUpdatePatch = {
          ...equipmentData,
          milestones: safeMilestones,
          blocking: lifecycleBlocking ?? deleteField(), // deleteField() removes the field when no blocking
        };
        await updateEquipment(equipEditId, patch);
        await writeAuditLog("更新", parsed.data.equipmentId, `更新設備狀態：${parsed.data.statusMain}`, user.email);
        trackEvent("equipment_update", { equipmentId: parsed.data.equipmentId, statusMain: parsed.data.statusMain });
        setToast("已更新");
      } else {
        const createData: Omit<Equipment, "id"> = {
          ...equipmentData,
          milestones: safeMilestones,
          ...(lifecycleBlocking ? { blocking: lifecycleBlocking } : {}),
        };
        await createEquipment(createData);
        await writeAuditLog("新增", parsed.data.equipmentId, `新增設備：${parsed.data.customer} — ${parsed.data.modelCode}`, user.email);
        trackEvent("equipment_create", { equipmentId: parsed.data.equipmentId, statusMain: parsed.data.statusMain });
        setToast("已新增");
      }
      setEquipModalOpen(false);
      setEquipErrorSummary([]);
      setEquipErrors({});
    } catch (e) {
      setToast(`儲存失敗：${safeStr(e)}`);
    } finally {
      setEquipSubmitBusy(false);
    }
  };

  const delEquip = async (r: Equipment) => {
    if (!user?.email) return;
    if (!confirm(`確定刪除「${r.equipmentId}」？`)) return;
    try {
      await removeEquipment(r.id);
      await writeAuditLog("刪除", r.equipmentId, "刪除設備資料", user.email);
      trackEvent("equipment_delete", { equipmentId: r.equipmentId });
      setToast("已刪除");
    } catch (e) {
      setToast(`刪除失敗：${safeStr(e)}`);
    }
  };

  const openDrawer = useCallback((r: Equipment) => {
    setDrawerEq(r);
    setDrawerOpen(true);
  }, []);

  // ───────── Saved Filter callbacks ─────────
  const saveCurrentFilter = useCallback(() => {
    if (saveFilterDisabled) return;
    const name = saveFilterNameTrimmed;
    if (!name) return;
    addSavedFilter({
      name,
      region: fRegion,
      model: fModel,
      phase: fPhase,
      customer: fCustomer,
      engineer: fEngineer,
      keyword,
    });
    setSaveFilterName("");
    setShowSaveFilterInput(false);
    setToast(`已儲存書籤：${name}`);
  }, [addSavedFilter, saveFilterDisabled, saveFilterNameTrimmed, fRegion, fModel, fPhase, fCustomer, fEngineer, keyword]);

  const applyFilter = useCallback((f: SavedFilter) => {
    setFRegion(f.region);
    setFModel(f.model);
    setFPhase(f.phase);
    setFCustomer(f.customer);
    setFEngineer(f.engineer);
    setKeyword(f.keyword);
    setToast(`已套用書籤：${f.name}`);
  }, []);

  const deleteSavedFilterWithConfirm = useCallback((f: SavedFilter) => {
    const ok = confirm(`刪除書籤「${f.name}」？`);
    if (!ok) return;
    deleteSavedFilter(f.id);
    setToast(`已刪除書籤：${f.name}`);
  }, [deleteSavedFilter]);

  const switchInstallView = useCallback((view: InstallView) => {
    setInstallView(view);
    const next = view === "pipeline" ? "/dashboard/install" : `/dashboard/install?view=${view}`;
    router.replace(next, { scroll: false });
  }, [router]);

  const switchInsightsTab = useCallback((nextTab: InsightsTab) => {
    setInsightsTab(nextTab);
    const next = nextTab === "analytics" ? "/dashboard/insights" : `/dashboard/insights?tab=${nextTab}`;
    router.replace(next, { scroll: false });
  }, [router]);

  const toggleInstallSort = useCallback((key: InstallSortKey) => {
    if (installSortKey === key) {
      setInstallSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setInstallSortKey(key);
    setInstallSortDir(key === "updatedAt" ? "desc" : "asc");
  }, [installSortKey]);

  const toggleEquipSort = useCallback((key: EquipSortKey) => {
    if (equipSortKey === key) {
      setEquipSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setEquipSortKey(key);
    setEquipSortDir(key === "updatedAt" ? "desc" : "asc");
  }, [equipSortKey]);

  const installActionQueue: MissionQueueItem[] = useMemo(
    () => {
      if (section !== "install") return EMPTY_MISSION_QUEUE;
      return buildInstallActionQueue(filteredInstallations).map(({ target: row, targetId: _targetId, priority: _priority, ...item }) => ({
        ...item,
        onClick: () => openEditInstall(row),
      }));
    },
    [filteredInstallations, openEditInstall, section],
  );
  const equipmentActionQueue: MissionQueueItem[] = useMemo(
    () => {
      if (section !== "equipment") return EMPTY_MISSION_QUEUE;
      return buildEquipmentActionQueue(filteredEquipments, regionLabel).map(({ target: row, targetId: _targetId, priority: _priority, ...item }) => ({
        ...item,
        onClick: () => openDrawer(row),
      }));
    },
    [filteredEquipments, openDrawer, section],
  );

  const equipSubStatusOptions = EQUIPMENT_SUB_STATUS_OPTIONS[(equipForm.statusMain as EquipmentMainStatus) || "裝機"] ?? [];

  return (
      <div className="container dashboardShell auroraDashboardShell" style={{ paddingTop: 14, paddingBottom: 24 }}>
        {toast ? (
          <div className="card toastBanner" role="status" aria-live="polite">
            <div className="toastBannerText">{toast}</div>
            <button
              type="button"
              className="toastBannerClose"
              onClick={() => setToast("")}
              aria-label="關閉提示"
              title="關閉提示"
            >
              ×
            </button>
          </div>
        ) : null}

        {/* ───────── Section: Installations ───────── */}
        {section === "install" ? (
          <>
            <DashboardInstallSection
              isAdmin={isAdmin}
              installActionQueue={installActionQueue}
              installView={installView}
              switchInstallView={switchInstallView}
              downloadInstallationsCsvReport={downloadInstallationsCsvReport}
              installCsvDisabled={installCsvDisabled}
              installCsvTitle={installCsvTitle}
              onOpenSmartImport={() => setSmartImportOpen(true)}
              openAddInstall={openAddInstall}
              fRegion={fRegion}
              setFRegion={setFRegion}
              fPhase={fPhase}
              setFPhase={setFPhase}
              keyword={keyword}
              setKeyword={setKeyword}
              installSortKey={installSortKey}
              setInstallSortKey={setInstallSortKey}
              installSortDir={installSortDir}
              setInstallSortDir={setInstallSortDir}
              showInstallAdvancedFilters={showInstallAdvancedFilters}
              setShowInstallAdvancedFilters={setShowInstallAdvancedFilters}
              fModel={fModel}
              setFModel={setFModel}
              fCustomer={fCustomer}
              setFCustomer={setFCustomer}
              fEngineer={fEngineer}
              setFEngineer={setFEngineer}
              clearInstallFilters={clearInstallFilters}
              machineModels={machineModels}
              customers={customers}
              engineers={engineers}
              filteredInstallationsLength={filteredInstallations.length}
              installationsLength={installations.length}
              installActiveFilters={installActiveFilters}
              bulkInstallOwner={bulkInstallOwner}
              setBulkInstallOwner={setBulkInstallOwner}
              bulkInstallBusy={bulkInstallBusy}
              bulkInstallEta={bulkInstallEta}
              setBulkInstallEta={setBulkInstallEta}
              bulkInstallAction={bulkInstallAction}
              setBulkInstallAction={setBulkInstallAction}
              bulkInstallDisabled={bulkInstallDisabled}
              applyBulkInstallGovernance={applyBulkInstallGovernance}
              bulkInstallTitle={bulkInstallTitle}
              bulkInstallTargetCount={bulkInstallTargetCount}
              savedFilters={savedFilters}
              showSaveFilterInput={showSaveFilterInput}
              setShowSaveFilterInput={setShowSaveFilterInput}
              saveFilterName={saveFilterName}
              setSaveFilterName={setSaveFilterName}
              saveFilterDisabled={saveFilterDisabled}
              saveCurrentFilter={saveCurrentFilter}
              saveFilterTitle={saveFilterTitle}
              hasSavableInstallFilter={hasSavableInstallFilter}
              applyFilter={applyFilter}
              deleteSavedFilterWithConfirm={deleteSavedFilterWithConfirm}
              installErr={installErr}
              installLoading={installLoading}
            />

            {installView === "pipeline" || installView === "gantt" ? null : (
              <div className="card auroraTablePanel" style={{ marginTop: 12 }}>
                <div className="tableWrap">
                  <table className="table dataTableDense installListTable">
                    <colgroup>
                      <col className="installListColSerial" />
                      <col className="installListColCustomer" />
                      <col className="installListColRegion" />
                      <col className="installListColModel" />
                      <col className="installListColPhase" />
                      <col className="installListColSla" />
                      <col className="installListColNextAction" />
                      <col className="installListColEngineer" />
                      <col className="installListColProgress" />
                      <col className="installListColDueDate" />
                      <col className="installListColUpdated" />
                      <col className="installListColActions" />
                    </colgroup>
                    <thead>
                      <tr>
                        <SortableTh className="tableStickyLeft" label="機台序號" active={installSortKey === "name"} dir={installSortDir} onClick={() => toggleInstallSort("name")} />
                        <SortableTh label="客戶" active={installSortKey === "customer"} dir={installSortDir} onClick={() => toggleInstallSort("customer")} />
                        <th>區域</th>
                        <th>機型</th>
                        <SortableTh label="階段" active={installSortKey === "phase"} dir={installSortDir} onClick={() => toggleInstallSort("phase")} />
                        <th>SLA</th>
                        <th>下一步</th>
                        <SortableTh label="工程師" active={installSortKey === "engineer"} dir={installSortDir} onClick={() => toggleInstallSort("engineer")} />
                        <th>進度</th>
                        <SortableTh label="預計安裝日" active={installSortKey === "estComplete"} dir={installSortDir} onClick={() => toggleInstallSort("estComplete")} />
                        <SortableTh label="更新" active={installSortKey === "updatedAt"} dir={installSortDir} onClick={() => toggleInstallSort("updatedAt")} />
                        <th className="tableStickyRight">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleInstallations.map((r) => {
                        const phase = PHASE_MAP[r.phase];
                        const overdue = isOverdueInstall(r, today);
                        const serial = getInstallSerial(r);
                        const sla = getInstallSlaStatus(r, today);
                        return (
                          <tr key={r.id}>
                            <td className="tableStickyLeft tableSerialCell" title={serial}>{serial}</td>
                            <td className="tableTextClip" title={r.customer}>{r.customer}</td>
                            <td><Badge text={REGIONS[r.region].label} color={REGIONS[r.region].color} subtle /></td>
                            <td><Badge text={r.modelCode} color="#3b82f6" subtle /></td>
                            <td><Badge text={`${phase.icon} ${phase.label}`} color={phase.color} subtle /></td>
                            <td title={sla.title}><Badge text={sla.label} color={sla.color} subtle /></td>
                            <td className="tableTextClip" title={[r.nextAction, r.nextOwner, r.nextDueDate].filter(Boolean).join(" · ") || "-"}>
                              <div style={{ fontWeight: 900 }}>{r.nextAction || "-"}</div>
                              <div className="tableSecondaryText">{r.nextOwner || toDisplayShortName(r.engineer) || "未指派"} · {r.nextDueDate || r.estComplete || "未設定"}</div>
                            </td>
                            <td className="installListEngineer">{toDisplayShortName(r.engineer) || "-"}</td>
                            <td>
                              <div className="progressOuter" style={{ maxWidth: 140 }}>
                                <div className="progressInner" style={{ width: `${clamp(r.progress ?? 0, 0, 100)}%` }} />
                              </div>
                              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                                {r.progress ?? 0}% {overdue ? <span style={{ color: "#ef4444", fontWeight: 900 }}>（逾期）</span> : null}
                              </div>
                            </td>
                            <td className="installListDueDate tableDateCell">{r.estComplete || "-"}</td>
                            <td className="tableDateCell tableSecondaryText">{fmtDate(r.updatedAt)}</td>
                            <td className="tableStickyRight tableActionsCell">
                              <div className="tableActions">
                                <button className="btn btnSmall" onClick={() => advanceInstall(r)}>推進</button>
                                <button className="btn btnSmall" onClick={() => openEditInstall(r)}>編輯</button>
                                <button className="btn btnSmall btnDanger" onClick={() => delInstall(r)}>刪除</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredInstallations.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="dashboardEmptyCell">
                            {installLoading ? (
                              <DashboardEmptyState
                                title="正在同步裝機資料"
                                detail="讀取完成後會自動更新清單。"
                              />
                            ) : installErr ? (
                              <DashboardEmptyState
                                title="裝機資料讀取失敗"
                                detail="請稍後重新整理，或確認帳號權限。"
                              />
                            ) : installations.length === 0 ? (
                              <DashboardEmptyState
                                title="尚無裝機案"
                                detail="先建立第一筆裝機資料，或匯入現有 Excel 清單。"
                                primaryAction={{ label: "新增裝機案", onClick: openAddInstall, variant: "accent" }}
                                secondaryAction={{ label: "Excel 智慧匯入", onClick: () => setSmartImportOpen(true) }}
                              />
                            ) : (
                              <DashboardEmptyState
                                title="沒有符合的裝機案"
                                detail="調整條件或清除目前篩選。"
                                primaryAction={{ label: "清除篩選", onClick: clearInstallFilters }}
                              />
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {filteredInstallations.length > visibleInstallations.length ? (
                  <div className="tableLoadMore">
                    <span>已顯示 {visibleInstallations.length} / {filteredInstallations.length} 筆，CSV 仍會匯出目前篩選的全部資料。</span>
                    <button className="btn btnSmall" onClick={() => setInstallVisibleCount((value) => value + TABLE_PAGE_SIZE)}>載入更多</button>
                  </div>
                ) : null}
              </div>
            )}
          </>
        ) : null}

        {/* ───────── Section: Pipeline (integrated in install view) ───────── */}
        {section === "install" && installView === "pipeline" ? (
          <>
            <div className="card pipelineIntroCard auroraPipelineIntro" style={{ padding: 14 }}>
              <div className="pipelineIntroTitle">Pipeline（流程圖 + Kanban）</div>
              <div className="pipelineIntroDesc">
                先看流程節點分佈，再往下執行各階段案件。使用目前「裝機進度」篩選條件。
              </div>
            </div>

            <div className="card pipelineFlowPanel auroraPipelineFlow" style={{ marginTop: 12 }}>
              <div className="pipelineFlow">
                {PHASES.map((p, idx) => {
                  const count = installStats.byPhase[p.key] ?? 0;
                  const ratio = installStats.total ? Math.round((count / installStats.total) * 100) : 0;
                  const phaseStyle = { ["--phase-color" as string]: p.color } as CSSProperties;
                  return (
                    <div key={p.key} className="pipelineNodeWrap">
                      <div className="pipelineNode" style={phaseStyle}>
                        <div className="pipelineNodeStep">S{String(idx + 1).padStart(2, "0")}</div>
                        <div className="pipelineNodeIcon">{p.icon}</div>
                        <div className="pipelineNodeLabel">{p.label}</div>
                        <div className="pipelineNodeStats">
                          <span className="pipelineNodeCount">{count}</span>
                          <span className="pipelineNodeRatio">{ratio}%</span>
                        </div>
                      </div>
                      {idx < PHASES.length - 1 ? <div className="pipelineNodeArrow" aria-hidden>→</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="kanban pipelineKanban auroraPipelineKanban" style={{ marginTop: 12 }}>
              {PHASES.map((p) => {
                const rows = installationRowsByPhase.get(p.key) ?? [];
                const phaseStyle = { ["--phase-color" as string]: p.color } as CSSProperties;
                return (
                  <div key={p.key} className="kanbanCol" style={phaseStyle}>
                    <div className="kanbanColHead">
                      <div className="kanbanColTitle">{p.icon} {p.label}</div>
                      <div className="pill">{rows.length}</div>
                    </div>
                    <div className="kanbanColBody">
                      {rows.map((r) => {
                        const sla = getInstallSlaStatus(r, today);
                        return (
                          <div key={r.id} className="kanbanCard" onClick={() => openEditInstall(r)} role="button">
                            <div className="kanbanCaseTop">
                              <div className="mono kanbanCaseName">{getInstallSerial(r)}</div>
                              <div className="kanbanCaseProgress mono">{r.progress ?? 0}%</div>
                            </div>

                            <div className="kanbanCaseMeta">
                              <span className="kanbanCaseCustomer">{r.customer}</span>
                              <span className="kanbanCaseEngineer">{toDisplayShortName(r.engineer) || "-"}</span>
                            </div>

                            <div className="kanbanCaseMeter">
                              <div className="kanbanCaseMeterInner" style={{ width: `${clamp(r.progress ?? 0, 0, 100)}%`, background: p.color }} />
                            </div>

                            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                              <Badge text={REGIONS[r.region].label} color={REGIONS[r.region].color} subtle />
                              <Badge text={r.modelCode} color="#3b82f6" subtle />
                              <span title={sla.title}>
                                <Badge text={sla.label} color={sla.color} subtle />
                              </span>
                              {r.estComplete ? (
                                (() => {
                                  const dl = daysLeft(r.estComplete);
                                  const isOver = dl != null && dl < 0 && r.phase !== "released";
                                  return <Badge text={`預計 ${r.estComplete}${isOver ? " 警戒" : ""}`} color={isOver ? "#ef4444" : "#94a3b8"} subtle />;
                                })()
                              ) : null}
                            </div>

                            <div style={{ marginTop: 8, color: "#64748b", fontSize: 12, lineHeight: 1.45 }}>
                              <strong style={{ color: "var(--foreground)" }}>{r.nextAction || "未設定下一步"}</strong>
                              <div>{r.nextOwner || toDisplayShortName(r.engineer) || "未指派"} · {r.nextDueDate || r.estComplete || "未設定期限"}</div>
                            </div>

                            {r.phase !== "released" ? (
                              <button
                                className="btn btnSmall"
                                style={{ marginTop: 10, width: "100%" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  advanceInstall(r);
                                }}
                              >
                                推進
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {rows.length === 0 ? (
                        <div className="kanbanEmptyState">此階段目前無案件</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {/* ───────── Section: Gantt (integrated in install view) ───────── */}
        {section === "install" && installView === "gantt" ? (
          <GanttView rows={filteredInstallations} onClickRow={openEditInstall} />
        ) : null}

                {/* ───────── Section: Equipment ───────── */}
        {section === "equipment" ? (
          <DashboardEquipmentSection
            equipmentActionQueue={equipmentActionQueue}
            downloadEquipmentCsvReport={downloadEquipmentCsvReport}
            equipmentCsvDisabled={equipmentCsvDisabled}
            equipmentCsvTitle={equipmentCsvTitle}
            onOpenSmartImport={() => setSmartImportOpen(true)}
            openAddEquip={openAddEquip}
            eRegion={eRegion}
            setERegion={setERegion}
            eStatus={eStatus}
            setEStatus={setEStatus}
            eCap={eCap}
            setECap={setECap}
            eKeyword={eKeyword}
            setEKeyword={setEKeyword}
            equipSortKey={equipSortKey}
            setEquipSortKey={setEquipSortKey}
            equipSortDir={equipSortDir}
            setEquipSortDir={setEquipSortDir}
            clearEquipmentFilters={clearEquipmentFilters}
            filteredEquipments={filteredEquipments}
            equipments={equipments}
            equipmentActiveFilters={equipmentActiveFilters}
            equipStats={equipStats}
            equipErr={equipErr}
            equipLoading={equipLoading}
            visibleEquipments={visibleEquipments}
            toggleEquipSort={toggleEquipSort}
            openDrawer={openDrawer}
            openEditEquip={openEditEquip}
            delEquip={delEquip}
            setEquipVisibleCount={setEquipVisibleCount}
            tablePageSize={TABLE_PAGE_SIZE}
          />
        ) : null}

        {section === "insights" ? (
          <DashboardInsightsSection
            isAdmin={isAdmin}
            activeInsightsTab={activeInsightsTab}
            switchInsightsTab={switchInsightsTab}
            downloadInsightsReport={downloadInsightsReport}
            insightsReportDisabled={insightsReportDisabled}
            insightsReportTitle={insightsReportTitle}
            auditLogs={auditLogs}
            events={events}
            retAuditDays={retAuditDays}
            setRetAuditDays={setRetAuditDays}
            retEventDays={retEventDays}
            setRetEventDays={setRetEventDays}
            retAutoEnabled={retAutoEnabled}
            setRetAutoEnabled={setRetAutoEnabled}
            retAutoTime={retAutoTime}
            setRetAutoTime={setRetAutoTime}
            saveRetention={saveRetention}
            today={today}
            doPurgeByRetention={doPurgeByRetention}
            purgeBusy={purgeBusy}
            doClearAllLogs={doClearAllLogs}
            purgeHint={purgeHint}
            retentionCfg={retentionCfg}
          />
        ) : null}

        {/* ───────── Section: Insights / Analytics ───────── */}
        {section === "insights" && activeInsightsTab === "analytics" ? (
          <>
            <div className="card" style={{ padding: 14, marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 4 }}>治理健康 / Data Quality</div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    進行中裝機 {governanceReport.activeInstallations} 案 · 設備 {governanceReport.equipments} 台 · 問題 {governanceReport.totalIssues} 件
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>SCORE</div>
                  <div style={{ fontSize: 32, lineHeight: 1, fontWeight: 900, color: pickGovernanceToneColor(governanceReport.tone) }}>
                    {governanceReport.score}
                  </div>
                </div>
              </div>
              <div style={{ height: 10, background: "rgba(148,163,184,0.18)", borderRadius: 999, overflow: "hidden", marginTop: 12 }}>
                <div
                  style={{
                    width: `${governanceReport.score}%`,
                    height: "100%",
                    background: pickGovernanceToneColor(governanceReport.tone),
                  }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
                {governanceReport.issueRows.map((issue) => {
                  const issueColor = pickGovernanceToneColor(issue.tone);
                  return (
                    <div
                      key={issue.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: 10,
                        background: issue.count > 0 ? `${issueColor}0f` : "rgba(15,23,42,0.18)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ fontWeight: 900, fontSize: 12 }}>{issue.label}</div>
                        <div style={{ fontWeight: 900, color: issueColor }}>{issue.count}</div>
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 5, lineHeight: 1.45 }}>{issue.detail}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {filteredInstallations.length === 0 ? (
              <div className="card" style={{ padding: 14, marginTop: 12 }}>
                <DashboardEmptyState
                  title={
                    installLoading
                      ? "正在同步分析資料"
                      : installErr
                        ? "分析資料讀取失敗"
                        : installations.length === 0
                          ? "尚無裝機案資料"
                          : "目前篩選沒有分析資料"
                  }
                  detail={
                    installLoading
                      ? "資料讀取完成後會自動更新分析圖表。"
                      : installErr
                        ? "請稍後重新整理，或確認帳號權限。"
                        : installations.length === 0
                          ? "先新增或匯入裝機案後再查看分析。"
                          : "清除篩選或調整條件後再查看分析。"
                  }
                  primaryAction={
                    !installLoading && !installErr && installations.length > 0
                      ? { label: "清除篩選", onClick: clearInstallFilters }
                      : undefined
                  }
                />
              </div>
            ) : (
              <>
                <div className="card" style={{ padding: 14, marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>🔄 階段分佈</div>
                  <div style={{ display: "flex", gap: 2, height: 28, borderRadius: 10, overflow: "hidden" }}>
                    {PHASES.map((p) => {
                      const c = anPhase.by[p.key] ?? 0;
                      if (!c) return null;
                      const pct = anPhase.total ? Math.round((c / anPhase.total) * 100) : 0;
                      return (
                        <div
                          key={p.key}
                          title={`${p.label} ${c}`}
                          style={{
                            width: `${pct}%`,
                            minWidth: 26,
                            background: p.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 900
                          }}
                        >
                          {c}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    {PHASES.map((p) => (
                      <div key={p.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: p.color }} />
                        {p.label} <span style={{ color: "var(--foreground)", fontWeight: 900 }}>{anPhase.by[p.key] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ padding: 14, marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>📊 區域進度</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                    {anRegion.map((rg) => (
                      <div key={rg.key} className="card" style={{ padding: 12, borderColor: `${rg.color}33`, background: `${rg.color}0a` }}>
                        <div style={{ fontWeight: 900, color: rg.color }}>{rg.label}</div>
                        <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{rg.total} 案 · 平均 {rg.avg}%</div>
                        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                          {rg.rows.length ? rg.rows.map((r: Installation) => (
                            <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontWeight: 900, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {getInstallModelSerial(r)}
                              </div>
                              <Badge text={PHASE_MAP[r.phase as PhaseKey]?.label ?? r.phase} color={PHASE_MAP[r.phase as PhaseKey]?.color ?? "#3b82f6"} subtle />
                            </div>
                          )) : (
                            <div style={{ color: "#94a3b8", fontSize: 12 }}>—</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ padding: 14, marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>👷 工程師工作量</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {anEngineer.map((e) => (
                      <div key={e.name} className="card" style={{ padding: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 900, minWidth: 120 }}>{e.name}</div>
                          <div style={{ flex: 1, minWidth: 160, height: 14, background: "rgba(148,163,184,0.25)", borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ width: `${e.pct}%`, height: "100%", background: "#3b82f6" }} />
                          </div>
                          <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#94a3b8" }}>
                            <span>總數 <span style={{ color: "var(--foreground)", fontWeight: 900 }}>{e.total}</span></span>
                            <span>進行中 <span style={{ color: "#f59e0b", fontWeight: 900 }}>{e.active}</span></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card" style={{ padding: 14, marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>⏰ 逾期 / 即將到期（14 天內）</div>
                  {anDue.length === 0 ? (
                    <div style={{ padding: 10, color: "#10b981", fontWeight: 900 }}>✅ 所有案件如期進行</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {anDue.map((r) => {
                        const dl = r.dl;
                        const isOver = dl < 0;
                        return (
                          <div
                            key={r.id}
                            className="card"
                            style={{
                              padding: 12,
                              borderColor: isOver ? "rgba(239,68,68,0.35)" : "rgba(245,158,11,0.35)",
                              background: isOver ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 900 }}>
                                {getInstallModelSerial(r)} <span style={{ color: "#94a3b8", fontWeight: 600 }}>· {r.customer}</span>
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <Badge text={PHASE_MAP[r.phase]?.label ?? r.phase} color={PHASE_MAP[r.phase]?.color ?? "#3b82f6"} subtle />
                                <span style={{ fontWeight: 900, color: isOver ? "#ef4444" : "#f59e0b" }}>
                                  {isOver ? `逾期 ${Math.abs(dl)} 天` : dl === 0 ? "今日到期" : `${dl} 天`}
                                </span>
                              </div>
                            </div>
                            <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 12 }}>預計安裝日：{r.estComplete || "-"}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 12 }}>
                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>交付 Cycle Time</div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>完成案</div>
                        <div style={{ fontSize: 24, fontWeight: 900 }}>{cycleTime.completedCount}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>平均天數</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#3b82f6" }}>{cycleTime.avgDays}</div>
                      </div>
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>P50</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#0ea5e9" }}>{cycleTime.p50Days}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
                      {cycleTime.longestRows.length ? cycleTime.longestRows.map((row) => (
                        <div key={row.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
                            <div style={{ color: "#94a3b8", fontSize: 11 }}>{row.customer} · 完成 {row.completedAt}</div>
                          </div>
                          <Badge text={`${row.days} 天`} color="#3b82f6" subtle />
                        </div>
                      )) : (
                        <div style={{ color: "#94a3b8", fontSize: 12 }}>尚無實際完成日可計算。</div>
                      )}
                    </div>
                  </div>

                  <div className="card" style={{ padding: 14 }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>階段 Aging / SLA</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {phaseAging.map((row) => (
                        <div key={row.key}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                            <span style={{ fontWeight: 900, color: row.color }}>{row.label}</span>
                            <span style={{ color: "#94a3b8" }}>
                              {row.count} 案 · 平均 {row.avgAgeDays} 天 · 最長 {row.maxAgeDays} 天
                            </span>
                          </div>
                          <div style={{ height: 8, background: "rgba(148,163,184,0.18)", borderRadius: 999, overflow: "hidden", marginTop: 5 }}>
                            <div
                              style={{
                                width: `${Math.min(100, row.maxAgeDays * 8)}%`,
                                height: "100%",
                                background: row.breached > 0 ? "#ef4444" : row.color,
                              }}
                            />
                          </div>
                          {row.breached > 0 ? (
                            <div style={{ color: "#ef4444", fontSize: 11, fontWeight: 900, marginTop: 3 }}>逾 SLA {row.breached} 案</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: 14, marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>客戶 / 機型健康摘要</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                    {[
                      { title: "客戶健康", rows: customerHealth },
                      { title: "機型健康", rows: modelHealth },
                    ].map((healthPanel) => (
                      <div key={healthPanel.title} className="card" style={{ padding: 12 }}>
                        <div style={{ fontWeight: 900, marginBottom: 10 }}>{healthPanel.title}</div>
                        <div style={{ display: "grid", gap: 9 }}>
                          {healthPanel.rows.length ? healthPanel.rows.map((row) => {
                            const healthColor = pickHealthColor(row.health);
                            return (
                              <div key={row.name}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                  <div style={{ fontWeight: 900, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
                                  <div style={{ fontWeight: 900, color: healthColor }}>{row.health}</div>
                                </div>
                                <div style={{ height: 8, background: "rgba(148,163,184,0.18)", borderRadius: 999, overflow: "hidden", marginTop: 5 }}>
                                  <div style={{ width: `${row.health}%`, height: "100%", background: healthColor }} />
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "#94a3b8", fontSize: 11, marginTop: 5 }}>
                                  <span>裝機 {row.installs}</span>
                                  <span>進行 {row.activeInstalls}</span>
                                  <span>設備 {row.equipments}</span>
                                  <span style={{ color: row.overdue > 0 ? "#ef4444" : "#94a3b8" }}>逾期 {row.overdue}</span>
                                  <span style={{ color: row.blocked > 0 ? "#ef4444" : "#94a3b8" }}>阻塞 {row.blocked}</span>
                                </div>
                              </div>
                            );
                          }) : (
                            <div style={{ color: "#94a3b8", fontSize: 12 }}>尚無資料。</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="card" style={{ padding: 14, marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>設備：狀態 / 容量（摘要）</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>主狀態</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {EQUIPMENT_MAIN_STATUSES.map((s) => (
                      <Badge key={s} text={`${s} ${equipStats.byStatus[s]}`} color={STATUS_COLOR[s]} subtle />
                    ))}
                  </div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>容量等級</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {CAPACITY_LEVELS.map((c) => (
                      <Badge key={c} text={`${c} ${equipStats.byCap[c]}`} color={CAPACITY_COLOR[c]} subtle />
                    ))}
                  </div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>平均稼動率</div>
                  <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: pickColorByUtil(equipStats.avgUtil) }}>{equipStats.avgUtil}%</div>
                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>
                    阻塞中：{equipStats.blocked} · 已解決：{equipStats.resolvedBlocking} · 平均處理：{equipStats.avgBlockingDays} 天
                  </div>
                </div>
              </div>

              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>
                events 詳細紀錄請至「📝 紀錄」。
              </div>
            </div>

            {/* ── 地區產品產能 ── */}
            {regionProductStats.length > 0 && (
              <div className="card" style={{ padding: 14, marginTop: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>🏭 地區產品產能</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {regionProductStats.map((rg) => (
                    <div key={rg.key} className="card" style={{ padding: 12, borderColor: `${rg.color}33`, background: `${rg.color}0a` }}>
                      <div style={{ fontWeight: 900, color: rg.color, marginBottom: 10 }}>{rg.label}</div>
                      {rg.products.map((p) => (
                        <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
                          <span style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 900 }}>
                            {p.name}
                          </span>
                          <span style={{ fontWeight: 900, fontSize: 13 }}>
                            {/*
                             * Display aggregated region-product capacity using the same
                             * formatting helper as other sections. See src/domain/capacity.ts.
                             * For values >= 1,000 this returns a compact form like “5.1K”,
                             * and for smaller values it returns the plain number. Do not
                             * append an extra "K" here; otherwise values like 5100 will
                             * incorrectly become 5,100K (5.1M).
                             */}
                            {formatUphValue(p.cap)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* ───────── Drawer: Equipment detail ───────── */}
        <Drawer
          open={drawerOpen}
          title={drawerEq ? `設備詳情：${drawerEq.equipmentId}` : "設備詳情"}
          onClose={() => setDrawerOpen(false)}
        >
          {drawerEq ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>{drawerEq.customer} · {drawerEq.site}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge text={regionLabel(drawerEq.region)} color={REGIONS[drawerEq.region].color} subtle />
                  <Badge text={drawerEq.modelCode} color="#3b82f6" subtle />
                  <Badge text={getEquipmentSerialLabel(drawerEq) || "-"} color="#94a3b8" subtle />
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge text={drawerEq.statusMain} color={STATUS_COLOR[drawerEq.statusMain]} subtle />
                  <Badge text={drawerEq.capacity.level} color={CAPACITY_COLOR[drawerEq.capacity.level]} subtle />
                  <Badge text={`稼動 ${getLiveUtilization(drawerEq.capacity)}%`} color={pickColorByUtil(getLiveUtilization(drawerEq.capacity))} subtle />
                  <Badge text={`UPH ${drawerEq.capacity.uph}/${drawerEq.capacity.targetUph}`} color="#94a3b8" subtle />
                </div>

                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 10 }}>
                  Owner：{drawerEq.owner || "-"} · 更新：{fmtDate(drawerEq.updatedAt)}
                </div>
              </div>

              <div className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>里程碑</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, fontSize: 12, color: "#94a3b8" }}>
                  <div>installStart：{drawerEq.milestones?.installStart || "-"}</div>
                  <div>installDone：{drawerEq.milestones?.installDone || "-"}</div>
                  <div>trialStart：{drawerEq.milestones?.trialStart || "-"}</div>
                  <div>trialPass：{drawerEq.milestones?.trialPass || "-"}</div>
                  <div>prodStart：{drawerEq.milestones?.prodStart || "-"}</div>
                  <div>reachTargetDate：{drawerEq.milestones?.reachTargetDate || "-"}</div>
                </div>
              </div>

              <div className="card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>趨勢（7 天）</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <MiniTrend values={drawerEq.capacity.trend7d} color={CAPACITY_COLOR[drawerEq.capacity.level]} />
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    {drawerEq.capacity.trend7d.join(", ")}
                  </div>
                </div>
              </div>

              {drawerEq.blocking?.reasonCode ? (
                <div className="card" style={{ padding: 12, borderColor: `${EQUIPMENT_BLOCKING_STATUS_COLOR[normalizeEquipmentBlockingStatus(drawerEq.blocking.status)]}55` }}>
                  <div style={{ fontWeight: 900, marginBottom: 8, color: EQUIPMENT_BLOCKING_STATUS_COLOR[normalizeEquipmentBlockingStatus(drawerEq.blocking.status)] }}>
                    阻塞 · {EQUIPMENT_BLOCKING_STATUS_LABEL[normalizeEquipmentBlockingStatus(drawerEq.blocking.status)]}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    原因：{drawerEq.blocking.reasonCode}
                    <br />
                    細節：{drawerEq.blocking.detail}
                    <br />
                    Owner：{drawerEq.blocking.owner}
                    <br />
                    ETA：{drawerEq.blocking.eta || "-"}
                    <br />
                    處理天數：{getEquipmentBlockingAgeDays(drawerEq.blocking) ?? "-"} 天
                    <br />
                    重開次數：{drawerEq.blocking.reopenCount ?? 0}
                    {drawerEq.blocking.resolutionNote ? (
                      <>
                        <br />
                        解決備註：{drawerEq.blocking.resolutionNote}
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </Drawer>

        {/* ───────── Modal: Installation ───────── */}
        <Modal
          open={installModalOpen}
          title={installEditId ? "編輯裝機案" : "新增裝機案"}
          onClose={() => {
            if (installSubmitBusy) return;
            clearInstallErrors();
            setInstallModalOpen(false);
          }}
        >
          <div className="quickFormIntro">
            <div>
              <strong>{installEditId ? "維護必要狀態即可" : "快速新增只需要先填基本資料"}</strong>
              <p>{getPhaseHint(installForm.phase)}</p>
            </div>
            <span className="quickFormBadge">{PHASE_MAP[installForm.phase]?.label ?? "裝機案"} · {installForm.progress ?? 0}%</span>
          </div>

          <div className="formGrid quickFormGrid">
            <div className="field" ref={(node) => { installFieldRefs.current.customer = node; }}>
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>客戶</div>
              <input list="customerOptions" value={installForm.customer} onChange={(e) => updateInstallCustomer(e.target.value)} aria-invalid={!!installErrors.customer} placeholder="例如：TSMC F18" />
              {resolveCustomerRegion(installForm.customer) ? (
                <div className="fieldHint">已依客戶清單帶入 {regionLabel(resolveCustomerRegion(installForm.customer) as RegionKey)}</div>
              ) : (
                <div className="fieldHint">找不到客戶對應時，請手動確認區域。</div>
              )}
              {installErrors.customer ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.customer}</div> : null}
            </div>

            <div className="field" ref={(node) => { installFieldRefs.current.region = node; }}>
              <div className="label">區域</div>
              <select value={installForm.region} onChange={(e) => updateInstallField("region", parseRegionKey(e.target.value))} aria-invalid={!!installErrors.region}>
                {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {installErrors.region ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.region}</div> : null}
            </div>

            <div className="field" ref={(node) => { installFieldRefs.current.modelCode = node; }}>
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>機型</div>
              <select value={installForm.modelCode} onChange={(e) => updateInstallField("modelCode", e.target.value)} aria-invalid={!!installErrors.modelCode}>
                {machineModels.map((m: MachineModel) => <option key={m.code} value={m.code}>{m.displayName}</option>)}
              </select>
              {installErrors.modelCode ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.modelCode}</div> : null}
            </div>

            <div className="field" ref={(node) => { installFieldRefs.current.phase = node; }}>
              <div className="label">階段</div>
              <select value={installForm.phase} onChange={(e) => updateInstallPhase(parsePhaseKey(e.target.value))}>
                {PHASES.map((p) => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
              </select>
              {installErrors.phase ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.phase}</div> : null}
            </div>

            <div className="field" ref={(node) => { installFieldRefs.current.name = node; }}>
              <div className="label">
                {doesInstallationPhaseRequireSerial(installForm.phase)
                  ? <span style={{color:"var(--destructive)"}}>* </span>
                  : null}
                機台序號
              </div>
              <input value={installForm.name} onChange={(e) => updateInstallField("name", e.target.value)} aria-invalid={!!installErrors.name} placeholder={doesInstallationPhaseRequireSerial(installForm.phase) ? "到廠後必填，例如 P160623" : "未到廠前可留空"} />
              {installErrors.name ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.name}</div> : null}
            </div>

            <div className="field" ref={(node) => { installFieldRefs.current.engineer = node; }}>
              <div className="label">
                {doesInstallationPhaseRequireEngineer(installForm.phase) ? <span style={{color:"var(--destructive)"}}>* </span> : null}
                工程師
              </div>
              <select value={installForm.engineer} onChange={(e) => updateInstallField("engineer", e.target.value)} aria-invalid={!!installErrors.engineer}>
                <option value="">請選擇工程師</option>
                {engineers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                {installForm.engineer && !engineers.includes(installForm.engineer) ? (
                  <option value={installForm.engineer}>{installForm.engineer}（舊）</option>
                ) : null}
              </select>
              {installErrors.engineer ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.engineer}</div> : null}
            </div>
          </div>

          <details className="formSection" open={Boolean(installEditId)}>
            <summary>時程與進度</summary>
            <div className="formGrid">
              {INSTALLATION_DATE_FIELDS.map((field) => (
                <div className="field" key={field.key} ref={(node) => { installFieldRefs.current[field.key] = node; }}>
                  <div className="label">{field.label}</div>
                  <DateInput
                    value={installForm[field.key]}
                    onChange={(value) => updateInstallField(field.key, value)}
                  />
                  {installErrors[field.key] ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors[field.key]}</div> : null}
                </div>
              ))}

              <div className="field">
                <div className="label">下一步 Owner</div>
                <select value={installForm.nextOwner} onChange={(e) => updateInstallField("nextOwner", e.target.value)}>
                  <option value="">未指定</option>
                  {engineers.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  {installForm.nextOwner && !engineers.includes(installForm.nextOwner) ? (
                    <option value={installForm.nextOwner}>{installForm.nextOwner}（舊）</option>
                  ) : null}
                </select>
              </div>

              <div className="field">
                <div className="label">下一步期限</div>
                <DateInput value={installForm.nextDueDate} onChange={(value) => updateInstallField("nextDueDate", value)} />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="label">下一步動作</div>
                <input
                  value={installForm.nextAction}
                  onChange={(e) => updateInstallField("nextAction", e.target.value)}
                  placeholder="例如：確認客戶二次驗收窗口"
                />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="label">逾期原因</div>
                <input
                  value={installForm.overdueReason}
                  onChange={(e) => updateInstallField("overdueReason", e.target.value)}
                  placeholder="例如：客戶停機窗口延後、料件未到、現場配管未完成"
                />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="label">進度（0~100）</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={installForm.progress}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const v = Number.isFinite(n) ? clamp(n, 0, 100) : 0;
                    setInstallForm({ ...installForm, progress: v });
                  }}
                />
              </div>
            </div>
          </details>

          {(() => {
            const checklistItems = PHASE_CHECKLIST[installForm.phase] ?? [];
            if (checklistItems.length === 0) return null;
            const done = checklistItems.filter((it) => installForm.checklist?.[it.id]).length;
            return (
              <details className="formSection" open={Boolean(installEditId)}>
                <summary>檢查清單 <span>{done}/{checklistItems.length}</span></summary>
                <div className="checklistGrid">
                  {checklistItems.map((item) => {
                    const checked = !!(installForm.checklist?.[item.id]);
                    return (
                      <label key={item.id} className="checklistItem">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const nextChecklist = { ...installForm.checklist, [item.id]: !checked };
                            const nextDone = checklistItems.filter((it) => nextChecklist[it.id]).length;
                            const autoProgress = Math.round((nextDone / checklistItems.length) * 20) * 5;
                            setInstallForm({ ...installForm, checklist: nextChecklist, progress: autoProgress });
                          }}
                        />
                        <span style={{ textDecoration: checked ? "line-through" : "none" }}>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              </details>
            );
          })()}

          <details className="formSection">
            <summary>更多資料</summary>
            <div className="formGrid">
              <div className="field">
                <div className="label">聯絡人</div>
                <input value={installForm.custContact} onChange={(e) => updateInstallField("custContact", e.target.value)} placeholder="可選填" />
              </div>
              <div className="field">
                <div className="label">聯絡電話</div>
                <input value={installForm.custPhone} onChange={(e) => updateInstallField("custPhone", e.target.value)} placeholder="可選填" />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="label">備註</div>
                <textarea value={installForm.notes} onChange={(e) => updateInstallField("notes", e.target.value)} rows={4} placeholder="補充限制、現場狀況或客戶要求" />
              </div>
            </div>
          </details>

          {installErrorSummary.length > 0 ? (
            <div
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid color-mix(in oklab, var(--destructive) 35%, white 0%)",
                background: "color-mix(in oklab, var(--destructive) 8%, white 0%)",
              }}
            >
              <div style={{ color: "var(--destructive)", fontWeight: 800, marginBottom: 6 }}>請先修正以下欄位後再儲存</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--destructive)", fontSize: 13, display: "grid", gap: 4 }}>
                {installErrorSummary.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", position: "sticky", bottom: 0, background: "var(--background)", paddingTop: 8 }}>
            <button className="btn" onClick={() => { clearInstallErrors(); setInstallModalOpen(false); }} disabled={installSubmitBusy}>取消</button>
            <button className="btn btnAccent" onClick={submitInstall} disabled={installSubmitBusy}>
              {installSubmitBusy ? "儲存中..." : "儲存"}
            </button>
          </div>
        </Modal>

        {/* ───────── Modal: Equipment ───────── */}
        <Modal
          open={equipModalOpen}
          title={equipEditId ? "編輯設備" : "新增設備"}
          onClose={() => {
            if (equipSubmitBusy) return;
            setEquipErrorSummary([]);
            setEquipModalOpen(false);
          }}
        >
          <div className="formGrid">
            <div className="field">
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>設備 ID</div>
              <input value={equipForm.equipmentId} onChange={(e) => setEquipForm({ ...equipForm, equipmentId: e.target.value })} aria-invalid={!!equipErrors.equipmentId} placeholder="例如：EQ-N-001" />
              {equipErrors.equipmentId ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors.equipmentId}</div> : null}
            </div>
            <div className="field">
              <div className="label">區域</div>
              <select value={equipForm.region} onChange={(e) => setEquipForm({ ...equipForm, region: parseRegionKey(e.target.value) })} aria-invalid={!!equipErrors.region}>
                {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {equipErrors.region ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors.region}</div> : null}
            </div>
            <div className="field">
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>客戶</div>
              <input list="customerOptions" value={equipForm.customer} onChange={(e) => setEquipForm({ ...equipForm, customer: e.target.value })} aria-invalid={!!equipErrors.customer} placeholder="例如：TSMC" />
              {equipErrors.customer ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors.customer}</div> : null}
            </div>
            <div className="field">
              <div className="label">站點</div>
              <input value={equipForm.site} onChange={(e) => setEquipForm({ ...equipForm, site: e.target.value })} aria-invalid={!!equipErrors.site} placeholder="例如：竹科Fab1" />
              {equipErrors.site ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors.site}</div> : null}
            </div>
            <div className="field">
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>機型</div>
              <select value={equipForm.modelCode} onChange={(e) => setEquipForm({ ...equipForm, modelCode: e.target.value })} aria-invalid={!!equipErrors.modelCode}>
                {machineModels.map((m: MachineModel) => <option key={m.code} value={m.code}>{m.displayName}</option>)}
              </select>
              {equipErrors.modelCode ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors.modelCode}</div> : null}
            </div>
            <div className="field">
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>機台序號</div>
              <input value={equipForm.serialNo} onChange={(e) => setEquipForm({ ...equipForm, serialNo: e.target.value })} aria-invalid={!!equipErrors.serialNo} placeholder="例如：P160623" />
              {equipErrors.serialNo ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors.serialNo}</div> : null}
            </div>
            <div className="field">
              <div className="label">主狀態</div>
              <select
                value={equipForm.statusMain}
                onChange={(e) => {
                  const nextMain = e.target.value as EquipmentMainStatus;
                  const options = EQUIPMENT_SUB_STATUS_OPTIONS[nextMain] ?? [];
                  const nextSub = options.includes(equipForm.statusSub) ? equipForm.statusSub : (options[0] ?? "");
                  setEquipForm({ ...equipForm, statusMain: nextMain, statusSub: nextSub });
                }}
              >
                {EQUIPMENT_MAIN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="label">子狀態</div>
              <select
                className="selectWithArrow"
                value={equipForm.statusSub}
                onChange={(e) => setEquipForm({ ...equipForm, statusSub: e.target.value })}
              >
                <option value="">請選擇子狀態</option>
                {equipSubStatusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                {equipForm.statusSub && !equipSubStatusOptions.includes(equipForm.statusSub) ? (
                  <option value={equipForm.statusSub}>{equipForm.statusSub}</option>
                ) : null}
              </select>
            </div>
            <div className="field">
              <div className="label">Owner</div>
              <select
                className="selectWithArrow"
                value={equipForm.owner}
                onChange={(e) => setEquipForm({ ...equipForm, owner: e.target.value })}
              >
                <option value="">請選擇 Owner</option>
                {(ownerList.length > 0 ? ownerList : engineers).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {equipForm.owner && !(ownerList.length > 0 ? ownerList : engineers).includes(equipForm.owner) ? (
                  <option value={equipForm.owner}>{toDisplayShortName(equipForm.owner) || equipForm.owner}</option>
                ) : null}
              </select>
            </div>

            <div className="field">
              <div className="label">稼動率（自動換算）</div>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={equipForm.capacity.utilization}
                readOnly
                disabled
                title="依 UPH / Target UPH 自動換算"
              />
            </div>
            <div className="field">
              <div className="label">UPH</div>
              <input type="number" min={0} step={0.1} value={equipForm.capacity.uph}
                aria-invalid={!!equipErrors["capacity.uph"]}
                onChange={(e) => {
                  // 只更新字串；不在 onChange 做 round，避免 "01.8" 顯示問題
                  const raw = e.target.value;
                  setEquipForm({ ...equipForm, capacity: updateEquipmentCapacityDraft(equipForm.capacity, { uph: raw }) });
                }}
                onBlur={(e) => {
                  // blur 時 round 到小數一位
                  const v = Math.round((parseFloat(e.target.value) || 0) * 10) / 10;
                  setEquipForm({ ...equipForm, capacity: updateEquipmentCapacityDraft(equipForm.capacity, { uph: String(v) }) });
                }} />
              {equipErrors["capacity.uph"] ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors["capacity.uph"]}</div> : null}
            </div>
            <div className="field">
              <div className="label">Target UPH</div>
              <input type="number" min={0} step={0.1} value={equipForm.capacity.targetUph}
                aria-invalid={!!equipErrors["capacity.targetUph"]}
                onChange={(e) => {
                  const raw = e.target.value;
                  setEquipForm({ ...equipForm, capacity: updateEquipmentCapacityDraft(equipForm.capacity, { targetUph: raw }) });
                }}
                onBlur={(e) => {
                  const v = Math.round((parseFloat(e.target.value) || 0) * 10) / 10;
                  setEquipForm({ ...equipForm, capacity: updateEquipmentCapacityDraft(equipForm.capacity, { targetUph: String(v) }) });
                }} />
              {equipErrors["capacity.targetUph"] ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors["capacity.targetUph"]}</div> : null}
            </div>
            <div className="field">
              <div className="label">容量等級（自動換算）</div>
              <div style={{ padding: "6px 10px", borderRadius: 6, fontWeight: 900, fontSize: 14,
                background: equipForm.capacity.level === "綠" ? "#d1fae5" : equipForm.capacity.level === "黃" ? "#fef9c3" : "#fee2e2",
                color: equipForm.capacity.level === "綠" ? "#065f46" : equipForm.capacity.level === "黃" ? "#92400e" : "#991b1b" }}>
                {equipForm.capacity.level}（UPH {Number(equipForm.capacity.uph).toFixed(1)} / Target {Number(equipForm.capacity.targetUph).toFixed(1)}，稼動率 {equipForm.capacity.utilization}%）
              </div>
            </div>

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <div className="label">7 天趨勢（可選，逗號分隔 7 個 0~100；未填會自動生成）</div>
              <input value={equipForm.capacity.trend7dCsv} onChange={(e) => setEquipForm({ ...equipForm, capacity: { ...equipForm.capacity, trend7dCsv: e.target.value } })} aria-invalid={!!equipErrors["capacity.trend7d"]} placeholder="例如：40,55,60,58,62,64,62" />
              {equipErrors["capacity.trend7d"] ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors["capacity.trend7d"]}</div> : null}
            </div>

            {/* ── 產品產能清單 ── */}
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <div className="label" style={{ marginBottom: 8 }}>產品產能（生產產品 + 日產能）</div>
              {equipErrors.products ? <div style={{ color: "var(--destructive)", fontSize: 12, marginBottom: 6 }}>{equipErrors.products}</div> : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(equipForm.products ?? []).map((p: { name: string; dailyCap: number | string }, idx: number) => (
                  <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      style={{ flex: 2 }}
                      value={p.name}
                      placeholder="產品名稱（例如 GB100）"
                      onChange={(e) => {
                        const updated = [...equipForm.products];
                        updated[idx] = { ...updated[idx], name: e.target.value };
                        setEquipForm({ ...equipForm, products: updated });
                      }}
                    />
                    <input
                      type="number"
                      style={{ flex: 1 }}
                      min={0}
                      step={0.01}
                      value={p.dailyCap}
                      placeholder="日產能"
                      onChange={(e) => {
                        const updated = [...equipForm.products];
                        updated[idx] = { ...updated[idx], dailyCap: e.target.value };
                        setEquipForm({ ...equipForm, products: updated });
                      }}
                      onBlur={(e) => {
                        const v = Math.max(0, Math.round(Number(e.target.value) * 100) / 100);
                        const updated = [...equipForm.products];
                        updated[idx] = { ...updated[idx], dailyCap: v };
                        setEquipForm({ ...equipForm, products: updated });
                      }}
                    />
                    <button
                      className="btn btnSmall btnDanger"
                      type="button"
                      onClick={() => {
                        const updated = equipForm.products.filter((_: unknown, i: number) => i !== idx);
                        setEquipForm({ ...equipForm, products: updated });
                      }}
                    >✕</button>
                  </div>
                ))}
                <button
                  className="btn btnSmall"
                  type="button"
                  style={{ alignSelf: "flex-start", marginTop: 4 }}
                  onClick={() => setEquipForm({ ...equipForm, products: [...(equipForm.products ?? []), { name: "", dailyCap: 0 }] })}
                >＋ 新增產品</button>
              </div>
            </div>

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#94a3b8", fontWeight: 900, fontSize: 12 }}>
                <input type="checkbox" checked={equipForm.hasBlocking} onChange={(e) => setEquipForm({ ...equipForm, hasBlocking: e.target.checked })} />
                有阻塞（blocking）
              </label>
            </div>

            {equipForm.hasBlocking ? (
              <>
                <div className="field">
                  <div className="label">Blocking 狀態</div>
                  <select
                    className="selectWithArrow"
                    value={equipForm.blocking.status}
                    onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, status: normalizeEquipmentBlockingStatus(e.target.value) } })}
                  >
                    <option value="open">OPEN</option>
                    <option value="resolved">RESOLVED</option>
                    <option value="reopened">REOPENED</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">阻塞原因</div>
                  <input value={equipForm.blocking.reasonCode} onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, reasonCode: e.target.value } })} aria-invalid={!!equipErrors["blocking.reasonCode"]} placeholder="例如：料件未到" />
                  {equipErrors["blocking.reasonCode"] ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors["blocking.reasonCode"]}</div> : null}
                </div>
                <div className="field">
                  <div className="label">阻塞 Owner</div>
                  <input value={equipForm.blocking.owner} onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, owner: e.target.value } })} aria-invalid={!!equipErrors["blocking.owner"]} placeholder="例如：SCM-Judy" />
                  {equipErrors["blocking.owner"] ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors["blocking.owner"]}</div> : null}
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <div className="label">阻塞細節</div>
                  <input value={equipForm.blocking.detail} onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, detail: e.target.value } })} placeholder="例如：真空閥件缺料，等待到貨" />
                </div>
                <div className="field">
                  <div className="label">ETA</div>
                  <input value={equipForm.blocking.eta} onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, eta: e.target.value } })} aria-invalid={!!equipErrors["blocking.eta"]} placeholder="YYYY-MM-DD" />
                  {equipErrors["blocking.eta"] ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{equipErrors["blocking.eta"]}</div> : null}
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <div className="label">解決備註</div>
                  <input
                    value={equipForm.blocking.resolutionNote}
                    onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, resolutionNote: e.target.value } })}
                    placeholder="例如：真空閥已到料並完成更換"
                  />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <div className="fieldHint">
                    已處理 {equipForm.blocking.openedAt ? `${getEquipmentBlockingAgeDays(equipForm.blocking)} 天` : "-"} · 重開 {equipForm.blocking.reopenCount ?? 0} 次
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {equipErrorSummary.length > 0 ? (
            <div
              role="alert"
              style={{
                marginTop: 12,
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid color-mix(in oklab, var(--destructive) 35%, white 0%)",
                background: "color-mix(in oklab, var(--destructive) 8%, white 0%)",
              }}
            >
              <div style={{ color: "var(--destructive)", fontWeight: 800, marginBottom: 6 }}>請先修正以下設備欄位後再儲存</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--destructive)", fontSize: 13, display: "grid", gap: 4 }}>
                {equipErrorSummary.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => { setEquipErrorSummary([]); setEquipModalOpen(false); }} disabled={equipSubmitBusy}>取消</button>
            <button className="btn btnAccent" onClick={submitEquip} disabled={equipSubmitBusy}>
              {equipSubmitBusy ? "儲存中..." : "儲存"}
            </button>
          </div>
        </Modal>

        <SmartImportModal
          open={smartImportOpen}
          onClose={() => setSmartImportOpen(false)}
          customerRegionMap={customerRegionMap}
          machineModels={machineModels}
          importConfig={importConfig}
          onImported={(counts) => {
            setSmartImportOpen(false);
            setToast(`✅ 裝機保留新增 ${counts.createdInstallations} 筆 / 更新 ${counts.updatedInstallations} 筆；設備新增 ${counts.createdEquipments} 筆 / 更新 ${counts.updatedEquipments} 筆；自裝機移除 ${counts.removedInstallations} 筆`);
          }}
        />

        {/* 供表單使用的建議選項（仍允許手動輸入） */}
        <datalist id="engineerOptions">
          {engineers.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        <datalist id="customerOptions">
          {customers.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
  );
}
