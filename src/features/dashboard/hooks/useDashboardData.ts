import { useEffect, useState } from "react";

import type { AppVariablesDoc, Equipment, Installation, MachineModel, RetentionSettingsDoc } from "@/domain/types";
import { DEFAULT_MACHINE_MODELS } from "@/domain/constants";
import { mergeMachineModels } from "@/domain/machineModels";
import { listenInstallations } from "@/features/data/installations";
import { listenEquipments } from "@/features/data/equipments";
import { listenUsers, type ManagedUser } from "@/features/data/users";
import { listenAppVariables, listenMachineModels, listenRetentionSettings } from "@/features/data/settings";
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
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [installErr, setInstallErr] = useState<string>("");
  const [equipments, setEquipments] = useState<Equipment[]>([]);
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

    return () => {
      unsubVars?.();
      unsubModels?.();
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
      setInstallErr("");
      return;
    }
    const unsubInst = listenInstallations(
      (rows) => setInstallations(rows),
      (e) => setInstallErr(safeStr(e)),
    );
    return () => unsubInst?.();
  }, [section, insightsTab]);

  useEffect(() => {
    if (section === "install" || (section === "insights" && insightsTab === "logs")) {
      setEquipments([]);
      setEquipErr("");
      return;
    }
    const unsubEq = listenEquipments(
      (rows) => setEquipments(rows),
      (e) => setEquipErr(safeStr(e)),
    );
    return () => unsubEq?.();
  }, [section, insightsTab]);

  useEffect(() => {
    if (!(isAdmin && section === "insights")) {
      setRetention(null);
      return;
    }
    const unsubRetention = listenRetentionSettings((doc) => setRetention(doc));
    return () => unsubRetention?.();
  }, [isAdmin, section]);

  useEffect(() => {
    if (section !== "insights") {
      setAuditLogs([]);
      return;
    }
    const unsubAudit = listenAuditLogs((rows) => setAuditLogs(rows));
    return () => unsubAudit?.();
  }, [section]);

  useEffect(() => {
    if (!(isAdmin && section === "insights")) {
      setEvents([]);
      return;
    }
    const unsubEvents = listenEventsLastDays(7, (rows) => setEvents(rows));
    return () => unsubEvents?.();
  }, [isAdmin, section]);

  return {
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
  };
}
