import { useEffect, useState } from "react";

import type { AppVariablesDoc, Equipment, ImportConfigDoc, Installation, MachineModel, RetentionSettingsDoc } from "@/domain/types";
import { DEFAULT_MACHINE_MODELS } from "@/domain/constants";
import { mergeMachineModels } from "@/domain/machineModels";
import { listenInstallations } from "@/features/data/installations";
import { listenEquipments } from "@/features/data/equipments";
import { listenUsers, type ManagedUser } from "@/features/data/users";
import { listenAppVariables, listenImportConfig, listenMachineModels, listenRetentionSettings } from "@/features/data/settings";
import { listenAuditLogs, listenEventsLastDays, type AuditLogRow, type EventRow } from "@/features/data/logs";

type DashboardSection = "install" | "equipment" | "insights";
type InsightsTab = "analytics" | "logs";

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
}

export function useDashboardData({
  isAdmin,
  section,
  insightsTab,
}: {
  isAdmin: boolean;
  section: DashboardSection;
  insightsTab?: InsightsTab;
}) {
  const [machineModels, setMachineModels] = useState<MachineModel[]>([...DEFAULT_MACHINE_MODELS]);
  const [appVars, setAppVars] = useState<AppVariablesDoc | null>(null);
  const [retention, setRetention] = useState<RetentionSettingsDoc | null>(null);
  const [importConfig, setImportConfig] = useState<ImportConfigDoc | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [installLoading, setInstallLoading] = useState(false);
  const [installErr, setInstallErr] = useState<string>("");
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [equipLoading, setEquipLoading] = useState(false);
  const [equipErr, setEquipErr] = useState<string>("");
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    const unsubVars = listenAppVariables((doc) => {
      setAppVars(doc);
    });

    const unsubModels = listenMachineModels((doc) => {
      setMachineModels(mergeMachineModels(doc?.models, DEFAULT_MACHINE_MODELS));
    });

    const unsubImportConfig = listenImportConfig((doc) => {
      setImportConfig(doc);
    });

    return () => {
      unsubVars?.();
      unsubModels?.();
      unsubImportConfig?.();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setManagedUsers([]);
      return;
    }
    const unsubUsers = listenUsers(setManagedUsers);
    return () => unsubUsers?.();
  }, [isAdmin]);

  useEffect(() => {
    if (section === "equipment" || (section === "insights" && insightsTab === "logs")) {
      setInstallations([]);
      setInstallLoading(false);
      setInstallErr("");
      return;
    }
    setInstallLoading(true);
    setInstallErr("");
    const unsubInst = listenInstallations(
      (rows) => {
        setInstallations(rows);
        setInstallLoading(false);
        setInstallErr("");
      },
      (e) => {
        setInstallErr(safeStr(e));
        setInstallLoading(false);
      },
    );
    return () => unsubInst?.();
  }, [section, insightsTab]);

  useEffect(() => {
    if (section === "install" || (section === "insights" && insightsTab === "logs")) {
      setEquipments([]);
      setEquipLoading(false);
      setEquipErr("");
      return;
    }
    setEquipLoading(true);
    setEquipErr("");
    const unsubEq = listenEquipments(
      (rows) => {
        setEquipments(rows);
        setEquipLoading(false);
        setEquipErr("");
      },
      (e) => {
        setEquipErr(safeStr(e));
        setEquipLoading(false);
      },
    );
    return () => unsubEq?.();
  }, [section, insightsTab]);

  useEffect(() => {
    if (!(isAdmin && section === "insights" && insightsTab === "logs")) {
      setRetention(null);
      return;
    }
    const unsubRetention = listenRetentionSettings((doc) => setRetention(doc));
    return () => unsubRetention?.();
  }, [isAdmin, section, insightsTab]);

  useEffect(() => {
    if (!(isAdmin && section === "insights" && insightsTab === "logs")) {
      setAuditLogs([]);
      return;
    }
    const unsubAudit = listenAuditLogs((rows) => setAuditLogs(rows));
    return () => unsubAudit?.();
  }, [isAdmin, section, insightsTab]);

  useEffect(() => {
    if (!(isAdmin && section === "insights" && insightsTab === "logs")) {
      setEvents([]);
      return;
    }
    const unsubEvents = listenEventsLastDays(7, (rows) => setEvents(rows));
    return () => unsubEvents?.();
  }, [isAdmin, section, insightsTab]);

  return {
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
  };
}
