"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/AuthProvider";

import { createInstallation, updateInstallation, removeInstallation } from "@/features/data/installations";
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

import type { CapacityLevel, CustomerEntry, Equipment, EquipmentMainStatus, Installation, PhaseKey, RegionKey, RetentionSettingsDoc } from "@/domain/types";
import {
  CAPACITY_COLOR,
  CAPACITY_LEVELS,
  DEFAULT_CUSTOMERS,
  DEFAULT_ENGINEERS,
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
import { buildOwnerListFromUserEmails, dedupeDisplayNames, toDisplayShortName } from "@/domain/personDisplay";

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
import { RegionTabs } from "@/features/ui/RegionTabs";
import { SmartImportModal } from "@/features/dashboard/SmartImportModal";
import { GanttView } from "@/features/dashboard/GanttView";
import {
  filterAndSortEquipments,
  filterAndSortInstallations,
  getEquipmentSerialLabel,
  type EquipSortKey,
  type InstallSortKey,
} from "@/features/dashboard/dashboardFilters";
import { buildDashboardAnalytics } from "@/features/dashboard/dashboardAnalytics";
import {
  buildEquipmentActionQueue,
  buildInstallActionQueue,
} from "@/features/dashboard/dashboardActionQueue";
import { downloadInstallationsCsv } from "@/features/dashboard/dashboardExports";
import { buildEditInstallationDraft, buildNewInstallationDraft } from "@/features/dashboard/installationForm";
import { calcCapacityLevel, calcEquipmentStats, calcInstallStats, isOverdueInstall } from "@/features/dashboard/dashboardStats";
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
import { MissionQueuePanel, SortableTh, type MissionQueueItem, type SortDirection } from "@/features/dashboard/dashboardWidgets";
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
  parseCapacityFilter,
  parseEquipmentStatusFilter,
  parseInsightsTab,
  parseInstallView,
  parsePhaseFilter,
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

type DashboardSection = "install" | "equipment" | "insights";
const TABLE_PAGE_SIZE = 120;

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
    managedUsers,
    installations,
    installErr,
    equipments,
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

  // ───────── Owner / 工程師顯示名稱：一律走短名規則─────────
  const ownerList = useMemo(() => {
    return buildOwnerListFromUserEmails(managedUsers.map((u) => u.email));
  }, [managedUsers]);

  // ───────── Derived lists ─────────
  const engineers = useMemo(() => {
    if (ownerList.length > 0) return ownerList;

    return dedupeDisplayNames([
      ...(appVars?.engineers ?? []),
      ...installations.map((r) => r.engineer),
      ...equipments.map((r) => r.owner),
    ]);
  }, [ownerList, appVars, installations, equipments]);

  /** 客戶名稱清單（用於下拉選單） */
  const customers = useMemo(() => {
    const cfgEntries = (appVars?.customers ?? []) as CustomerEntry[];
    // 向後相容：舊資料可能是 string[]
    const fromCfg = cfgEntries
      .map((c) => (typeof c === "string" ? c : c.name))
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (fromCfg.length) return Array.from(new Set(fromCfg)).sort((a, b) => a.localeCompare(b, "zh-Hant"));

    const set = new Set<string>();
    for (const r of installations) if (r.customer) set.add(r.customer);
    for (const r of equipments) if (r.customer) set.add(r.customer);
    const fromData = Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hant"));
    if (fromData.length) return fromData;

    const fallback = Array.from(new Set(Array.from(DEFAULT_CUSTOMERS)));
    return fallback.sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [appVars, installations, equipments]);

  /** 客戶 → 區域 對照表（給 Excel 匯入用） */
  const customerRegionMap = useMemo(() => {
    const map: Record<string, RegionKey> = {};
    const cfgEntries = (appVars?.customers ?? []) as CustomerEntry[];
    for (const c of cfgEntries) {
      if (typeof c === "object" && c.name) map[c.name] = c.region;
    }
    return map;
  }, [appVars]);

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

  // ───────── Analytics ─────────
  const analytics = useMemo(
    () => buildDashboardAnalytics({
      installations: filteredInstallations,
      equipments,
      engineers,
    }),
    [filteredInstallations, equipments, engineers],
  );
  const anPhase = analytics.phase;
  const anRegion = analytics.region;
  const anEngineer = analytics.engineer;
  const anDue = analytics.due;
  const regionProductStats = analytics.regionProductStats;

  const updateInstallCustomer = (value: string) => {
    const inferredRegion = resolveCustomerRegion(value);
    updateInstallCustomerDraft(value, inferredRegion);
  };

  // ───────── Actions: Installations ─────────
  const openAddInstall = () => {
    setInstallEditId(null);
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
    setInstallForm(buildEditInstallationDraft(r, machineModels));
    clearInstallErrors();
    setInstallModalOpen(true);
  }, [clearInstallErrors, machineModels, setInstallForm]);


  const submitInstall = async () => {
    if (!user?.email) return;
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

  // ───────── Actions: Equipments ─────────
  const openAddEquip = () => {
    setEquipEditId(null);
    setEquipForm(getEquipmentDefaultFormDraft(machineModels?.[0]?.code ?? "FlexTRAK-S"));
    setEquipModalOpen(true);
  };

  const openEditEquip = (r: Equipment) => {
    setEquipEditId(r.id);
    setEquipForm(buildEquipmentFormDraftFromEquipment(r));
    setEquipModalOpen(true);
  };

  const submitEquip = async () => {
    if (!user?.email) return;

    const payload = buildEquipmentPayloadFromDraft(equipForm);
    const parsed = equipmentSchema.safeParse(payload);
    if (!parsed.success) {
      setToast(parsed.error.issues?.[0]?.message ?? "表單驗證失敗");
      return;
    }

    const safeMilestones = buildSafeEquipmentMilestones(parsed.data.milestones);
    const safeBlocking = buildSafeEquipmentBlocking(parsed.data.blocking);

    try {
      if (equipEditId) {
        const patch: EquipmentUpdatePatch = {
          ...parsed.data,
          milestones: safeMilestones,
          blocking: safeBlocking ?? deleteField(), // deleteField() removes the field when no blocking
        };
        await updateEquipment(equipEditId, patch);
        await writeAuditLog("更新", parsed.data.equipmentId, `更新設備狀態：${parsed.data.statusMain}`, user.email);
        trackEvent("equipment_update", { equipmentId: parsed.data.equipmentId, statusMain: parsed.data.statusMain });
        setToast("已更新");
      } else {
        const createData: Omit<Equipment, "id"> = {
          ...parsed.data,
          milestones: safeMilestones,
          ...(safeBlocking ? { blocking: safeBlocking } : {}),
        };
        await createEquipment(createData);
        await writeAuditLog("新增", parsed.data.equipmentId, `新增設備：${parsed.data.customer} — ${parsed.data.modelCode}`, user.email);
        trackEvent("equipment_create", { equipmentId: parsed.data.equipmentId, statusMain: parsed.data.statusMain });
        setToast("已新增");
      }
      setEquipModalOpen(false);
    } catch (e) {
      setToast(`儲存失敗：${safeStr(e)}`);
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
    const name = saveFilterName.trim();
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
  }, [addSavedFilter, saveFilterName, fRegion, fModel, fPhase, fCustomer, fEngineer, keyword]);

  const applyFilter = useCallback((f: SavedFilter) => {
    setFRegion(f.region);
    setFModel(f.model);
    setFPhase(f.phase);
    setFCustomer(f.customer);
    setFEngineer(f.engineer);
    setKeyword(f.keyword);
  }, []);

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

  const installRowsById = useMemo(() => new Map(filteredInstallations.map((row) => [row.id, row])), [filteredInstallations]);
  const equipmentRowsById = useMemo(() => new Map(filteredEquipments.map((row) => [row.id, row])), [filteredEquipments]);
  const installActionQueue: MissionQueueItem[] = useMemo(
    () => buildInstallActionQueue(filteredInstallations).map(({ targetId, priority: _priority, ...item }) => ({
      ...item,
      onClick: () => {
        const row = installRowsById.get(targetId);
        if (row) openEditInstall(row);
      },
    })),
    [filteredInstallations, installRowsById, openEditInstall],
  );
  const equipmentActionQueue: MissionQueueItem[] = useMemo(
    () => buildEquipmentActionQueue(filteredEquipments, regionLabel).map(({ targetId, priority: _priority, ...item }) => ({
      ...item,
      onClick: () => {
        const row = equipmentRowsById.get(targetId);
        if (row) openDrawer(row);
      },
    })),
    [filteredEquipments, equipmentRowsById, openDrawer],
  );

  const equipSubStatusOptions = EQUIPMENT_SUB_STATUS_OPTIONS[(equipForm.statusMain as EquipmentMainStatus) || "裝機"] ?? [];

  return (
      <div className="container dashboardShell auroraDashboardShell" style={{ paddingTop: 14, paddingBottom: 24 }}>
        {toast ? (
          <div className="card toastBanner" style={{ padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 13 }}>{toast}</div>
          </div>
        ) : null}

        {/* ───────── Section: Installations ───────── */}
        {section === "install" ? (
          <>
            <MissionQueuePanel
              title="裝機資料品質"
              subtitle={`${installActionQueue.length} 筆需補資料`}
              items={installActionQueue}
              emptyText="目前沒有缺序號、缺工程師、缺預計日或久未更新的裝機案。"
            />

            <div className="card auroraControlPanel" style={{ padding: 14, marginTop: 12 }}>
              <div className="panelHeader auroraPanelHeader">
                <div style={{ fontWeight: 900 }}>篩選 / 操作</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <div className="segTabs">
                    <button className={installView === "table" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("table")}>表格</button>
                    <button className={installView === "pipeline" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("pipeline")}>Pipeline</button>
                    <button className={installView === "gantt" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("gantt")}>甘特圖</button>
                  </div>
                  <button className="btn btnSmall" onClick={() => downloadInstallationsCsv(filteredInstallations)}>匯出 CSV</button>
                  <button className="btn btnSmall" onClick={() => setSmartImportOpen(true)}>⬆ Excel 智慧匯入</button>
                  <button className="btn btnAccent" onClick={openAddInstall}>新增裝機案</button>
                </div>
              </div>

              <div className="filters" style={{ marginTop: 10 }}>
                <div className="field" style={{ flex: "1 1 240px" }}>
                  <div className="label">區域</div>
                  <RegionTabs value={fRegion} onChange={setFRegion} />
                </div>
                <div className="field">
                  <div className="label">階段</div>
                  <select value={fPhase} onChange={(e) => setFPhase(parsePhaseFilter(e.target.value))}>
                    <option value="">全部</option>
                    {PHASES.map((p) => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 220 }}>
                  <div className="label">關鍵字</div>
                  <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="設備/客戶/工程師/備註..." />
                </div>

                <div className="field" style={{ minWidth: 180 }}>
                  <div className="label">排序欄位</div>
                  <select value={installSortKey} onChange={(e) => setInstallSortKey(e.target.value as InstallSortKey)}>
                    <option value="updatedAt">更新時間</option>
                    <option value="estComplete">預計安裝日</option>
                    <option value="phase">階段</option>
                    <option value="customer">客戶</option>
                    <option value="engineer">工程師</option>
                    <option value="name">機台序號</option>
                  </select>
                </div>

                <div className="field" style={{ minWidth: 120 }}>
                  <div className="label">排序方向</div>
                  <select value={installSortDir} onChange={(e) => setInstallSortDir(e.target.value as "asc" | "desc")}>
                    <option value="desc">由大到小</option>
                    <option value="asc">由小到大</option>
                  </select>
                </div>

                <button className="btn btnSmall btnGhost" onClick={() => setShowInstallAdvancedFilters((v) => !v)}>
                  {showInstallAdvancedFilters ? "收合進階篩選" : "展開進階篩選"}
                </button>

                {(fRegion || fModel || fPhase || fCustomer || fEngineer || keyword) ? (
                  <button className="btn" onClick={() => { setFRegion(""); setFModel(""); setFPhase(""); setFCustomer(""); setFEngineer(""); setKeyword(""); setInstallSortKey("updatedAt"); setInstallSortDir("desc"); }}>
                    清除
                  </button>
                ) : null}

                <div style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>
                  {filteredInstallations.length}/{installations.length}
                </div>
              </div>

              {showInstallAdvancedFilters ? (
                <div className="filters" style={{ marginTop: 10 }}>
                  <div className="field">
                    <div className="label">機型</div>
                    <select value={fModel} onChange={(e) => setFModel(e.target.value)}>
                      <option value="">全部</option>
                      {machineModels.map((m: any) => <option key={m.code} value={m.code}>{m.displayName}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <div className="label">客戶</div>
                    <select value={fCustomer} onChange={(e) => setFCustomer(e.target.value)}>
                      <option value="">全部</option>
                      {customers.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <div className="label">工程師</div>
                    <select value={fEngineer} onChange={(e) => setFEngineer(e.target.value)}>
                      <option value="">全部</option>
                      {engineers.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>
              ) : null}

              {/* Saved Filters */}
              {savedFilters.length > 0 || showSaveFilterInput ? (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground, #64748b)", whiteSpace: "nowrap" }}>書籤:</span>
                  {savedFilters.map((f) => (
                    <div key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                      <button className="btn btnSmall" style={{ paddingLeft: 8, paddingRight: 8, fontSize: 11 }} onClick={() => applyFilter(f)} title={f.savedAt ? new Date(f.savedAt).toLocaleString("zh-TW") : ""}>{f.name}</button>
                      <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "0 2px", lineHeight: 1, fontSize: 14 }} onClick={() => deleteSavedFilter(f.id)} title="刪除此書籤">×</button>
                    </div>
                  ))}
                </div>
              ) : null}

              {showSaveFilterInput ? (
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  <input style={{ flex: 1, maxWidth: 240 }} value={saveFilterName} onChange={(e) => setSaveFilterName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveCurrentFilter()} placeholder="書籤名稱..." autoFocus />
                  <button className="btn btnSmall btnAccent" onClick={saveCurrentFilter}>儲存</button>
                  <button className="btn btnSmall btnGhost" onClick={() => { setShowSaveFilterInput(false); setSaveFilterName(""); }}>取消</button>
                </div>
              ) : (
                <div style={{ marginTop: 6 }}>
                  <button className="btn btnSmall btnGhost" style={{ fontSize: 11 }} onClick={() => setShowSaveFilterInput(true)}>+ 儲存目前篩選</button>
                </div>
              )}
            </div>

            {installErr ? (
              <div className="card auroraAlertPanel" style={{ padding: 12, marginTop: 12, borderColor: "rgba(239,68,68,0.35)" }}>
                <div style={{ color: "#ef4444", fontWeight: 900 }}>Installations 讀取失敗</div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{installErr}</div>
              </div>
            ) : null}

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
                        return (
                          <tr key={r.id}>
                            <td className="tableStickyLeft tableSerialCell" title={serial}>{serial}</td>
                            <td className="tableTextClip" title={r.customer}>{r.customer}</td>
                            <td><Badge text={REGIONS[r.region].label} color={REGIONS[r.region].color} subtle /></td>
                            <td><Badge text={r.modelCode} color="#3b82f6" subtle /></td>
                            <td><Badge text={`${phase.icon} ${phase.label}`} color={phase.color} subtle /></td>
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
                          <td colSpan={10} style={{ textAlign: "center", padding: 20, color: "#94a3b8" }}>無資料</td>
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
                const rows = filteredInstallations.filter((r) => r.phase === p.key);
                const phaseStyle = { ["--phase-color" as string]: p.color } as CSSProperties;
                return (
                  <div key={p.key} className="kanbanCol" style={phaseStyle}>
                    <div className="kanbanColHead">
                      <div className="kanbanColTitle">{p.icon} {p.label}</div>
                      <div className="pill">{rows.length}</div>
                    </div>
                    <div className="kanbanColBody">
                      {rows.map((r) => (
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
                            {r.estComplete ? (
                              (() => {
                                const dl = daysLeft(r.estComplete);
                                const isOver = dl != null && dl < 0 && r.phase !== "released";
                                return <Badge text={`預計 ${r.estComplete}${isOver ? " ⚠️" : ""}`} color={isOver ? "#ef4444" : "#94a3b8"} subtle />;
                              })()
                            ) : null}
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
                              ⏭️ 推進
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {rows.length === 0 ? (
                        <div style={{ color: "#94a3b8", fontSize: 12, padding: 10 }}>—</div>
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
          <>
            <MissionQueuePanel
              title="設備異常待辦"
              subtitle={`${equipmentActionQueue.length} 台需要確認`}
              items={equipmentActionQueue}
              emptyText="目前沒有阻塞、紅燈或高稼動設備。"
            />

            <div className="card" style={{ padding: 14, marginTop: 12 }}>
              <div className="panelHeader">
                <div style={{ fontWeight: 900 }}>篩選 / 操作</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="btn btnSmall" onClick={() => setSmartImportOpen(true)}>⬆ Excel 智慧匯入</button>
                  <button className="btn btnAccent" onClick={openAddEquip}>➕ 新增設備</button>
                </div>
              </div>

              <div className="filters" style={{ marginTop: 10 }}>
                <div className="field" style={{ flex: "1 1 240px" }}>
                  <div className="label">區域</div>
                  <RegionTabs value={eRegion} onChange={setERegion} />
                </div>

                <div className="field">
                  <div className="label">主狀態</div>
                  <select value={eStatus} onChange={(e) => setEStatus(parseEquipmentStatusFilter(e.target.value))}>
                    <option value="">全部</option>
                    {EQUIPMENT_MAIN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="field">
                  <div className="label">容量</div>
                  <select value={eCap} onChange={(e) => setECap(parseCapacityFilter(e.target.value))}>
                    <option value="">全部</option>
                    {CAPACITY_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="field" style={{ flex: 1, minWidth: 240 }}>
                  <div className="label">關鍵字</div>
                  <input value={eKeyword} onChange={(e) => setEKeyword(e.target.value)} placeholder="客戶/站點/序號/Owner/阻塞原因..." />
                </div>

                <div className="field" style={{ minWidth: 180 }}>
                  <div className="label">排序欄位</div>
                  <select value={equipSortKey} onChange={(e) => setEquipSortKey(e.target.value as EquipSortKey)}>
                    <option value="updatedAt">更新時間</option>
                    <option value="utilization">稼動率</option>
                    <option value="customer">客戶</option>
                    <option value="owner">Owner</option>
                    <option value="serialNo">序號</option>
                    <option value="statusMain">主狀態</option>
                  </select>
                </div>

                <div className="field" style={{ minWidth: 120 }}>
                  <div className="label">排序方向</div>
                  <select value={equipSortDir} onChange={(e) => setEquipSortDir(e.target.value as "asc" | "desc")}>
                    <option value="desc">由大到小</option>
                    <option value="asc">由小到大</option>
                  </select>
                </div>

                {(eRegion || eStatus || eCap || eKeyword) ? (
                  <button className="btn" onClick={() => { setERegion(""); setEStatus(""); setECap(""); setEKeyword(""); setEquipSortKey("updatedAt"); setEquipSortDir("desc"); }}>
                    清除
                  </button>
                ) : null}

                <div style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>
                  {filteredEquipments.length}/{equipments.length}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <Badge text={`裝機 ${equipStats.byStatus["裝機"]}`} color={STATUS_COLOR["裝機"]} subtle />
                <Badge text={`試產 ${equipStats.byStatus["試產"]}`} color={STATUS_COLOR["試產"]} subtle />
                <Badge text={`正式生產中 ${equipStats.byStatus["正式生產中"]}`} color={STATUS_COLOR["正式生產中"]} subtle />
                <span style={{ opacity: 0.35 }}>|</span>
                <Badge text={`綠 ${equipStats.byCap["綠"]}`} color={CAPACITY_COLOR["綠"]} subtle />
                <Badge text={`黃 ${equipStats.byCap["黃"]}`} color={CAPACITY_COLOR["黃"]} subtle />
                <Badge text={`紅 ${equipStats.byCap["紅"]}`} color={CAPACITY_COLOR["紅"]} subtle />
              </div>
            </div>

            {equipErr ? (
              <div className="card" style={{ padding: 12, marginTop: 12, borderColor: "rgba(239,68,68,0.35)" }}>
                <div style={{ color: "#ef4444", fontWeight: 900 }}>Equipments 讀取失敗</div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{equipErr}</div>
              </div>
            ) : null}

            <div className="card" style={{ marginTop: 12 }}>
              <div className="tableWrap">
                <table className="table dataTableDense equipmentLedgerTable">
                  <colgroup>
                    <col className="equipmentColSerial" />
                    <col className="equipmentColCustomer" />
                    <col className="equipmentColModel" />
                    <col className="equipmentColStatus" />
                    <col className="equipmentColOwner" />
                    <col className="equipmentColUtil" />
                    <col className="equipmentColUpdated" />
                    <col className="equipmentColActions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <SortableTh className="tableStickyLeft" label="機台序號" active={equipSortKey === "serialNo"} dir={equipSortDir} onClick={() => toggleEquipSort("serialNo")} />
                      <SortableTh label="客戶/站點" active={equipSortKey === "customer"} dir={equipSortDir} onClick={() => toggleEquipSort("customer")} />
                      <th>機型 / 設備 ID</th>
                      <SortableTh label="狀態" active={equipSortKey === "statusMain"} dir={equipSortDir} onClick={() => toggleEquipSort("statusMain")} />
                      <SortableTh label="Owner" active={equipSortKey === "owner"} dir={equipSortDir} onClick={() => toggleEquipSort("owner")} />
                      <SortableTh label="稼動率" active={equipSortKey === "utilization"} dir={equipSortDir} onClick={() => toggleEquipSort("utilization")} />
                      <SortableTh label="更新" active={equipSortKey === "updatedAt"} dir={equipSortDir} onClick={() => toggleEquipSort("updatedAt")} />
                      <th className="tableStickyRight">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEquipments.map((r) => {
                      const statusColor = STATUS_COLOR[r.statusMain];
                      // 即時重算容量等級，不依賴 Firestore 存的舊值
                      const liveLevel = calcCapacityLevel(r.capacity.uph, r.capacity.targetUph);
                      const capColor = CAPACITY_COLOR[liveLevel];
                      return (
                        <tr key={r.id}>
                          <td className="tableStickyLeft tableSerialCell mono" title={getEquipmentSerialLabel(r) || "-"}>{getEquipmentSerialLabel(r) || "-"}</td>
                          <td className="tableTextClip" title={`${r.customer} ${r.site || ""}`}>
                            <div style={{ fontWeight: 900 }}>{r.customer}</div>
                            <div className="tableSecondaryText">{regionLabel(r.region)} · {r.site}</div>
                          </td>
                          <td>
                            <div><Badge text={r.modelCode} color="#3b82f6" subtle /></div>
                            <div className="mono tableSecondaryText" style={{ marginTop: 4 }}>
                              {r.equipmentId || "-"}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <Badge text={r.statusMain} color={statusColor} subtle />
                              <Badge text={liveLevel} color={capColor} subtle />
                              {r.blocking?.reasonCode ? <Badge text={`阻塞：${r.blocking.reasonCode}`} color="#ef4444" subtle /> : null}
                            </div>
                            <div className="tableSecondaryText" style={{ marginTop: 6 }}>{r.statusSub || "-"}</div>
                          </td>
                          <td>{toDisplayShortName(r.owner) || "-"}</td>
                          <td>
                            <div style={{ fontWeight: 900, color: pickColorByUtil(getLiveUtilization(r.capacity)) }}>{getLiveUtilization(r.capacity)}%</div>
                            <div className="tableSecondaryText">{Number(r.capacity.uph).toLocaleString()}/{Number(r.capacity.targetUph).toLocaleString()} UPH</div>
                          </td>
                          <td className="tableDateCell tableSecondaryText">{fmtDate(r.updatedAt)}</td>
                          <td className="tableStickyRight tableActionsCell">
                            <div className="tableActions">
                              <button className="btn btnSmall" onClick={() => openDrawer(r)}>詳情</button>
                              <button className="btn btnSmall" onClick={() => openEditEquip(r)}>編輯</button>
                              <button className="btn btnSmall btnDanger" onClick={() => delEquip(r)}>刪除</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredEquipments.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: "center", padding: 20, color: "#94a3b8" }}>無資料</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {filteredEquipments.length > visibleEquipments.length ? (
                <div className="tableLoadMore">
                  <span>已顯示 {visibleEquipments.length} / {filteredEquipments.length} 台，詳情與匯出仍以目前篩選結果為準。</span>
                  <button className="btn btnSmall" onClick={() => setEquipVisibleCount((value) => value + TABLE_PAGE_SIZE)}>載入更多</button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {section === "insights" ? (
          <div className="card" style={{ padding: 10, marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div className="segTabs">
                <button className={activeInsightsTab === "analytics" ? "segTab segTabActive" : "segTab"} onClick={() => switchInsightsTab("analytics")}>
                  分析
                </button>
                {isAdmin ? (
                  <button className={activeInsightsTab === "logs" ? "segTab segTabActive" : "segTab"} onClick={() => switchInsightsTab("logs")}>
                    治理紀錄
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* ───────── Section: Insights / Analytics ───────── */}
        {section === "insights" && activeInsightsTab === "analytics" ? (
          <>
            {filteredInstallations.length === 0 ? (
              <div className="card" style={{ padding: 14, marginTop: 12 }}>
                <div style={{ color: "#94a3b8", fontSize: 12 }}>
                  {installations.length === 0
                    ? "尚無裝機案資料。請至「裝機進度」新增資料後再查看分析。"
                    : "目前篩選條件下無符合的裝機案。請清除篩選或調整條件後再查看分析。"}
                </div>
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
                    {anRegion.map((rg: any) => (
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
                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>阻塞中：{equipStats.blocked}</div>
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

        {/* ───────── Section: Insights / Logs ───────── */}
        {section === "insights" && isAdmin && activeInsightsTab === "logs" ? (
          <>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 900 }}>稽核紀錄（auditLogs）</div>
              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                events 為 analytics 行為事件：僅 admin 可讀。
              </div>
            </div>

            {isAdmin ? (
              <div className="card" style={{ padding: 14, marginTop: 12 }}>
                <div style={{ fontWeight: 900 }}>清除設定（admin）</div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
                  這裡的「定時清除」為<strong>前端觸發</strong>：需有人開著系統（或每日首次開啟）才會執行。
                  若要完全自動化（不依賴前端），需改用 Cloud Functions + Scheduler（通常需要 Blaze）。
                </div>

                <div className="filters" style={{ marginTop: 12 }}>
                  <div className="field">
                    <div className="label">保留 auditLogs（天）</div>
                    <input type="number" min={0} max={3650} value={retAuditDays}
                      onChange={(e) => setRetAuditDays(clamp(Number(e.target.value || 0), 0, 3650))} />
                  </div>
                  <div className="field">
                    <div className="label">保留 events（天）</div>
                    <input type="number" min={0} max={3650} value={retEventDays}
                      onChange={(e) => setRetEventDays(clamp(Number(e.target.value || 0), 0, 3650))} />
                  </div>
                  <div className="field">
                    <div className="label">定時清除</div>
                    <select value={retAutoEnabled ? "on" : "off"} onChange={(e) => setRetAutoEnabled(e.target.value === "on")}>
                      <option value="off">關閉</option>
                      <option value="on">啟用</option>
                    </select>
                  </div>
                  <div className="field">
                    <div className="label">每日時間（台灣）</div>
                    <input type="time" value={retAutoTime} onChange={(e) => setRetAutoTime(e.target.value || "03:00")} />
                  </div>

                  <button className="btn" onClick={() => saveRetention({
                    version: `retention-${today}`,
                    auditLogsRetentionDays: retAuditDays,
                    eventsRetentionDays: retEventDays,
                    autoPurgeEnabled: retAutoEnabled,
                    autoPurgeTime: retAutoTime,
                  })}>
                    儲存設定
                  </button>

                  <button className="btn" onClick={doPurgeByRetention} disabled={purgeBusy}>
                    立即清除（依保留天數）
                  </button>

                  <button className="btn btnDanger" onClick={doClearAllLogs} disabled={purgeBusy}>
                    清除全部
                  </button>

                  <div style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>
                    {purgeHint || (retentionCfg.lastAutoPurgeAt ? `上次自動清除：${fmtDate(retentionCfg.lastAutoPurgeAt)}` : "尚未自動清除")}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="card" style={{ marginTop: 12 }}>
              <div className="tableWrap">
                <table className="table tableSmall">
                  <thead>
                    <tr>
                      <th>時間</th>
                      <th>action</th>
                      <th>target</th>
                      <th>detail</th>
                      <th>actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((r) => (
                      <tr key={r.id}>
                        <td style={{ color: "#94a3b8", fontSize: 12 }}>{r.createdAt?.toDate?.().toISOString?.().slice(0, 19).replace("T", " ") ?? "-"}</td>
                        <td><Badge text={r.action} color="#3b82f6" subtle /></td>
                        <td style={{ fontWeight: 900 }}>{r.target}</td>
                        <td style={{ color: "#94a3b8" }}>{r.detail}</td>
                        <td style={{ color: "#94a3b8", fontSize: 12 }}>{r.actorEmail}</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: 20, color: "#94a3b8" }}>無資料</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {isAdmin ? (
              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ padding: 12, borderBottom: "1px solid var(--border)", fontWeight: 900 }}>events（僅 admin）</div>
                <div className="tableWrap">
                  <table className="table tableSmall">
                    <thead>
                      <tr>
                        <th>時間</th>
                        <th>eventName</th>
                        <th>payload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id}>
                          <td style={{ color: "#94a3b8", fontSize: 12 }}>{e.createdAt?.toDate?.().toISOString?.().slice(0, 19).replace("T", " ") ?? "-"}</td>
                          <td className="mono" style={{ fontWeight: 900 }}>{e.eventName}</td>
                          <td style={{ color: "#94a3b8", fontSize: 12, maxWidth: 640, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.payload ? JSON.stringify(e.payload) : "-"}
                          </td>
                        </tr>
                      ))}
                      {events.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ textAlign: "center", padding: 20, color: "#94a3b8" }}>無資料</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
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
                <div className="card" style={{ padding: 12, borderColor: "rgba(239,68,68,0.35)" }}>
                  <div style={{ fontWeight: 900, marginBottom: 8, color: "#ef4444" }}>阻塞</div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>
                    原因：{drawerEq.blocking.reasonCode}
                    <br />
                    細節：{drawerEq.blocking.detail}
                    <br />
                    Owner：{drawerEq.blocking.owner}
                    <br />
                    ETA：{drawerEq.blocking.eta || "-"}
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
          onClose={() => { clearInstallErrors(); setInstallModalOpen(false); }}
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
                {machineModels.map((m: any) => <option key={m.code} value={m.code}>{m.displayName}</option>)}
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
            <button className="btn" onClick={() => { clearInstallErrors(); setInstallModalOpen(false); }}>取消</button>
            <button className="btn btnAccent" onClick={submitInstall}>儲存</button>
          </div>
        </Modal>

        {/* ───────── Modal: Equipment ───────── */}
        <Modal
          open={equipModalOpen}
          title={equipEditId ? "編輯設備" : "新增設備"}
          onClose={() => setEquipModalOpen(false)}
        >
          <div className="formGrid">
            <div className="field">
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>設備 ID</div>
              <input value={equipForm.equipmentId} onChange={(e) => setEquipForm({ ...equipForm, equipmentId: e.target.value })} placeholder="例如：EQ-N-001" />
            </div>
            <div className="field">
              <div className="label">區域</div>
              <select value={equipForm.region} onChange={(e) => setEquipForm({ ...equipForm, region: parseRegionKey(e.target.value) })}>
                {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>客戶</div>
              <input list="customerOptions" value={equipForm.customer} onChange={(e) => setEquipForm({ ...equipForm, customer: e.target.value })} placeholder="例如：TSMC" />
            </div>
            <div className="field">
              <div className="label">站點</div>
              <input value={equipForm.site} onChange={(e) => setEquipForm({ ...equipForm, site: e.target.value })} placeholder="例如：竹科Fab1" />
            </div>
            <div className="field">
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>機型</div>
              <select value={equipForm.modelCode} onChange={(e) => setEquipForm({ ...equipForm, modelCode: e.target.value })}>
                {machineModels.map((m: any) => <option key={m.code} value={m.code}>{m.displayName}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>機台序號</div>
              <input value={equipForm.serialNo} onChange={(e) => setEquipForm({ ...equipForm, serialNo: e.target.value })} placeholder="例如：P160623" />
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
            </div>
            <div className="field">
              <div className="label">Target UPH</div>
              <input type="number" min={0} step={0.1} value={equipForm.capacity.targetUph}
                onChange={(e) => {
                  const raw = e.target.value;
                  setEquipForm({ ...equipForm, capacity: updateEquipmentCapacityDraft(equipForm.capacity, { targetUph: raw }) });
                }}
                onBlur={(e) => {
                  const v = Math.round((parseFloat(e.target.value) || 0) * 10) / 10;
                  setEquipForm({ ...equipForm, capacity: updateEquipmentCapacityDraft(equipForm.capacity, { targetUph: String(v) }) });
                }} />
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
              <input value={equipForm.capacity.trend7dCsv} onChange={(e) => setEquipForm({ ...equipForm, capacity: { ...equipForm.capacity, trend7dCsv: e.target.value } })} placeholder="例如：40,55,60,58,62,64,62" />
            </div>

            {/* ── 產品產能清單 ── */}
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <div className="label" style={{ marginBottom: 8 }}>產品產能（生產產品 + 日產能）</div>
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
                  <div className="label">阻塞原因</div>
                  <input value={equipForm.blocking.reasonCode} onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, reasonCode: e.target.value } })} placeholder="例如：料件未到" />
                </div>
                <div className="field">
                  <div className="label">阻塞 Owner</div>
                  <input value={equipForm.blocking.owner} onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, owner: e.target.value } })} placeholder="例如：SCM-Judy" />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <div className="label">阻塞細節</div>
                  <input value={equipForm.blocking.detail} onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, detail: e.target.value } })} placeholder="例如：真空閥件缺料，等待到貨" />
                </div>
                <div className="field">
                  <div className="label">ETA</div>
                  <input value={equipForm.blocking.eta} onChange={(e) => setEquipForm({ ...equipForm, blocking: { ...equipForm.blocking, eta: e.target.value } })} placeholder="YYYY-MM-DD" />
                </div>
              </>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setEquipModalOpen(false)}>取消</button>
            <button className="btn btnAccent" onClick={submitEquip}>儲存</button>
          </div>
        </Modal>

        <SmartImportModal
          open={smartImportOpen}
          onClose={() => setSmartImportOpen(false)}
          customerRegionMap={customerRegionMap}
          machineModels={machineModels}
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
