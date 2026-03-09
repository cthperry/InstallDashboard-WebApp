"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAuth } from "@/features/auth/AuthProvider";
import { listenInstallations, createInstallation, updateInstallation, removeInstallation } from "@/features/data/installations";
import { listenEquipments, createEquipment, updateEquipment, removeEquipment } from "@/features/data/equipments";
import { listenAppVariables, listenMachineModels, saveAppVariables, saveMachineModels } from "@/features/data/settings";
import { listenAuditLogs } from "@/features/data/logs";
import { writeAuditLog } from "@/features/data/audit";
import { trackEvent } from "@/features/telemetry/track";
import type { AppVariablesDoc, CapacityLevel, Equipment, EquipmentMainStatus, Installation, PhaseKey, RegionKey } from "@/domain/types";
import { DEFAULT_CUSTOMERS, DEFAULT_ENGINEERS, DEFAULT_MACHINE_MODELS } from "@/domain/constants";
import { equipmentSchema, installationSchema } from "@/domain/schemas";

import {
  C,
  todayYYYYMMDD,
  daysLeft,
  slaLabel,
  isOverdueInstall,
  calcInstallStats,
  calcEquipmentStats,
  exportInstallationsCSV,
} from "./utils";

import { WarroomPanel } from "./components/WarroomPanel";
import { InstallsPanel } from "./components/InstallsPanel";
import { EquipmentPanel } from "./components/EquipmentPanel";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { LogsPanel } from "./components/LogsPanel";
import { InstallModal } from "./components/InstallModal";
import { EquipmentModal } from "./components/EquipmentModal";
import { EquipmentDrawer } from "./components/EquipmentDrawer";
import { ImportDialog } from "./components/ImportDialog";

type ViewKey = "warroom" | "installs" | "equipment" | "analytics" | "settings" | "logs";
type InstallView = "table" | "card" | "gantt";
type PipelineView = "kanban" | "gantt";

export default function DashboardPage() {
  const { user, profile, isAdmin, appVersion, signOutNow } = useAuth();
  const today = todayYYYYMMDD();

  const [view, setView] = useState<ViewKey>("warroom");
  const [installView, setInstallView] = useState<InstallView>("table");
  const [pipelineView, setPipelineView] = useState<PipelineView>("kanban");

  const [installations, setInstallations] = useState<Installation[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [appVars, setAppVars] = useState<AppVariablesDoc | null>(null);
  const [machineModels, setMachineModels] = useState(DEFAULT_MACHINE_MODELS as any);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  const [toast, setToast] = useState("");
  const [alertDismissed, setAlertDismissed] = useState(false);
  const notifiedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Excel import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<Omit<Installation, "id"> & { _rowNum: number; _warn?: string }>>([]);
  const [importSaving, setImportSaving] = useState(false);
  const [importDragOver, setImportDragOver] = useState(false);

  const [fRegion, setFRegion] = useState<"" | RegionKey>("");
  const [fPhase, setFPhase] = useState<"" | PhaseKey>("");
  const [fEngineer, setFEngineer] = useState("");
  const [fCustomer, setFCustomer] = useState("");
  const [keyword, setKeyword] = useState("");
  const [sortCol, setSortCol] = useState<"name"|"region"|"customer"|"phase"|"engineer"|"progress"|"sla">("sla");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");

  const [eRegion, setERegion] = useState<"" | RegionKey>("");
  const [eStatus, setEStatus] = useState<"" | EquipmentMainStatus>("");
  const [eCap, setECap] = useState<"" | CapacityLevel>("");
  const [eKeyword, setEKeyword] = useState("");

  const [settingEngInput, setSettingEngInput] = useState("");
  const [settingCustInput, setSettingCustInput] = useState("");
  const [settingModelCode, setSettingModelCode] = useState("");
  const [settingModelName, setSettingModelName] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [logsClearedAt, setLogsClearedAt] = useState<number | null>(null);
  const [logAutoClearMin, setLogAutoClearMin] = useState(0);

  const [installModal, setInstallModal] = useState(false);
  const [installEditId, setInstallEditId] = useState<string | null>(null);
  const [installForm, setInstallForm] = useState<any>({
    name: "",
    modelCode: "FlexTRAK-S",
    region: "north",
    customer: "",
    phase: "ordered",
    engineer: "",
    custContact: "",
    custPhone: "",
    orderDate: "",
    estArrival: "",
    actArrival: "",
    estComplete: "",
    actComplete: "",
    notes: "",
    progress: 0,
  });
  const [installSaving, setInstallSaving] = useState(false);

  const [eqDrawerOpen, setEqDrawerOpen] = useState(false);
  const [eqSelected, setEqSelected] = useState<Equipment | null>(null);
  const [eqModal, setEqModal] = useState(false);
  const [eqEditId, setEqEditId] = useState<string | null>(null);
  const [eqForm, setEqForm] = useState<any>({
    equipmentId: "",
    region: "north",
    customer: "",
    site: "",
    modelCode: "FlexTRAK-S",
    serialNo: "",
    statusMain: "裝機",
    statusSub: "",
    owner: "",
    milestones: {},
    capacity: { utilization: 0, uph: 0, targetUph: 0, level: "綠", trend7d: [0, 0, 0, 0, 0, 0, 0] },
  });

  // Clock
  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Log auto-clear
  useEffect(() => {
    if (!logAutoClearMin || logAutoClearMin <= 0) return;
    const ms = logAutoClearMin * 60 * 1000;
    const t = setInterval(() => setLogsClearedAt(Date.now()), ms);
    return () => clearInterval(t);
  }, [logAutoClearMin]);

  // Browser notification
  useEffect(() => {
    if (notifiedRef.current || !installations.length) return;
    if (!("Notification" in window)) return;
    const overdueItems = installations.filter(r => r.phase !== "released" && r.estComplete && r.estComplete < today);
    if (!overdueItems.length) return;
    notifiedRef.current = true;
    const trigger = () => {
      const names = overdueItems
        .slice(0, 3)
        .map(r => r.name)
        .join("、");
      new Notification("PREMTEK 裝機戰情室 — 逾期警示", {
        body: `有 ${overdueItems.length} 筆裝機案逾期：${names}${overdueItems.length > 3 ? "…" : ""}`,
        icon: "/favicon.ico",
      });
    };
    if (Notification.permission === "granted") trigger();
    else if (Notification.permission !== "denied") Notification.requestPermission().then(p => { if (p === "granted") trigger(); });
  }, [installations, today]);

  // Data listeners
  useEffect(() => {
    const unsubs = [
      listenAppVariables(doc => setAppVars(doc)),
      listenMachineModels(doc => setMachineModels(doc?.models?.length ? doc.models : (DEFAULT_MACHINE_MODELS as any))),
      listenInstallations(rows => setInstallations(rows), e => console.error(e)),
      listenEquipments(rows => setEquipments(rows), e => console.error(e)),
      listenAuditLogs(rows => setAuditLogs(rows)),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const engineers = useMemo(() => {
    const list = appVars?.engineers || DEFAULT_ENGINEERS;
    return Array.isArray(list) ? list : [];
  }, [appVars]);

  const customers = useMemo(() => {
    const list = appVars?.customers || DEFAULT_CUSTOMERS;
    return Array.isArray(list) ? list : [];
  }, [appVars]);

  const customerRegionMap = useMemo<Record<string, string>>(() => {
    return (appVars?.customerRegionMap as Record<string, string>) ?? {};
  }, [appVars]);

  const overdueList = useMemo(() => installations.filter(r => isOverdueInstall(r, today)), [installations, today]);
  const urgentList = useMemo(() => {
    return installations.filter(r => {
      if (r.phase === "released" || !r.estComplete) return false;
      const dl = daysLeft(r.estComplete);
      return dl !== null && dl >= 0 && dl <= 7;
    });
  }, [installations]);

  const globalStats = useMemo(() => calcInstallStats(installations, today), [installations, today]);

  const filteredInstalls = useMemo(() => {
    let result = installations;
    if (fRegion) result = result.filter(r => r.region === fRegion);
    if (fPhase) result = result.filter(r => r.phase === fPhase);
    if (fEngineer) result = result.filter(r => r.engineer === fEngineer);
    if (fCustomer) result = result.filter(r => r.customer === fCustomer);
    if (keyword) {
      const kw = keyword.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(kw) || r.customer.toLowerCase().includes(kw));
    }
    return result;
  }, [installations, fRegion, fPhase, fEngineer, fCustomer, keyword]);

  const installStats = useMemo(() => calcInstallStats(filteredInstalls, today), [filteredInstalls, today]);

  const filteredEquipments = useMemo(() => {
    let result = equipments;
    if (eRegion) result = result.filter(r => r.region === eRegion);
    if (eStatus) result = result.filter(r => r.statusMain === eStatus);
    if (eCap) result = result.filter(r => r.capacity?.level === eCap);
    if (eKeyword) {
      const kw = eKeyword.toLowerCase();
      result = result.filter(
        r => (r.equipmentId || "").toLowerCase().includes(kw) || r.customer.toLowerCase().includes(kw) || r.serialNo.toLowerCase().includes(kw)
      );
    }
    return result;
  }, [equipments, eRegion, eStatus, eCap, eKeyword]);

  const equipStats = useMemo(() => calcEquipmentStats(filteredEquipments), [filteredEquipments]);

  const formCustomers = useMemo(() => {
    return customers.filter(c => {
      if (!installForm.region) return true;
      const mapped = customerRegionMap[c];
      return !mapped || mapped === installForm.region;
    });
  }, [customers, customerRegionMap, installForm.region]);

  const visibleLogs = useMemo(() => {
    return auditLogs.filter(log => !logsClearedAt || (log.timestamp && log.timestamp > logsClearedAt));
  }, [auditLogs, logsClearedAt]);

  const showToast = useCallback((msg: string, duration = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(""), duration);
  }, []);

  const inferModelCode = (productName: string): string => {
    if (!productName) return machineModels[0]?.code || "FlexTRAK-S";
    const pn = productName.toLowerCase();
    for (const m of machineModels) {
      const code = (m.code || "").toLowerCase();
      const display = ((m as any).displayName || "").toLowerCase();
      if (code && pn.includes(code)) return m.code;
      if (display && pn.includes(display)) return m.code;
    }
    return machineModels[0]?.code || "FlexTRAK-S";
  };

  const inferPhase = (actArrival?: string | null, actComplete?: string | null): PhaseKey => {
    if (actComplete) return "released";
    if (actArrival) return "installing";
    return "ordered";
  };

  const inferRegion = (customer: string): RegionKey => {
    const map = customerRegionMap as Record<string, string>;
    if (map && map[customer]) return map[customer] as RegionKey;
    const text = customer.toLowerCase();
    const southKeywords = ["高雄", "台南", "臺南", "屏東", "嘉義", "南部", "kaohsiung", "tainan", "pingtung", "chiayi"];
    const northKeywords = ["台北", "臺北", "桃園", "新竹", "基隆", "宜蘭", "北部", "taipei", "taoyuan", "hsinchu"];
    if (southKeywords.some(k => text.includes(k))) return "south";
    if (northKeywords.some(k => text.includes(k))) return "north";
    return "central";
  };

  const processExcelFile = useCallback(async (file: File) => {
    showToast("⏳ 正在解析 Excel…");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-excel", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        showToast(`⚠️ ${json.error ?? "解析失敗"}`, 8000);
        return;
      }

      const rawRows = json.rows as Array<Record<string, unknown>>;
      if (!rawRows?.length) {
        showToast("⚠️ 沒有找到有效的資料列", 8000);
        return;
      }

      const parsed: Array<Omit<Installation, "id"> & { _rowNum: number; _warn?: string }> = rawRows.map((r) => {
        const productName = String(r._productName ?? "");
        const customer    = String(r.customer ?? "");
        const estArrival  = (r.estArrival as string | null) ?? undefined;
        const estComplete = (r.estComplete as string | null) ?? undefined;
        const actArrival  = (r.actArrival as string | null) ?? undefined;
        const actComplete = (r.actComplete as string | null) ?? undefined;
        return {
          _rowNum:  Number(r._rowNum),
          ...(r._warn ? { _warn: String(r._warn) } : {}),
          name:        String(r.name ?? ""),
          modelCode:   inferModelCode(productName),
          region:      (r.region as RegionKey | null) ?? inferRegion(customer),
          customer,
          phase:       inferPhase(actArrival, actComplete),
          engineer:    String(r.engineer ?? ""),
          estArrival,
          estComplete,
          actArrival,
          actComplete,
          progress:    actComplete ? 100 : actArrival ? 30 : 0,
          notes:       "",
          checklist:   {},
        };
      });

      setImportRows(parsed);
      setImportDialogOpen(true);
    } catch (err) {
      showToast(`⚠️ 解析失敗：${err instanceof Error ? err.message : String(err)}`, 8000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast, machineModels, customerRegionMap]);

  const confirmImport = useCallback(async () => {
    if (!importRows.length) return;
    setImportSaving(true);
    let ok = 0;
    let fail = 0;
    for (const row of importRows) {
      try {
        const { _rowNum: _r, _warn: _w, ...data } = row;
        await createInstallation(data);
        ok++;
      } catch {
        fail++;
      }
    }
    setImportSaving(false);
    setImportDialogOpen(false);
    setImportRows([]);
    showToast(fail > 0 ? `✅ 成功匯入 ${ok} 筆，失敗 ${fail} 筆` : `✅ 成功匯入 ${ok} 筆裝機案`);
  }, [importRows, showToast]);

  const openAddInstall = useCallback(() => {
    setInstallEditId(null);
    setInstallForm({
      name: "",
      modelCode: "FlexTRAK-S",
      region: "north",
      customer: "",
      phase: "ordered",
      engineer: "",
      custContact: "",
      custPhone: "",
      orderDate: "",
      estArrival: "",
      actArrival: "",
      estComplete: "",
      actComplete: "",
      notes: "",
      progress: 0,
    });
    setInstallModal(true);
  }, []);

  const openEditInstall = useCallback((r: Installation) => {
    setInstallEditId(r.id);
    setInstallForm({ ...r });
    setInstallModal(true);
  }, []);

  const saveInstall = useCallback(async () => {
    try {
      const installPhases = ["installing", "hookup", "trial", "qual", "released"];
      const isInstalling  = installPhases.includes(installForm.phase);
      const errors: string[] = [];
      if (!installForm.name?.trim())              errors.push("案件名稱");
      if (!installForm.customer)                  errors.push("客戶");
      if (!installForm.modelCode)                 errors.push("機型");
      if (isInstalling && !installForm.engineer)  errors.push("工程師（安裝中以後必填）");
      if (errors.length > 0) {
        showToast(`⚠️ 請填寫：${errors.join("、")}`);
        return;
      }
      const result = installationSchema.safeParse(installForm);
      if (!result.success) {
        const fieldLabels: Record<string, string> = {
          name: "案件名稱", customer: "客戶", engineer: "工程師",
          region: "地區", phase: "階段", modelCode: "機型",
          estComplete: "預計完工日期", progress: "施工進度",
        };
        const msgs = result.error.errors.map(e => {
          const field = e.path[0] as string;
          return fieldLabels[field] ? `${fieldLabels[field]}：${e.message}` : e.message;
        });
        showToast(`⚠️ 格式錯誤：${msgs.join("；")}`);
        return;
      }
      setInstallSaving(true);
      const parsed = result.data;
      if (installEditId) {
        await updateInstallation(installEditId, parsed);
        writeAuditLog("UPDATE_INSTALLATION", "Installation", parsed.name, user?.email || "");
        showToast("已更新");
      } else {
        await createInstallation(parsed);
        writeAuditLog("CREATE_INSTALLATION", "", parsed.name, user?.email || "");
        showToast("已新增");
      }
      trackEvent("install_saved", { id: installEditId || "new" });
      setInstallModal(false);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "儲存失敗");
    } finally {
      setInstallSaving(false);
    }
  }, [installForm, installEditId, user?.email, showToast]);

  const delInstall = useCallback(
    async (r: Installation) => {
      if (!confirm(`確認刪除「${r.name}」？`)) return;
      try {
        await removeInstallation(r.id);
        writeAuditLog("DELETE_INSTALLATION", r.id, r.name, user?.email || "");
        showToast("已刪除");
        trackEvent("install_deleted", { id: r.id });
      } catch (err) {
        console.error(err);
        showToast("刪除失敗");
      }
    },
    [user?.email, showToast]
  );

  const saveVars = useCallback(
    async (patch: Partial<AppVariablesDoc>) => {
      try {
        setSettingsSaving(true);
        await saveAppVariables(patch as AppVariablesDoc);
        showToast("已儲存");
      } catch (err) {
        console.error(err);
        showToast("儲存失敗");
      } finally {
        setSettingsSaving(false);
      }
    },
    [showToast]
  );

  const addEngineer = useCallback(async () => {
    if (!settingEngInput.trim()) return;
    const newList = [...engineers, settingEngInput.trim()];
    await saveVars({ engineers: newList } as Partial<AppVariablesDoc>);
    setSettingEngInput("");
  }, [engineers, settingEngInput, saveVars]);

  const removeEngineer = useCallback(
    async (name: string) => {
      if (!confirm(`確認刪除工程師「${name}」？`)) return;
      const newList = engineers.filter(e => e !== name);
      await saveVars({ engineers: newList } as Partial<AppVariablesDoc>);
    },
    [engineers, saveVars]
  );

  const addCustomer = useCallback(async () => {
    if (!settingCustInput.trim()) return;
    const newList = [...customers, settingCustInput.trim()];
    await saveVars({ customers: newList } as Partial<AppVariablesDoc>);
    setSettingCustInput("");
  }, [customers, settingCustInput, saveVars]);

  const removeCustomer = useCallback(
    async (name: string) => {
      if (!confirm(`確認刪除客戶「${name}」？`)) return;
      const newList = customers.filter(c => c !== name);
      const newMap = { ...customerRegionMap };
      delete newMap[name];
      await saveVars({ customers: newList, customerRegionMap: newMap } as Partial<AppVariablesDoc>);
    },
    [customers, customerRegionMap, saveVars]
  );

  const addMachineModel = useCallback(async () => {
    const code = settingModelCode.trim();
    const displayName = settingModelName.trim();
    if (!code || !displayName) return;
    if ((machineModels as any[]).some((m: any) => m.code === code)) {
      showToast("⚠️ 機型代碼已存在");
      return;
    }
    const newModels = [...(machineModels as any[]), { code, displayName }];
    await saveMachineModels({ version: "1", models: newModels, updatedAt: Date.now(), updatedBy: user?.email || "" });
    setSettingModelCode("");
    setSettingModelName("");
    showToast("機型已新增");
  }, [machineModels, settingModelCode, settingModelName, user?.email, showToast]);

  const removeMachineModel = useCallback(
    async (code: string) => {
      if (!confirm(`確認刪除機型「${code}」？`)) return;
      const newModels = (machineModels as any[]).filter((m: any) => m.code !== code);
      await saveMachineModels({ version: "1", models: newModels, updatedAt: Date.now(), updatedBy: user?.email || "" });
      showToast("機型已刪除");
    },
    [machineModels, user?.email, showToast]
  );

  const setCustomerRegion = useCallback(
    async (cust: string, region: string) => {
      const newMap = { ...customerRegionMap, [cust]: region };
      await saveVars({ customerRegionMap: newMap } as Partial<AppVariablesDoc>);
    },
    [customerRegionMap, saveVars]
  );

  const openAddEq = useCallback(() => {
    setEqEditId(null);
    setEqForm({
      equipmentId: "",
      region: "north",
      customer: "",
      site: "",
      modelCode: "FlexTRAK-S",
      serialNo: "",
      statusMain: "裝機",
      statusSub: "",
      owner: "",
      milestones: {},
      capacity: { utilization: 0, uph: 0, targetUph: 0, level: "綠", trend7d: [0, 0, 0, 0, 0, 0, 0] },
    });
    setEqModal(true);
  }, []);

  const openEditEq = useCallback((r: Equipment) => {
    setEqEditId(r.id);
    // 舊資料的 blocking 可能是 boolean false，需清理為 undefined
    const blocking = r.blocking && typeof r.blocking === "object" ? r.blocking : undefined;
    setEqForm({ ...r, blocking });
    setEqDrawerOpen(false);
    setEqModal(true);
  }, []);

  const saveEq = useCallback(async () => {
    try {
      const eqErrors: string[] = [];
      if (!eqForm.serialNo?.trim()) eqErrors.push("序號");
      if (!eqForm.customer) eqErrors.push("客戶");
      if (eqErrors.length > 0) {
        showToast(`⚠️ 請填寫：${eqErrors.join("、")}`);
        return;
      }
      const safedEqForm = {
        ...eqForm,
        statusSub: eqForm.statusSub || "",
        blocking: eqForm.blocking ?? false,
      } as Omit<Equipment, "id">;
      const parsed = equipmentSchema.parse(safedEqForm as Omit<Equipment, "id">);
      if (eqEditId) {
        await updateEquipment(eqEditId, parsed);
        writeAuditLog("UPDATE_EQUIPMENT", eqEditId, parsed.equipmentId || "", user?.email || "");
        showToast("已更新");
      } else {
        await createEquipment(parsed as any);
        writeAuditLog("CREATE_EQUIPMENT", "", parsed.equipmentId || "", user?.email || "");
        showToast("已新增");
      }
      setEqModal(false);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "儲存失敗");
    }
  }, [eqForm, eqEditId, user?.email, showToast]);

  const delEq = useCallback(
    async (r: Equipment) => {
      if (!confirm(`確認刪除「${r.equipmentId || r.id}」？`)) return;
      try {
        await removeEquipment(r.id);
        writeAuditLog("DELETE_EQUIPMENT", r.id, r.equipmentId || "", user?.email || "");
        showToast("已刪除");
      } catch (err) {
        console.error(err);
        showToast("刪除失敗");
      }
    },
    [user?.email, showToast]
  );

  return (
    <RequireAuth>
      <div
        style={{
          height: "100vh",
          overflow: "hidden",
          background: C.bg,
          color: C.text1,
          display: "flex",
          flexDirection: "column",
          fontFamily: "inherit",
          fontSize: 14,
        }}
      >
        {/* HEADER */}
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {/* Row 1: Logo + Clock + User */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>⚡</div>
            <h1 style={{ margin: 0, color: C.text1, fontSize: 18, fontWeight: 700, flex: 1 }}>PREMTEK 裝機戰情室</h1>
            <div style={{ fontSize: 13, color: C.text2, fontWeight: 500 }}>{clock}</div>
            <div style={{ fontSize: 13, color: C.text2 }}>{user?.email || "—"}</div>
            <button
              onClick={signOutNow}
              style={{
                background: C.dangerDim,
                border: `1px solid ${C.danger}`,
                color: C.danger,
                padding: "4px 10px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              登出
            </button>
          </div>

          {/* Row 2: KPI Strip */}
          <div style={{ display: "flex", gap: 10, padding: "0 20px 12px", overflowX: "auto" }}>
            {[
              { label: "總裝機案", value: globalStats.total, icon: "📦", color: C.info },
              { label: "進行中", value: globalStats.wip, icon: "⏳", color: C.accent },
              { label: "已量產", value: globalStats.released, icon: "✅", color: C.success },
              {
                label: "SLA逾期",
                value: globalStats.overdue,
                icon: "🚨",
                color: globalStats.overdue > 0 ? C.danger : C.success,
              },
              { label: "7天到期", value: urgentList.length, icon: "⏰", color: urgentList.length > 0 ? C.warning : C.success },
              { label: "平均進度", value: `${globalStats.avgProg}%`, icon: "📊", color: C.accent },
            ].map((kpi, i) => (
              <div
                key={i}
                style={{
                  background: C.panelHigh,
                  border: `1px solid ${C.border}`,
                  borderBottom: `3px solid ${kpi.color}`,
                  padding: "10px 14px",
                  borderRadius: "0 0 4px 4px",
                  flex: 1,
                  minWidth: 140,
                  textAlign: "center",
                  boxShadow: globalStats.overdue > 0 && kpi.label === "SLA逾期" ? `0 0 12px rgba(244,63,94,0.35)` : "none",
                }}
              >
                <div style={{ fontSize: 16, marginBottom: 4 }}>{kpi.icon}</div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* TOAST */}
        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 80,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 9998,
              background: C.panelHigh,
              border: `1px solid ${C.accent}`,
              color: C.accent,
              padding: "12px 20px",
              borderRadius: 4,
              fontWeight: 500,
              boxShadow: `0 4px 12px rgba(129,140,248,0.2)`,
            }}
          >
            {toast}
          </div>
        )}

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {view === "warroom" && (
            <WarroomPanel
              C={C}
              installations={installations}
              overdueList={overdueList}
              urgentList={urgentList}
              auditLogs={auditLogs}
              engineers={engineers}
              globalStats={globalStats}
              alertDismissed={alertDismissed}
              setAlertDismissed={setAlertDismissed}
              setView={setView}
              openAddInstall={openAddInstall}
              openEditInstall={openEditInstall}
            />
          )}
          {view === "installs" && (
            <InstallsPanel
              C={C}
              filteredInstalls={filteredInstalls}
              installations={installations}
              engineers={engineers}
              customers={customers}
              sortCol={sortCol}
              setSortCol={setSortCol}
              sortDir={sortDir}
              setSortDir={setSortDir}
              fRegion={fRegion}
              setFRegion={setFRegion}
              fPhase={fPhase}
              setFPhase={setFPhase}
              fEngineer={fEngineer}
              setFEngineer={setFEngineer}
              fCustomer={fCustomer}
              setFCustomer={setFCustomer}
              keyword={keyword}
              setKeyword={setKeyword}
              installView={installView}
              setInstallView={setInstallView}
              importDragOver={importDragOver}
              setImportDragOver={setImportDragOver}
              processExcelFile={processExcelFile}
              showToast={showToast}
              openAddInstall={openAddInstall}
              openEditInstall={openEditInstall}
              delInstall={delInstall}
            />
          )}
          {view === "equipment" && (
            <EquipmentPanel
              C={C}
              filteredEquipments={filteredEquipments}
              equipStats={equipStats}
              eRegion={eRegion}
              setERegion={setERegion}
              eStatus={eStatus}
              setEStatus={setEStatus}
              eCap={eCap}
              setECap={setECap}
              eKeyword={eKeyword}
              setEKeyword={setEKeyword}
              openAddEq={openAddEq}
              setEqSelected={setEqSelected}
              setEqDrawerOpen={setEqDrawerOpen}
              openEditEq={openEditEq}
              delEq={delEq}
            />
          )}
          {view === "analytics" && (
            <AnalyticsPanel
              C={C}
              globalStats={globalStats}
              urgentList={urgentList}
              installations={installations}
              engineers={engineers}
            />
          )}
          {isAdmin && view === "settings" && (
            <SettingsPanel
              C={C}
              engineers={engineers}
              customers={customers}
              customerRegionMap={customerRegionMap}
              machineModels={machineModels}
              settingEngInput={settingEngInput}
              setSettingEngInput={setSettingEngInput}
              settingCustInput={settingCustInput}
              setSettingCustInput={setSettingCustInput}
              settingModelCode={settingModelCode}
              setSettingModelCode={setSettingModelCode}
              settingModelName={settingModelName}
              setSettingModelName={setSettingModelName}
              addEngineer={addEngineer}
              removeEngineer={removeEngineer}
              addCustomer={addCustomer}
              removeCustomer={removeCustomer}
              addMachineModel={addMachineModel}
              removeMachineModel={removeMachineModel}
              setCustomerRegion={setCustomerRegion}
            />
          )}
          {view === "logs" && (
            <LogsPanel
              C={C}
              visibleLogs={visibleLogs}
              logAutoClearMin={logAutoClearMin}
              setLogAutoClearMin={setLogAutoClearMin}
              setLogsClearedAt={setLogsClearedAt}
            />
          )}
        </div>

        {/* BOTTOM NAV */}
        <div style={{ background: C.panel, borderTop: `1px solid ${C.border}`, display: "flex", padding: "4px 8px", flexShrink: 0, gap: 4 }}>
          {[
            { key: "warroom", label: "⚡戰情室" },
            { key: "installs", label: "📋裝機管理" },
            { key: "equipment", label: "🔩設備狀態" },
            { key: "analytics", label: "📊分析" },
            ...(isAdmin ? [{ key: "settings", label: "⚙️設定" }] : []),
            { key: "logs", label: "📝紀錄" },
          ].map(n => (
            <button
              key={n.key}
              onClick={() => setView(n.key as ViewKey)}
              style={{
                background: view === n.key ? C.accent : "transparent",
                border: `1px solid ${view === n.key ? C.accent : "transparent"}`,
                color: view === n.key ? "#fff" : C.text2,
                padding: "6px 12px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                flex: 1,
                transition: "0.2s",
              }}
            >
              {n.label}
            </button>
          ))}
        </div>

        {/* INSTALL MODAL */}
        {installModal && (
          <InstallModal
            C={C}
            open={installModal}
            onClose={() => setInstallModal(false)}
            installEditId={installEditId}
            installForm={installForm}
            setInstallForm={setInstallForm}
            installSaving={installSaving}
            onSave={saveInstall}
            onDelete={() => delInstall(installations.find(r => r.id === installEditId)!)}
            machineModels={machineModels}
            engineers={engineers}
            formCustomers={formCustomers}
            installations={installations}
          />
        )}

        {/* EXCEL IMPORT PREVIEW MODAL */}
        {importDialogOpen && (
          <ImportDialog
            C={C}
            open={importDialogOpen}
            onClose={() => {
              setImportDialogOpen(false);
              setImportRows([]);
            }}
            importRows={importRows}
            setImportRows={setImportRows}
            onConfirmImport={confirmImport}
            importSaving={importSaving}
          />
        )}

        {/* EQUIPMENT MODAL */}
        {eqModal && (
          <EquipmentModal
            C={C}
            open={eqModal}
            onClose={() => setEqModal(false)}
            eqEditId={eqEditId}
            eqForm={eqForm}
            setEqForm={setEqForm}
            onSave={saveEq}
            onDelete={() => delEq(equipments.find(r => r.id === eqEditId)!)}
            customers={customers}
            customerRegionMap={customerRegionMap}
            machineModels={machineModels}
            equipments={equipments}
          />
        )}

        {/* EQUIPMENT DRAWER */}
        {eqDrawerOpen && eqSelected && (
          <EquipmentDrawer
            C={C}
            open={eqDrawerOpen}
            onClose={() => setEqDrawerOpen(false)}
            equipment={eqSelected}
            onEdit={openEditEq}
          />
        )}
      </div>
    </RequireAuth>
  );
}
