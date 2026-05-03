"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/features/auth/AuthProvider";

import { createInstallation, updateInstallation, removeInstallation } from "@/features/data/installations";
import { createEquipment, updateEquipment, removeEquipment } from "@/features/data/equipments";
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
import { getInstallationDefaultDraft, INSTALLATION_DATE_FIELDS, normalizeInstallationDraft, doesInstallationPhaseRequireEngineer, doesInstallationPhaseRequireSerial } from "@/domain/installationContract";
import { getInstallationModelSerial, getInstallationSerial, getInstallationTaskTitle } from "@/domain/installationDisplay";
import { buildOwnerListFromUserEmails, dedupeDisplayNames, toDisplayShortName } from "@/domain/personDisplay";

import { useDashboardData } from "@/features/dashboard/hooks/useDashboardData";
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
import { StatCard } from "@/features/ui/StatCard";
import { Badge } from "@/features/ui/Badge";
import { Drawer } from "@/features/ui/Drawer";
import { MiniTrend } from "@/features/ui/MiniTrend";
import { RegionTabs } from "@/features/ui/RegionTabs";
import { SmartImportModal } from "@/features/dashboard/SmartImportModal";
import { GanttView } from "@/features/dashboard/GanttView";
import { normalizeDateYmd } from "@/lib/utils";
import { buildCapacitySnapshot, calculateUtilization, getLiveUtilization } from "@/domain/capacity";

type DashboardSection = "install" | "equipment" | "insights";
type InsightsTab = "analytics" | "logs";
type InstallView = "table" | "card" | "pipeline" | "gantt";
type InstallSortKey = "updatedAt" | "estComplete" | "phase" | "customer" | "engineer" | "name";
type EquipSortKey = "updatedAt" | "utilization" | "customer" | "owner" | "serialNo" | "statusMain";
type SortDirection = "asc" | "desc";

function SortableTh({
  label,
  active,
  dir,
  onClick,
  width,
}: {
  label: string;
  active: boolean;
  dir: SortDirection;
  onClick: () => void;
  width?: number | string;
}) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th style={width ? { width } : undefined}>
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: 0,
          background: "transparent",
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
          fontWeight: 800,
        }}
      >
        <span>{label}</span>
        <span
          aria-hidden
          style={{
            fontSize: 11,
            color: active ? "var(--primary, #2563eb)" : "var(--muted-foreground, #94a3b8)",
            minWidth: 10,
            textAlign: "center",
          }}
        >
          {arrow}
        </span>
      </button>
    </th>
  );
}

type MissionQueueTone = "critical" | "warning" | "info" | "good";

type MissionQueueItem = {
  id: string;
  label: string;
  meta: string;
  value: string;
  tone: MissionQueueTone;
  onClick?: () => void;
};

function MissionQueuePanel({
  title,
  subtitle,
  items,
  emptyText,
}: {
  title: string;
  subtitle: string;
  items: MissionQueueItem[];
  emptyText: string;
}) {
  return (
    <section className="missionQueuePanel" aria-label={title}>
      <div className="missionQueueHead">
        <div>
          <div className="missionQueueEyebrow">MISSION QUEUE</div>
          <div className="missionQueueTitle">{title}</div>
        </div>
        <div className="missionQueueSub">{subtitle}</div>
      </div>

      {items.length > 0 ? (
        <div className="missionQueueList">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`missionQueueRow missionQueueRow-${item.tone}`}
              onClick={item.onClick}
            >
              <span className="missionQueueRail" aria-hidden />
              <span className="missionQueueText">
                <strong>{item.label}</strong>
                <small>{item.meta}</small>
              </span>
              <span className="missionQueueValue">{item.value}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="missionQueueEmpty">{emptyText}</div>
      )}
    </section>
  );
}

function parseInstallView(v: string | null): InstallView {
  if (v === "card" || v === "pipeline" || v === "gantt") return v;
  return "table";
}

function parseInsightsTab(v: string | null): InsightsTab {
  if (v === "logs") return "logs";
  return "analytics";
}

function todayYYYYMMDD(): string {
  return new Date().toISOString().slice(0, 10);
}

type FieldErrorMap = Record<string, string>;

function collectFieldErrors(issues: ReadonlyArray<{ path?: Array<string | number>; message: string }>) {
  const fieldErrors: FieldErrorMap = {};
  const summary: string[] = [];
  for (const issue of issues) {
    const field = typeof issue.path?.[0] === "string" ? String(issue.path[0]) : "form";
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    if (!summary.includes(issue.message)) summary.push(issue.message);
  }
  return { fieldErrors, summary };
}

function fmtDate(ts?: number): string {
  if (!ts) return "-";
  const d = new Date(ts);
  // zh-TW 會依環境決定上午/下午字串；避免 SSR hydration（本頁為 client-only，但仍保持一致）
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseYmd(s?: string): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function daysLeft(ymd?: string): number | null {
  const dt = parseYmd(ymd);
  if (!dt) return null;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diff = Math.round((b - a) / (24 * 60 * 60 * 1000));
  return diff;
}

function taipeiNowParts(): { ymd: string; hhmm: string } {
  // 以 Asia/Taipei 為準，避免跨時區導致定時清除不準。
  const d = new Date();
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const y = get("year");
  const m = get("month");
  const dd = get("day");
  const hh = get("hour");
  const mm = get("minute");
  return { ymd: `${y}-${m}-${dd}`, hhmm: `${hh}:${mm}` };
}

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function compareText(a: unknown, b: unknown): number {
  return safeStr(a).trim().localeCompare(safeStr(b).trim(), "zh-Hant");
}

function compareYmd(a?: string, b?: string): number {
  const aa = safeStr(a).trim();
  const bb = safeStr(b).trim();
  if (!aa && !bb) return 0;
  if (!aa) return 1;
  if (!bb) return -1;
  return aa.localeCompare(bb);
}

function compareTimestamp(a?: number, b?: number): number {
  const aa = Number.isFinite(a) ? Number(a) : -1;
  const bb = Number.isFinite(b) ? Number(b) : -1;
  return aa - bb;
}


function exportInstallationsCSV(rows: Installation[]) {
  const header = [
    "name",
    "modelCode",
    "region",
    "customer",
    "phase",
    "engineer",
    "progress",
    "orderDate",
    "estArrival",
    "actArrival",
    "estComplete",
    "actComplete",
    "notes",
    "updatedAt"
  ];

  const csv = [
    header.join(","),
    ...rows.map((r) =>
      header
        .map((k) => {
          const v = (r as any)[k];
          const s = v == null ? "" : String(v);
          // escape
          const escaped = s.replaceAll('"', '""');
          return `"${escaped}"`;
        })
        .join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `installations_${todayYYYYMMDD()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function isOverdueInstall(r: Installation, today: string): boolean {
  const due = safeStr(r.estComplete);
  if (!due) return false;
  if (safeStr(r.phase) === "released") return false;
  return due < today;
}

function calcInstallStats(rows: Installation[], today: string) {
  const total = rows.length;
  const wip = rows.filter((r) => r.phase !== "released").length;
  const released = rows.filter((r) => r.phase === "released").length;
  const overdue = rows.filter((r) => isOverdueInstall(r, today)).length;
  const avgProg = total ? Math.round(rows.reduce((a, r) => a + (r.progress ?? 0), 0) / total) : 0;
  const byPhase: Record<PhaseKey, number> = {
    ordered: 0,
    shipping: 0,
    arrived: 0,
    installing: 0,
    trial: 0,
    qual: 0,
    released: 0
  };
  for (const r of rows) byPhase[r.phase] = (byPhase[r.phase] ?? 0) + 1;
  return { total, wip, released, overdue, avgProg, byPhase };
}

// 容量風險：滿載代表機器很緊
// 紅：≥ 80%（高負載） / 黃：30–79% / 綠：< 30%（容量充裕）
function calcCapacityLevelStatic(uph: number, targetUph: number): "綠" | "黃" | "紅" {
  if (targetUph <= 0) return "綠";
  const ratio = uph / targetUph;
  if (ratio >= 0.8) return "紅";
  if (ratio >= 0.3) return "黃";
  return "綠";
}

function calcEquipmentStats(rows: Equipment[]) {
  const total = rows.length;
  const avgUtil = total ? Math.round(rows.reduce((a, r) => a + getLiveUtilization(r.capacity), 0) / total) : 0;
  const byStatus: Record<EquipmentMainStatus, number> = { "裝機": 0, "試產": 0, "正式生產中": 0 };
  const byCap: Record<CapacityLevel, number> = { "綠": 0, "黃": 0, "紅": 0 };
  let blocked = 0;
  for (const r of rows) {
    byStatus[r.statusMain] = (byStatus[r.statusMain] ?? 0) + 1;
    // 即時重算，不依賴 Firestore 存的舊 level 值
    const liveLevel = calcCapacityLevelStatic(Number(r.capacity.uph), Number(r.capacity.targetUph));
    byCap[liveLevel] = (byCap[liveLevel] ?? 0) + 1;
    if (r.blocking?.reasonCode) blocked++;
  }
  return { total, avgUtil, byStatus, byCap, blocked };
}

function normalizeOptionList(rows: string[]): string[] {
  return Array.from(new Set(rows.map((s) => String(s).trim()).filter(Boolean)));
}

function getInstallSerial(r: Installation): string {
  return getInstallationSerial(r);
}

function getInstallModelSerial(r: Installation): string {
  return getInstallationModelSerial(r);
}

function getInstallTaskLabel(r: Installation): string {
  return getInstallationTaskTitle(r);
}

function regionLabel(k: RegionKey): string {
  return REGIONS[k]?.label ?? k;
}

function pickColorByUtil(u: number): string {
  if (u >= 80) return "#10b981";
  if (u >= 50) return "#f59e0b";
  return "#ef4444";
}

function defaultEquipSubStatus(statusMain: EquipmentMainStatus): string {
  return EQUIPMENT_SUB_STATUS_OPTIONS[statusMain]?.[0] ?? "";
}

// --- Saved Filter ---
const SAVED_FILTERS_KEY = "premtek_saved_filters";

type SavedFilter = {
  id: string;
  name: string;
  region: string;
  model: string;
  phase: string;
  customer: string;
  engineer: string;
  keyword: string;
  savedAt: number;
};

function loadSavedFilters(): SavedFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    return raw ? (JSON.parse(raw) as SavedFilter[]) : [];
  } catch { return []; }
}

function persistSavedFilters(filters: SavedFilter[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
}

export function DashboardWorkspace({ section }: { section: DashboardSection }) {
  const { user, isAdmin, appVersion } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const installViewParam = searchParams.get("view");
  const insightsTabParam = searchParams.get("tab");

  const [installView, setInstallView] = useState<InstallView>(parseInstallView(installViewParam));
  const [insightsTab, setInsightsTab] = useState<InsightsTab>(parseInsightsTab(insightsTabParam));
  const [insightsCollapsed, setInsightsCollapsed] = useState<Record<InsightsTab, boolean>>({
    analytics: false,
    logs: false,
  });
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
  } = useDashboardData({ isAdmin, section });

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
  const [installSortKey, setInstallSortKey] = useState<InstallSortKey>("updatedAt");
  const [installSortDir, setInstallSortDir] = useState<"asc" | "desc">("desc");
  // ───────── Saved Filters ─────────
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => loadSavedFilters());
  const [saveFilterName, setSaveFilterName] = useState<string>("");
  const [showSaveFilterInput, setShowSaveFilterInput] = useState(false);

  // ───────── Filters: Equipments ─────────
  const [eRegion, setERegion] = useState<"" | RegionKey>("");
  const [eStatus, setEStatus] = useState<"" | EquipmentMainStatus>("");
  const [eCap, setECap] = useState<"" | CapacityLevel>("");
  const [eKeyword, setEKeyword] = useState<string>("");
  const [equipSortKey, setEquipSortKey] = useState<EquipSortKey>("updatedAt");
  const [equipSortDir, setEquipSortDir] = useState<"asc" | "desc">("desc");

  // ───────── UI state ─────────
  const [toast, setToast] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEq, setDrawerEq] = useState<Equipment | null>(null);

  // ───────── Modal: Installation ─────────
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installEditId, setInstallEditId] = useState<string | null>(null);
  const [installForm, setInstallForm] = useState<any>(() => getInstallationDefaultDraft(DEFAULT_MACHINE_MODELS));
  const [installErrors, setInstallErrors] = useState<FieldErrorMap>({});
  const [installErrorSummary, setInstallErrorSummary] = useState<string[]>([]);
  const installFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ───────── Modal: Excel Import ─────────
  const [smartImportOpen, setSmartImportOpen] = useState(false);

  // ───────── Modal: Equipment ─────────
  const [equipModalOpen, setEquipModalOpen] = useState(false);
  const [equipEditId, setEquipEditId] = useState<string | null>(null);
  const [equipForm, setEquipForm] = useState<any>({
    equipmentId: "",
    region: "north",
    customer: "",
    site: "",
    modelCode: "FlexTRAK-S",
    serialNo: "",
    statusMain: "裝機",
    statusSub: "",
    owner: "",
    milestones: {
      installStart: "",
      installDone: "",
      trialStart: "",
      trialPass: "",
      prodStart: "",
      reachTargetDate: ""
    },
    hasBlocking: false,
    blocking: {
      reasonCode: "",
      detail: "",
      owner: "",
      eta: ""
    },
    capacity: {
      utilization: 0,
      uph: 0,
      targetUph: 0,
      level: "綠",
      trend7dCsv: ""
    },
    products: [] as { name: string; dailyCap: number | string }[]
  });

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


  const today = todayYYYYMMDD();

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
    } catch (e: any) {
      setToast(`清除失敗：${e?.message || "unknown"}`);
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
    } catch (e: any) {
      setToast(`清除失敗：${e?.message || "unknown"}`);
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

  // ───────── 工具：舊 Firestore region 中文 → 英文 key ─────────
  function normalizeRegionKey(raw: string | undefined): "north" | "central" | "south" {
    if (raw === "north" || raw === "central" || raw === "south") return raw;
    if (raw === "北區") return "north";
    if (raw === "中區") return "central";
    return "south";
  }

  // ───────── 工具：UPH → 容量等級自動換算（呼叫外部 static 版本）─────────
  const calcCapacityLevel = calcCapacityLevelStatic;

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

  const filteredInstallations = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const rows = installations.filter((r) => {
      if (fRegion && r.region !== fRegion) return false;
      if (fModel && r.modelCode !== fModel) return false;
      if (fPhase && r.phase !== fPhase) return false;
      if (fCustomer && r.customer !== fCustomer) return false;
      if (fEngineer && toDisplayShortName(r.engineer) !== fEngineer) return false;
      if (k) {
        const blob = [
          r.name,
          r.customer,
          toDisplayShortName(r.engineer),
          r.notes,
          r.custContact,
          r.modelCode,
          r.phase
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(k)) return false;
      }
      return true;
    });

    const phaseOrder = new Map(PHASES.map((p, index) => [p.key, index] as const));
    const direction = installSortDir === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      let result = 0;
      switch (installSortKey) {
        case "name":
          result = compareText(a.name, b.name);
          break;
        case "customer":
          result = compareText(a.customer, b.customer);
          break;
        case "engineer":
          result = compareText(toDisplayShortName(a.engineer), toDisplayShortName(b.engineer));
          break;
        case "phase":
          result = (phaseOrder.get(a.phase) ?? 999) - (phaseOrder.get(b.phase) ?? 999);
          break;
        case "estComplete":
          result = compareYmd(a.estComplete, b.estComplete);
          break;
        case "updatedAt":
        default:
          result = compareTimestamp(a.updatedAt, b.updatedAt);
          break;
      }

      if (result === 0) {
        result = compareTimestamp(a.updatedAt, b.updatedAt);
      }
      if (result === 0) {
        result = compareText(a.name, b.name);
      }
      return result * direction;
    });
  }, [installations, fRegion, fModel, fPhase, fCustomer, fEngineer, keyword, installSortDir, installSortKey]);

  const installStats = useMemo(() => calcInstallStats(filteredInstallations, today), [filteredInstallations, today]);

  const filteredEquipments = useMemo(() => {
    const k = eKeyword.trim().toLowerCase();
    const rows = equipments.filter((r) => {
      if (eRegion && r.region !== eRegion) return false;
      if (eStatus && r.statusMain !== eStatus) return false;
      if (eCap && r.capacity.level !== eCap) return false;
      if (k) {
        const blob = [
          r.equipmentId,
          r.customer,
          r.site,
          r.modelCode,
          // 相容舊欄位：早期資料可能用 name 當作機台序號
          (r as any).serialNo || (r as any).name,
          r.statusMain,
          r.statusSub,
          r.owner,
          r.blocking?.reasonCode,
          r.blocking?.detail
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(k)) return false;
      }
      return true;
    });

    const statusOrder = new Map(EQUIPMENT_MAIN_STATUSES.map((status, index) => [status, index] as const));
    const direction = equipSortDir === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      let result = 0;
      switch (equipSortKey) {
        case "customer":
          result = compareText(a.customer, b.customer);
          break;
        case "owner":
          result = compareText(toDisplayShortName(a.owner), toDisplayShortName(b.owner));
          break;
        case "serialNo":
          result = compareText((a as any).serialNo || (a as any).name, (b as any).serialNo || (b as any).name);
          break;
        case "statusMain":
          result = (statusOrder.get(a.statusMain) ?? 999) - (statusOrder.get(b.statusMain) ?? 999);
          break;
        case "utilization":
          result = getLiveUtilization(a.capacity) - getLiveUtilization(b.capacity);
          break;
        case "updatedAt":
        default:
          result = compareTimestamp(a.updatedAt, b.updatedAt);
          break;
      }

      if (result === 0) {
        result = compareTimestamp(a.updatedAt, b.updatedAt);
      }
      if (result === 0) {
        result = compareText(a.equipmentId, b.equipmentId);
      }
      return result * direction;
    });
  }, [equipments, eRegion, eStatus, eCap, eKeyword, equipSortDir, equipSortKey]);

  const equipStats = useMemo(() => calcEquipmentStats(filteredEquipments), [filteredEquipments]);

  // ───────── Analytics ─────────
  const anPhase = useMemo(() => {
    const total = filteredInstallations.length;
    const by: Record<string, number> = {};
    for (const p of PHASES) by[p.key] = 0;
    for (const r of filteredInstallations) by[r.phase] = (by[r.phase] ?? 0) + 1;
    return { total, by };
  }, [filteredInstallations]);

  const anRegion = useMemo(() => {
    return (Object.entries(REGIONS) as any).map(([k, v]: [RegionKey, any]) => {
      const rows = filteredInstallations.filter((r) => r.region === k);
      const avg = rows.length ? Math.round(rows.reduce((a, r) => a + (r.progress ?? 0), 0) / rows.length) : 0;
      return { key: k, label: v.label, color: v.color, total: rows.length, avg, rows: rows.slice(0, 10) };
    });
  }, [filteredInstallations]);

  const anEngineer = useMemo(() => {
    const total = filteredInstallations.length || 1;
    return engineers.map((name) => {
      const rows = filteredInstallations.filter((r) => toDisplayShortName(r.engineer) === name);
      const active = rows.filter((r) => r.phase !== "released").length;
      const pct = Math.round((rows.length / total) * 100);
      return { name, total: rows.length, active, pct };
    });
  }, [filteredInstallations, engineers]);

  const anDue = useMemo(() => {
    return filteredInstallations
      .filter((r) => r.phase !== "released" && r.estComplete)
      .map((r) => ({
        ...r,
        dl: daysLeft(r.estComplete || "")
      }))
      .filter((r: any) => r.dl != null && r.dl < 14)
      .sort((a: any, b: any) => (a.dl ?? 9999) - (b.dl ?? 9999));
  }, [filteredInstallations]);

  // 地區產品產能摘要（全部設備，有填 products 者）
  const regionProductStats = useMemo(() => {
    type RegionEntry = { label: string; color: string; productMap: Record<string, number> };
    const map: Record<string, RegionEntry> = {};
    equipments
      .filter((e) => (e.products ?? []).length > 0)
      .forEach((e) => {
        const rKey = (e.region as string) ?? "north";
        const reg = (REGIONS as any)[rKey] ?? { label: rKey, color: "#3b82f6" };
        if (!map[rKey]) map[rKey] = { label: reg.label, color: reg.color, productMap: {} };
        (e.products ?? []).forEach((p) => {
          if (p.name.trim()) {
            map[rKey].productMap[p.name] = (map[rKey].productMap[p.name] ?? 0) + p.dailyCap;
          }
        });
      });
    return Object.entries(map).map(([key, val]) => ({
      key,
      label: val.label,
      color: val.color,
      products: Object.entries(val.productMap)
        .map(([name, cap]) => ({ name, cap }))
        .sort((a, b) => b.cap - a.cap),
    }));
  }, [equipments]);

  const clearInstallErrors = () => {
    setInstallErrors({});
    setInstallErrorSummary([]);
  };

  const updateInstallField = (field: string, value: unknown) => {
    setInstallForm((prev: any) => ({ ...prev, [field]: value }));
    setInstallErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setInstallErrorSummary([]);
  };

  const focusInstallErrorField = (field: string) => {
    const container = installFieldRefs.current[field];
    if (!container) return;
    container.scrollIntoView({ behavior: "smooth", block: "center" });
    const target = container.querySelector("input, select, textarea, button") as HTMLElement | null;
    target?.focus();
  };

  // ───────── Actions: Installations ─────────
  const openAddInstall = () => {
    setInstallEditId(null);
    setInstallForm(getInstallationDefaultDraft(machineModels));
    clearInstallErrors();
    setInstallModalOpen(true);
  };

  const openEditInstall = (r: Installation) => {
    setInstallEditId(r.id);
    setInstallForm(normalizeInstallationDraft({
      name: r.name ?? "",
      modelCode: r.modelCode ?? "",
      region: r.region ?? "north",
      customer: r.customer ?? "",
      phase: r.phase ?? "ordered",
      engineer: toDisplayShortName(r.engineer) || "",
      custContact: r.custContact ?? "",
      custPhone: r.custPhone ?? "",
      orderDate: r.orderDate ?? "",
      estArrival: normalizeDateYmd(r.estArrival),
      actArrival: normalizeDateYmd(r.actArrival),
      estComplete: normalizeDateYmd(r.estComplete),
      actComplete: normalizeDateYmd(r.actComplete),
      notes: r.notes ?? "",
      progress: r.progress ?? 0,
      checklist: r.checklist ?? {},
    }, machineModels));
    clearInstallErrors();
    setInstallModalOpen(true);
  };


  const submitInstall = async () => {
    if (!user?.email) return;
    const previousInstall = installEditId ? installations.find((row) => row.id === installEditId) ?? null : null;
    const normalized = normalizeInstallationForSave({
      ...installForm,
      progress: clamp(Number(installForm.progress), 0, 100),
    }, machineModels);
    const parsed = installationSchema.safeParse(normalized);
    if (!parsed.success) {
      const { fieldErrors, summary } = collectFieldErrors(parsed.error.issues ?? []);
      setInstallErrors(fieldErrors);
      setInstallErrorSummary(summary);
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField) {
        window.setTimeout(() => focusInstallErrorField(firstField), 0);
      }
      setToast(summary[0] ?? "表單驗證失敗");
      return;
    }
    clearInstallErrors();
    try {
      let createdInstallId: string | null = null;
      if (installEditId) {
        await updateInstallation(installEditId, parsed.data as any);
        await writeAuditLog("更新", parsed.data.name, `更新裝機案：${parsed.data.phase}`, user.email);
        trackEvent("installation_update", { name: parsed.data.name, phase: parsed.data.phase });
      } else {
        createdInstallId = await createInstallation(parsed.data as any);
        await writeAuditLog("新增", parsed.data.name, `新增至${regionLabel(parsed.data.region)} — ${parsed.data.customer}`, user.email);
        trackEvent("installation_create", { name: parsed.data.name, phase: parsed.data.phase });
      }

      const baseVerb = installEditId ? "已更新" : "已新增";
      let finalToast = baseVerb;

      if (shouldTransferInstallationToEquipment(parsed.data)) {
        const transferResult = await transferReleasedInstallationToEquipment({
          installation: parsed.data as Installation,
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
    if (!confirm(`確定刪除「${r.name}」？`)) return;
    try {
      await removeInstallation(r.id);
      await writeAuditLog("刪除", r.name, "刪除裝機案", user.email);
      trackEvent("installation_delete", { name: r.name });
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
        const transferResult = await transferReleasedInstallationToEquipment({
          installation: parsed.data as Installation,
          installationId: r.id,
          userEmail: user.email,
          trigger: didInstallationEnterReleased(r.phase, next.key) ? "transition" : "refresh",
        });
        await writeAuditLog("推進", r.name, `${cur?.label ?? r.phase} → ${next.label}`, user.email);
        trackEvent("installation_advance", { name: r.name, from: r.phase, to: next.key });
        setToast(getEquipmentTransferToast(transferResult));
        return;
      }

      await updateInstallation(r.id, { phase: next.key, progress: getInstallationProgressByPhase(next.key) } as any);
      await writeAuditLog("推進", r.name, `${cur?.label ?? r.phase} → ${next.label}`, user.email);
      trackEvent("installation_advance", { name: r.name, from: r.phase, to: next.key });
      setToast("已推進階段");
    } catch (e) {
      setToast(`推進失敗：${safeStr(e)}`);
    }
  };

  // ───────── Actions: Equipments ─────────
  const openAddEquip = () => {
    setEquipEditId(null);
    setEquipForm({
      equipmentId: "",
      region: "north",
      customer: "",
      site: "",
      modelCode: machineModels?.[0]?.code ?? "FlexTRAK-S",
      serialNo: "",
      statusMain: "裝機",
      statusSub: defaultEquipSubStatus("裝機"),
      owner: "",
      milestones: {
        installStart: "",
        installDone: "",
        trialStart: "",
        trialPass: "",
        prodStart: "",
        reachTargetDate: ""
      },
      hasBlocking: false,
      blocking: { reasonCode: "", detail: "", owner: "", eta: "" },
      capacity: { utilization: 0, uph: "0", targetUph: "0", level: "綠", trend7dCsv: "" },
      products: []
    });
    setEquipModalOpen(true);
  };

  const openEditEquip = (r: Equipment) => {
    setEquipEditId(r.id);
    setEquipForm({
      equipmentId: r.equipmentId ?? "",
      region: normalizeRegionKey(r.region),
      customer: r.customer ?? "",
      site: r.site ?? "",
      modelCode: r.modelCode ?? "",
      // 相容舊欄位：若 serialNo 空白但 name 有值，仍可直接編輯/儲存
      serialNo: (r as any).serialNo ?? (r as any).name ?? "",
      statusMain: r.statusMain ?? "裝機",
      statusSub: r.statusSub ?? "",
      owner: toDisplayShortName(r.owner) || "",
      milestones: {
        installStart: r.milestones?.installStart ?? "",
        installDone: r.milestones?.installDone ?? "",
        trialStart: r.milestones?.trialStart ?? "",
        trialPass: r.milestones?.trialPass ?? "",
        prodStart: r.milestones?.prodStart ?? "",
        reachTargetDate: r.milestones?.reachTargetDate ?? ""
      },
      hasBlocking: !!r.blocking?.reasonCode,
      blocking: {
        reasonCode: r.blocking?.reasonCode ?? "",
        detail: r.blocking?.detail ?? "",
        owner: r.blocking?.owner ?? "",
        eta: r.blocking?.eta ?? ""
      },
      capacity: (() => {
        const snapshot = buildCapacitySnapshot(r.capacity);
        return {
          utilization: snapshot.utilization,
          uph: String(snapshot.uph),       // 以 string 儲存，避免 React controlled number input "01.8" bug
          targetUph: String(snapshot.targetUph),
          level: calcCapacityLevel(snapshot.uph, snapshot.targetUph),   // 開啟時就重算，不沿用舊值
          trend7dCsv: (r.capacity?.trend7d ?? []).join(",")
        };
      })(),
      products: (r.products ?? []).map(p => ({ name: p.name, dailyCap: p.dailyCap }))
    });
    setEquipModalOpen(true);
  };

  const parseTrend7d = (csv: string, fallback: number): number[] => {
    const parts = csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s));
    const vals = parts.filter((n) => Number.isFinite(n)).map((n) => clamp(n, 0, 100));
    if (vals.length === 7) return vals;
    // fallback: 以 utilization 做 7 天微波動
    const base = clamp(fallback, 0, 100);
    const out = Array.from({ length: 7 }, (_, i) => clamp(base + (i - 3) * 1.5, 0, 100));
    return out.map((n) => Math.round(n));
  };

  const submitEquip = async () => {
    if (!user?.email) return;

    const payload = {
      equipmentId: equipForm.equipmentId,
      region: equipForm.region,
      customer: equipForm.customer,
      site: equipForm.site,
      modelCode: equipForm.modelCode,
      serialNo: equipForm.serialNo,
      statusMain: equipForm.statusMain,
      statusSub: equipForm.statusSub ?? "",
      owner: toDisplayShortName(equipForm.owner),
      milestones: equipForm.milestones,
      blocking: equipForm.hasBlocking
        ? {
            reasonCode: equipForm.blocking.reasonCode,
            detail: equipForm.blocking.detail,
            owner: equipForm.blocking.owner,
            eta: equipForm.blocking.eta || undefined
          }
        : undefined,
      capacity: (() => {
        const uph = Number(equipForm.capacity.uph);
        const targetUph = Number(equipForm.capacity.targetUph);
        const utilization = calculateUtilization(uph, targetUph);
        return {
          utilization,
          uph,
          targetUph,
          level: calcCapacityLevel(uph, targetUph),
          trend7d: parseTrend7d(equipForm.capacity.trend7dCsv ?? "", utilization)
        };
      })(),
      products: (equipForm.products ?? [])
        .filter((p: { name: string; dailyCap: number | string }) => p.name.trim())
        .map((p: { name: string; dailyCap: number | string }) => ({ name: p.name.trim(), dailyCap: Number(p.dailyCap) || 0 }))
    };

    const parsed = equipmentSchema.safeParse(payload);
    if (!parsed.success) {
      setToast(parsed.error.issues?.[0]?.message ?? "表單驗證失敗");
      return;
    }

    // ── Firestore 安全 payload：所有欄位明確指定，無 undefined ──────────────
    const safeMilestones = {
      installStart:    parsed.data.milestones?.installStart    ?? "",
      installDone:     parsed.data.milestones?.installDone     ?? "",
      trialStart:      parsed.data.milestones?.trialStart      ?? "",
      trialPass:       parsed.data.milestones?.trialPass       ?? "",
      prodStart:       parsed.data.milestones?.prodStart       ?? "",
      reachTargetDate: parsed.data.milestones?.reachTargetDate ?? "",
    };
    const safeBlocking = parsed.data.blocking
      ? {
          reasonCode: parsed.data.blocking.reasonCode ?? "",
          detail:     parsed.data.blocking.detail     ?? "",
          owner:      parsed.data.blocking.owner      ?? "",
          eta:        parsed.data.blocking.eta        ?? "",
        }
      : null; // null = delete from Firestore on update

    try {
      if (equipEditId) {
        const patch: Record<string, any> = {
          ...parsed.data,
          milestones: safeMilestones,
          blocking: safeBlocking ?? deleteField(), // deleteField() removes the field when no blocking
        };
        await updateEquipment(equipEditId, patch as any);
        await writeAuditLog("更新", parsed.data.equipmentId, `更新設備狀態：${parsed.data.statusMain}`, user.email);
        trackEvent("equipment_update", { equipmentId: parsed.data.equipmentId, statusMain: parsed.data.statusMain });
        setToast("已更新");
      } else {
        const createData: Record<string, any> = {
          ...parsed.data,
          milestones: safeMilestones,
          ...(safeBlocking ? { blocking: safeBlocking } : {}),
        };
        await createEquipment(createData as any);
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

  const openDrawer = (r: Equipment) => {
    setDrawerEq(r);
    setDrawerOpen(true);
  };

  // ───────── Saved Filter callbacks ─────────
  const saveCurrentFilter = useCallback(() => {
    const name = saveFilterName.trim();
    if (!name) return;
    const filter: SavedFilter = {
      id: Date.now().toString(36),
      name,
      region: fRegion,
      model: fModel,
      phase: fPhase,
      customer: fCustomer,
      engineer: fEngineer,
      keyword,
      savedAt: Date.now(),
    };
    const next = [...savedFilters, filter];
    setSavedFilters(next);
    persistSavedFilters(next);
    setSaveFilterName("");
    setShowSaveFilterInput(false);
  }, [saveFilterName, fRegion, fModel, fPhase, fCustomer, fEngineer, keyword, savedFilters]);

  const applyFilter = useCallback((f: SavedFilter) => {
    setFRegion(f.region as any);
    setFModel(f.model);
    setFPhase(f.phase as any);
    setFCustomer(f.customer);
    setFEngineer(f.engineer);
    setKeyword(f.keyword);
  }, []);

  const deleteSavedFilter = useCallback((id: string) => {
    const next = savedFilters.filter((f) => f.id !== id);
    setSavedFilters(next);
    persistSavedFilters(next);
  }, [savedFilters]);

  const switchInstallView = useCallback((view: InstallView) => {
    setInstallView(view);
    const next = view === "table" ? "/dashboard/install" : `/dashboard/install?view=${view}`;
    router.replace(next, { scroll: false });
  }, [router]);

  const switchInsightsTab = useCallback((nextTab: InsightsTab) => {
    setInsightsTab(nextTab);
    setInsightsCollapsed((prev) => ({ ...prev, [nextTab]: false }));
  }, []);

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

  const installActionQueue = filteredInstallations
    .map((r): (MissionQueueItem & { priority: number }) | null => {
      if (r.phase === "released") return null;
      const dueInDays = daysLeft(r.estComplete);
      const phaseLabel = PHASE_MAP[r.phase]?.label ?? r.phase;
      const owner = toDisplayShortName(r.engineer) || "未指派";
      const meta = `${r.customer} · ${phaseLabel} · ${owner}`;

      if (isOverdueInstall(r, today)) {
        const overdueDays = dueInDays == null ? "?" : String(Math.abs(dueInDays));
        return {
          id: `install-overdue-${r.id}`,
          label: getInstallTaskLabel(r),
          meta,
          value: `逾期 ${overdueDays} 天`,
          tone: "critical",
          priority: dueInDays == null ? 0 : dueInDays,
          onClick: () => openEditInstall(r),
        };
      }

      if (!toDisplayShortName(r.engineer) && doesInstallationPhaseRequireEngineer(r.phase)) {
        return {
          id: `install-owner-${r.id}`,
          label: getInstallTaskLabel(r),
          meta,
          value: "未指派",
          tone: "warning",
          priority: 10,
          onClick: () => openEditInstall(r),
        };
      }

      if (dueInDays != null && dueInDays >= 0 && dueInDays <= 7) {
        return {
          id: `install-due-${r.id}`,
          label: getInstallTaskLabel(r),
          meta,
          value: `${dueInDays} 天內`,
          tone: "info",
          priority: 20 + dueInDays,
          onClick: () => openEditInstall(r),
        };
      }

      if (!r.estComplete && r.phase !== "ordered") {
        return {
          id: `install-date-${r.id}`,
          label: getInstallTaskLabel(r),
          meta,
          value: "缺預計日",
          tone: "warning",
          priority: 40,
          onClick: () => openEditInstall(r),
        };
      }

      return null;
    })
    .filter((item): item is MissionQueueItem & { priority: number } => Boolean(item))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map(({ priority: _priority, ...item }) => item);

  const equipmentActionQueue = filteredEquipments
    .map((r): (MissionQueueItem & { priority: number }) | null => {
      const utilization = getLiveUtilization(r.capacity);
      const liveLevel = calcCapacityLevel(r.capacity.uph, r.capacity.targetUph);
      const serial = (r as any).serialNo || (r as any).name || r.equipmentId || r.id;
      const meta = `${r.customer} · ${regionLabel(r.region)} · ${toDisplayShortName(r.owner) || "未指派"}`;

      if (r.blocking?.reasonCode) {
        return {
          id: `equipment-blocked-${r.id}`,
          label: serial,
          meta: `${meta} · ${r.blocking.reasonCode}`,
          value: "阻塞",
          tone: "critical",
          priority: 0,
          onClick: () => openDrawer(r),
        };
      }

      if (liveLevel === "紅") {
        return {
          id: `equipment-capacity-${r.id}`,
          label: serial,
          meta,
          value: `紅燈 ${utilization}%`,
          tone: "warning",
          priority: 10 + (100 - utilization),
          onClick: () => openDrawer(r),
        };
      }

      if (utilization >= 80) {
        return {
          id: `equipment-util-${r.id}`,
          label: serial,
          meta,
          value: `高稼動 ${utilization}%`,
          tone: "info",
          priority: 30 + (100 - utilization),
          onClick: () => openDrawer(r),
        };
      }

      return null;
    })
    .filter((item): item is MissionQueueItem & { priority: number } => Boolean(item))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map(({ priority: _priority, ...item }) => item);

  const heroMetrics = section === "install"
    ? [
        { label: "Action queue", value: installActionQueue.length, meta: "逾期、近七天、未指派" },
        { label: "WIP", value: installStats.wip, meta: "尚未 released" },
        { label: "Release ratio", value: installStats.total ? `${Math.round((installStats.released / installStats.total) * 100)}%` : "0%", meta: "目前篩選完成率" },
      ]
    : section === "equipment"
      ? [
          { label: "Action queue", value: equipmentActionQueue.length, meta: "阻塞、紅燈、高稼動" },
          { label: "Blocked", value: equipStats.blocked, meta: "需要 Owner 排除" },
          { label: "Red capacity", value: equipStats.byCap["紅"], meta: "容量風險燈號" },
        ]
      : [
          { label: "Audit logs", value: auditLogs.length, meta: "操作留痕" },
          { label: "Events", value: events.length, meta: "系統事件" },
          { label: "Retention", value: retentionCfg.autoPurgeEnabled ? "Auto" : "Manual", meta: "紀錄保留策略" },
        ];

  // ───────── Render helpers ─────────
  const installCard = (r: Installation) => {
    const phase = PHASE_MAP[r.phase];
    const overdue = isOverdueInstall(r, today);
    return (
      <article key={r.id} className="card installCaseCard">
        <div className="installCaseGlow" aria-hidden style={{ background: `${phase.color}24` }} />
        <div className="installCaseHead">
          <div>
            <div className="installCaseTitle mono">{getInstallSerial(r)}</div>
            <div className="installCaseMeta">
              {regionLabel(r.region)} · {r.customer}
            </div>
          </div>
          <div className="installCaseTags">
            <Badge text={r.modelCode} color="#3b82f6" subtle />
            <Badge text={`${phase.icon} ${phase.label}`} color={phase.color} subtle />
            {overdue ? <Badge text="逾期" color="#ef4444" /> : null}
          </div>
        </div>

        <div className="installCaseProgress">
          <div className="installCaseProgressTop">
            <span>工程師：{toDisplayShortName(r.engineer) || "-"}</span>
            <span className="mono">{r.progress ?? 0}%</span>
          </div>
          <div className="progressOuter">
            <div className="progressInner" style={{ width: `${clamp(r.progress ?? 0, 0, 100)}%` }} />
          </div>
        </div>

        <div className="installCaseFoot">
          <div className="installCaseDue">
            {r.estComplete ? `預計 ${r.estComplete}` : "未設定安裝日"}
          </div>
        </div>

        <div className="installCaseActions">
          <button className="btn btnSmall" onClick={() => advanceInstall(r)}>推進</button>
          <button className="btn btnSmall" onClick={() => openEditInstall(r)}>編輯</button>
          <button className="btn btnSmall btnDanger" onClick={() => delInstall(r)}>刪除</button>
        </div>
      </article>
    );
  };

  const todayLabel = new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date());

  const hero = section === "install"
    ? {
        title: "裝機營運戰情室",
        desc: "A 方案 Aurora：以淡色玻璃戰情室呈現裝機風險、產能、進度與台帳轉移狀態。",
        chips: [
          `${installStats.total} 筆裝機案`,
          installView === "pipeline" ? "Pipeline 視圖" : installView === "gantt" ? "甘特圖視圖" : installView === "card" ? "卡片視圖" : "表格視圖",
        ],
        spotlightLabel: "風險優先",
        spotlightValue: `${installStats.overdue} 筆逾期`,
        spotlightHint: "優先處理會阻塞安裝、序號補齊或台帳轉移的案件",
      }
    : section === "equipment"
      ? {
          title: "設備營運面板",
          desc: "聚焦設備狀態、容量與阻塞，快速定位並執行更新。",
          chips: [
            `${equipStats.total} 台設備`,
            `${equipStats.avgUtil}% 平均稼動率`,
          ],
          spotlightLabel: "待排除重點",
          spotlightValue: `${equipStats.blocked} 台阻塞中`,
          spotlightHint: "阻塞設備會優先影響產能與交付時程",
        }
      : {
          title: "洞察與紀錄",
          desc: "聚焦分析與操作軌跡，掌握整體健康度與決策依據。",
          chips: [
            insightsTab === "analytics" ? "分析視圖" : "紀錄視圖",
            isAdmin ? `近 7 天事件 ${events.length}` : "一般使用者模式",
          ],
          spotlightLabel: "稽核紀錄",
          spotlightValue: `${auditLogs.length} 筆`,
          spotlightHint: "可於「紀錄」分頁查看完整異動與事件細節",
        };

  const equipSubStatusOptions = EQUIPMENT_SUB_STATUS_OPTIONS[(equipForm.statusMain as EquipmentMainStatus) || "裝機"] ?? [];

  return (
      <div className="container dashboardShell auroraDashboardShell" style={{ paddingTop: 14, paddingBottom: 24 }}>
        <section className="dashboardHero">
          <div className="heroGrid">
            <div className="heroLead">
              <div className="dashboardHeroTitle">{hero.title}</div>
              <div className="dashboardHeroDesc">{hero.desc}</div>
              <div className="dashboardHeroMeta">
                <span className="dashboardHeroPill">{todayLabel}</span>
                {hero.chips.map((chip) => (
                  <span key={chip} className="dashboardHeroPill">{chip}</span>
                ))}
              </div>
              <div className="heroCommandGrid">
                {heroMetrics.map((metric) => (
                  <div key={metric.label} className="heroCommandMetric">
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <small>{metric.meta}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="heroSummary">
              <div className="heroSummaryLabel">{hero.spotlightLabel}</div>
              <div className="heroSummaryValue">{hero.spotlightValue}</div>
              <div className="heroSummaryHint">{hero.spotlightHint}</div>
            </div>
          </div>
        </section>

        {toast ? (
          <div className="card toastBanner" style={{ padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 13 }}>{toast}</div>
          </div>
        ) : null}

        {/* ───────── Section: Installations ───────── */}
        {section === "install" ? (
          <>
            <div className="gridStats auroraStatsGrid">
              <StatCard label="總裝機案" value={installStats.total} sub="以目前篩選條件計算" color="#3b82f6" icon="📌" />
              <StatCard label="進行中" value={installStats.wip} sub="未到正式量產" color="#f59e0b" icon="🔧" />
              <StatCard label="已量產" value={installStats.released} sub="released" color="#10b981" icon="✅" />
              <StatCard label="平均進度" value={`${installStats.avgProg}%`} sub="平均" color="#3b82f6" icon="📈" />
            </div>

            <MissionQueuePanel
              title="今日優先處理"
              subtitle={`${installActionQueue.length} 項需要確認`}
              items={installActionQueue}
              emptyText="目前沒有逾期、近七天到期或未指派的裝機案。"
            />

            <div className="card auroraControlPanel" style={{ padding: 14, marginTop: 12 }}>
              <div className="panelHeader auroraPanelHeader">
                <div style={{ fontWeight: 900 }}>篩選 / 操作</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <div className="segTabs">
                    <button className={installView === "table" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("table")}>表格</button>
                    <button className={installView === "card" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("card")}>卡片</button>
                    <button className={installView === "pipeline" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("pipeline")}>Pipeline</button>
                    <button className={installView === "gantt" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("gantt")}>甘特圖</button>
                  </div>
                  <button className="btn btnSmall" onClick={() => exportInstallationsCSV(filteredInstallations)}>匯出 CSV</button>
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
                  <select value={fPhase} onChange={(e) => setFPhase(e.target.value as any)}>
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

            {installView === "pipeline" || installView === "gantt" ? null : installView === "card" ? (
              <div className="auroraInstallCardGrid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
                {filteredInstallations.map(installCard)}
              </div>
            ) : (
              <div className="card auroraTablePanel" style={{ marginTop: 12 }}>
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <SortableTh label="機台序號" active={installSortKey === "name"} dir={installSortDir} onClick={() => toggleInstallSort("name")} />
                        <SortableTh label="客戶" active={installSortKey === "customer"} dir={installSortDir} onClick={() => toggleInstallSort("customer")} />
                        <th>區域</th>
                        <th>機型</th>
                        <SortableTh label="階段" active={installSortKey === "phase"} dir={installSortDir} onClick={() => toggleInstallSort("phase")} />
                        <SortableTh label="工程師" active={installSortKey === "engineer"} dir={installSortDir} onClick={() => toggleInstallSort("engineer")} />
                        <th>進度</th>
                        <SortableTh label="預計安裝日" active={installSortKey === "estComplete"} dir={installSortDir} onClick={() => toggleInstallSort("estComplete")} />
                        <SortableTh label="更新" active={installSortKey === "updatedAt"} dir={installSortDir} onClick={() => toggleInstallSort("updatedAt")} />
                        <th style={{ width: 220 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInstallations.map((r) => {
                        const phase = PHASE_MAP[r.phase];
                        const overdue = isOverdueInstall(r, today);
                        return (
                          <tr key={r.id}>
                            <td style={{ fontWeight: 900 }}>{getInstallSerial(r)}</td>
                            <td>{r.customer}</td>
                            <td><Badge text={REGIONS[r.region].label} color={REGIONS[r.region].color} subtle /></td>
                            <td><Badge text={r.modelCode} color="#3b82f6" subtle /></td>
                            <td><Badge text={`${phase.icon} ${phase.label}`} color={phase.color} subtle /></td>
                            <td>{toDisplayShortName(r.engineer) || "-"}</td>
                            <td>
                              <div className="progressOuter" style={{ maxWidth: 140 }}>
                                <div className="progressInner" style={{ width: `${clamp(r.progress ?? 0, 0, 100)}%` }} />
                              </div>
                              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                                {r.progress ?? 0}% {overdue ? <span style={{ color: "#ef4444", fontWeight: 900 }}>（逾期）</span> : null}
                              </div>
                            </td>
                            <td>{r.estComplete || "-"}</td>
                            <td style={{ color: "#94a3b8", fontSize: 12 }}>{fmtDate(r.updatedAt)}</td>
                            <td>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
            <div className="gridStats">
              <StatCard label="設備總數" value={equipStats.total} sub="以目前篩選條件計算" color="#3b82f6" icon="🧩" />
              <StatCard label="平均稼動率" value={`${equipStats.avgUtil}%`} sub="utilization" color={pickColorByUtil(equipStats.avgUtil)} icon="📈" />
              <StatCard label="阻塞中" value={equipStats.blocked} sub="有 blocking" color="#ef4444" icon="⛔" />
              <StatCard label="紅燈" value={equipStats.byCap["紅"]} sub="容量風險" color="#ef4444" icon="🔴" />
            </div>

            <MissionQueuePanel
              title="設備風險佇列"
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
                  <select value={eStatus} onChange={(e) => setEStatus(e.target.value as any)}>
                    <option value="">全部</option>
                    {EQUIPMENT_MAIN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="field">
                  <div className="label">容量</div>
                  <select value={eCap} onChange={(e) => setECap(e.target.value as any)}>
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
                <table className="table tableSmall">
                  <thead>
                    <tr>
                      <SortableTh label="機台序號" active={equipSortKey === "serialNo"} dir={equipSortDir} onClick={() => toggleEquipSort("serialNo")} />
                      <SortableTh label="客戶/站點" active={equipSortKey === "customer"} dir={equipSortDir} onClick={() => toggleEquipSort("customer")} />
                      <th>機型 / 設備 ID</th>
                      <SortableTh label="狀態" active={equipSortKey === "statusMain"} dir={equipSortDir} onClick={() => toggleEquipSort("statusMain")} />
                      <SortableTh label="Owner" active={equipSortKey === "owner"} dir={equipSortDir} onClick={() => toggleEquipSort("owner")} />
                      <SortableTh label="稼動率" active={equipSortKey === "utilization"} dir={equipSortDir} onClick={() => toggleEquipSort("utilization")} />
                      <th>產品產能</th>
                      <th>趨勢</th>
                      <SortableTh label="更新" active={equipSortKey === "updatedAt"} dir={equipSortDir} onClick={() => toggleEquipSort("updatedAt")} />
                      <th style={{ width: 220 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEquipments.map((r) => {
                      const statusColor = STATUS_COLOR[r.statusMain];
                      // 即時重算容量等級，不依賴 Firestore 存的舊值
                      const liveLevel = calcCapacityLevel(r.capacity.uph, r.capacity.targetUph);
                      const capColor = CAPACITY_COLOR[liveLevel];
                      return (
                        <tr key={r.id}>
                          <td className="mono" style={{ fontWeight: 900 }}>{(r as any).serialNo || (r as any).name || "-"}</td>
                          <td>
                            <div style={{ fontWeight: 900 }}>{r.customer}</div>
                            <div style={{ color: "#94a3b8", fontSize: 12 }}>{regionLabel(r.region)} · {r.site}</div>
                          </td>
                          <td>
                            <div><Badge text={r.modelCode} color="#3b82f6" subtle /></div>
                            <div className="mono" style={{ color: "#94a3b8", marginTop: 4 }}>
                              {r.equipmentId || "-"}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <Badge text={r.statusMain} color={statusColor} subtle />
                              <Badge text={liveLevel} color={capColor} subtle />
                              {r.blocking?.reasonCode ? <Badge text={`阻塞：${r.blocking.reasonCode}`} color="#ef4444" subtle /> : null}
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>{r.statusSub || "-"}</div>
                          </td>
                          <td>{toDisplayShortName(r.owner) || "-"}</td>
                          <td>
                            <div style={{ fontWeight: 900, color: pickColorByUtil(getLiveUtilization(r.capacity)) }}>{getLiveUtilization(r.capacity)}%</div>
                            <div style={{ color: "#94a3b8", fontSize: 12 }}>{Number(r.capacity.uph).toLocaleString()}/{Number(r.capacity.targetUph).toLocaleString()} UPH</div>
                          </td>
                          <td>
                            {(r.products ?? []).length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                {(r.products ?? []).map((p, pi) => (
                                  <div key={pi} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6", borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 900 }}>{p.name}</span>
                                    {/*
                                     * Display product daily capacity using unified formatting.
                                     * For values >= 1,000, show compact format (e.g. 5.1K).
                                     * For values < 1,000, show plain number without suffix.
                                     */}
                                    <span style={{ color: "#64748b", fontSize: 12 }}>{formatUphValue(p.dailyCap)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>}
                          </td>
                          <td><MiniTrend values={r.capacity.trend7d} color={capColor} /></td>
                          <td style={{ color: "#94a3b8", fontSize: 12 }}>{fmtDate(r.updatedAt)}</td>
                          <td>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                        <td colSpan={10} style={{ textAlign: "center", padding: 20, color: "#94a3b8" }}>無資料</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        {section === "insights" ? (
          <div className="card" style={{ padding: 10, marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div className="segTabs">
                <button className={insightsTab === "analytics" ? "segTab segTabActive" : "segTab"} onClick={() => switchInsightsTab("analytics")}>
                  分析
                </button>
                <button className={insightsTab === "logs" ? "segTab segTabActive" : "segTab"} onClick={() => switchInsightsTab("logs")}>
                  紀錄
                </button>
              </div>
              <button
                className="btn btnSmall btnGhost"
                onClick={() => setInsightsCollapsed((prev) => ({ ...prev, [insightsTab]: !prev[insightsTab] }))}
              >
                {insightsCollapsed[insightsTab] ? "展開目前內容" : "收合目前內容"}
              </button>
            </div>
          </div>
        ) : null}

        {section === "insights" && insightsCollapsed[insightsTab] ? (
          <div className="card" style={{ padding: 12, marginTop: 12 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              已收合「{insightsTab === "analytics" ? "分析" : "紀錄"}」，再點一次同分頁可展開。
            </div>
          </div>
        ) : null}

        {/* ───────── Section: Insights / Analytics ───────── */}
        {section === "insights" && !insightsCollapsed.analytics && insightsTab === "analytics" ? (
          <>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 900 }}>分析總覽</div>
              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                裝機進度、區域分佈、工程師負載與交期風險
              </div>
            </div>

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
                      {anDue.map((r: any) => {
                        const dl = Number(r.dl ?? 9999);
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
                                <Badge text={PHASE_MAP[r.phase as PhaseKey]?.label ?? r.phase} color={PHASE_MAP[r.phase as PhaseKey]?.color ?? "#3b82f6"} subtle />
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
        {section === "insights" && !insightsCollapsed.logs && insightsTab === "logs" ? (
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
                  <Badge text={(drawerEq as any).serialNo || (drawerEq as any).name || "-"} color="#94a3b8" subtle />
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
          <div className="formGrid">
            <div className="field" ref={(node) => { installFieldRefs.current.name = node; }}>
              <div className="label">
                {doesInstallationPhaseRequireSerial(installForm.phase)
                  ? <span style={{color:"var(--destructive)"}}>* </span>
                  : null}
                機台序號
                {!doesInstallationPhaseRequireSerial(installForm.phase)
                  ? <span style={{color:"var(--muted-foreground)", fontSize: 11, fontWeight: 400}}> （未到廠前可留空）</span>
                  : null}
              </div>
              <input value={installForm.name} onChange={(e) => updateInstallField("name", e.target.value)} aria-invalid={!!installErrors.name} placeholder="例如：P160623 / FT-S-001" />
              {installErrors.name ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.name}</div> : null}
            </div>
            <div className="field" ref={(node) => { installFieldRefs.current.modelCode = node; }}>
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>機型</div>
              <select value={installForm.modelCode} onChange={(e) => updateInstallField("modelCode", e.target.value)} aria-invalid={!!installErrors.modelCode}>
                {machineModels.map((m: any) => <option key={m.code} value={m.code}>{m.displayName}</option>)}
              </select>
              {installErrors.modelCode ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.modelCode}</div> : null}
            </div>
            <div className="field" ref={(node) => { installFieldRefs.current.region = node; }}>
              <div className="label">區域</div>
              <select value={installForm.region} onChange={(e) => updateInstallField("region", e.target.value)} aria-invalid={!!installErrors.region}>
                {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {installErrors.region ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.region}</div> : null}
            </div>
            <div className="field" ref={(node) => { installFieldRefs.current.customer = node; }}>
              <div className="label"><span style={{color:"var(--destructive)"}}>* </span>客戶</div>
              <input list="customerOptions" value={installForm.customer} onChange={(e) => updateInstallField("customer", e.target.value)} aria-invalid={!!installErrors.customer} placeholder="例如：TSMC F18" />
              {installErrors.customer ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.customer}</div> : null}
            </div>
            <div className="field" ref={(node) => { installFieldRefs.current.phase = node; }}>
              <div className="label">階段</div>
              <select
                value={installForm.phase}
                onChange={(e) => {
                  const phase = e.target.value as PhaseKey;
                  updateInstallField("phase", phase);
                  updateInstallField("progress", getInstallationProgressByPhase(phase));
                }}
              >
                {PHASES.map((p) => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
              </select>
              {installErrors.phase ? <div style={{ color: "var(--destructive)", fontSize: 12 }}>{installErrors.phase}</div> : null}
            </div>
            <div className="field" ref={(node) => { installFieldRefs.current.engineer = node; }}>
              {doesInstallationPhaseRequireEngineer(installForm.phase) ? (
                <div className="label"><span style={{color:"var(--destructive)"}}>* </span>工程師</div>
              ) : (
                <div className="label">工程師</div>
              )}
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

            {/* Date fields */}
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

            {/* Checklist per phase */}
            {(() => {
              const checklistItems = PHASE_CHECKLIST[installForm.phase] ?? [];
              if (checklistItems.length === 0) return null;
              const done = checklistItems.filter((it) => installForm.checklist?.[it.id]).length;
              return (
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <div className="label" style={{ marginBottom: 8, fontWeight: 700 }}>
                    檢查清單（{installForm.phase}）
                    <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 11, color: "var(--muted-foreground, #94a3b8)" }}>
                      {done}/{checklistItems.length}
                    </span>
                  </div>
                  {checklistItems.map((item) => {
                    const checked = !!(installForm.checklist?.[item.id]);
                    return (
                      <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer", userSelect: "none", borderBottom: "1px solid var(--border)" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const nextChecklist = { ...installForm.checklist, [item.id]: !checked };
                            const nextDone = checklistItems.filter((it) => nextChecklist[it.id]).length;
                            const autoProgress = Math.round((nextDone / checklistItems.length) * 20) * 5;
                            setInstallForm({ ...installForm, checklist: nextChecklist, progress: autoProgress });
                          }}
                          style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary, #2563eb)" }}
                        />
                        <span style={{ fontSize: 13, textDecoration: checked ? "line-through" : "none", color: checked ? "var(--muted-foreground, #94a3b8)" : "inherit" }}>{item.label}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })()}

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

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <div className="label">備註</div>
              <textarea value={installForm.notes} onChange={(e) => updateInstallField("notes", e.target.value)} rows={4} />
            </div>
          </div>

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
              <select value={equipForm.region} onChange={(e) => setEquipForm({ ...equipForm, region: e.target.value })}>
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
                  const nextUph = parseFloat(raw) || 0;
                  const target = Number(equipForm.capacity.targetUph);
                  const level = calcCapacityLevel(nextUph, target);
                  const utilization = calculateUtilization(nextUph, target);
                  setEquipForm({ ...equipForm, capacity: { ...equipForm.capacity, uph: raw, utilization, level } });
                }}
                onBlur={(e) => {
                  // blur 時 round 到小數一位
                  const v = Math.round((parseFloat(e.target.value) || 0) * 10) / 10;
                  const target = Number(equipForm.capacity.targetUph);
                  const level = calcCapacityLevel(v, target);
                  const utilization = calculateUtilization(v, target);
                  setEquipForm({ ...equipForm, capacity: { ...equipForm.capacity, uph: String(v), utilization, level } });
                }} />
            </div>
            <div className="field">
              <div className="label">Target UPH</div>
              <input type="number" min={0} step={0.1} value={equipForm.capacity.targetUph}
                onChange={(e) => {
                  const raw = e.target.value;
                  const uph = Number(equipForm.capacity.uph);
                  const nextTarget = parseFloat(raw) || 0;
                  const level = calcCapacityLevel(uph, nextTarget);
                  const utilization = calculateUtilization(uph, nextTarget);
                  setEquipForm({ ...equipForm, capacity: { ...equipForm.capacity, targetUph: raw, utilization, level } });
                }}
                onBlur={(e) => {
                  const v = Math.round((parseFloat(e.target.value) || 0) * 10) / 10;
                  const uph = Number(equipForm.capacity.uph);
                  const level = calcCapacityLevel(uph, v);
                  const utilization = calculateUtilization(uph, v);
                  setEquipForm({ ...equipForm, capacity: { ...equipForm.capacity, targetUph: String(v), utilization, level } });
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
