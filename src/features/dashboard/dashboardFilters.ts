import { EQUIPMENT_MAIN_STATUSES, PHASES } from "@/domain/constants";
import type { CapacityLevel, Equipment, EquipmentMainStatus, Installation, PhaseKey, RegionKey } from "@/domain/types";
import { getLiveUtilization } from "@/domain/capacity";
import { toDisplayShortName } from "@/domain/personDisplay";

export type InstallSortKey = "updatedAt" | "estComplete" | "phase" | "customer" | "engineer" | "name";
export type EquipSortKey = "updatedAt" | "utilization" | "customer" | "owner" | "serialNo" | "statusMain";

export type InstallFilterState = {
  region: "" | RegionKey;
  model: string;
  phase: "" | PhaseKey;
  customer: string;
  engineer: string;
  keyword: string;
  sortKey: InstallSortKey;
  sortDir: "asc" | "desc";
};

export type EquipmentFilterState = {
  region: "" | RegionKey;
  status: "" | EquipmentMainStatus;
  capacity: "" | CapacityLevel;
  keyword: string;
  sortKey: EquipSortKey;
  sortDir: "asc" | "desc";
};

type LegacyEquipment = Equipment & {
  name?: unknown;
};

const PHASE_ORDER = new Map(PHASES.map((phase, index) => [phase.key, index] as const));
const EQUIPMENT_STATUS_ORDER = new Map(EQUIPMENT_MAIN_STATUSES.map((status, index) => [status, index] as const));

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  return String(v);
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

export function getEquipmentSerialLabel(row: Equipment): string {
  const legacy = row as LegacyEquipment;
  return safeStr(row.serialNo || legacy.name);
}

function matchesKeyword(value: unknown, keyword: string): boolean {
  return safeStr(value).toLowerCase().includes(keyword);
}

function matchesInstallationKeyword(row: Installation, keyword: string): boolean {
  return matchesKeyword(row.name, keyword)
    || matchesKeyword(row.customer, keyword)
    || matchesKeyword(toDisplayShortName(row.engineer), keyword)
    || matchesKeyword(row.notes, keyword)
    || matchesKeyword(row.custContact, keyword)
    || matchesKeyword(row.modelCode, keyword)
    || matchesKeyword(row.phase, keyword);
}

function matchesEquipmentKeyword(row: Equipment, keyword: string): boolean {
  return matchesKeyword(row.equipmentId, keyword)
    || matchesKeyword(row.customer, keyword)
    || matchesKeyword(row.site, keyword)
    || matchesKeyword(row.modelCode, keyword)
    || matchesKeyword(getEquipmentSerialLabel(row), keyword)
    || matchesKeyword(row.statusMain, keyword)
    || matchesKeyword(row.statusSub, keyword)
    || matchesKeyword(row.owner, keyword)
    || matchesKeyword(row.blocking?.reasonCode, keyword)
    || matchesKeyword(row.blocking?.detail, keyword)
    || matchesKeyword(row.blocking?.status, keyword)
    || matchesKeyword(row.blocking?.resolutionNote, keyword);
}

export function filterAndSortInstallations(rows: Installation[], filters: InstallFilterState): Installation[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (filters.region && row.region !== filters.region) return false;
    if (filters.model && row.modelCode !== filters.model) return false;
    if (filters.phase && row.phase !== filters.phase) return false;
    if (filters.customer && row.customer !== filters.customer) return false;
    if (filters.engineer && toDisplayShortName(row.engineer) !== filters.engineer) return false;
    if (keyword && !matchesInstallationKeyword(row, keyword)) return false;
    return true;
  });

  const direction = filters.sortDir === "asc" ? 1 : -1;

  return filtered.sort((a, b) => {
    let result = 0;
    switch (filters.sortKey) {
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
        result = (PHASE_ORDER.get(a.phase) ?? 999) - (PHASE_ORDER.get(b.phase) ?? 999);
        break;
      case "estComplete":
        result = compareYmd(a.estComplete, b.estComplete);
        break;
      case "updatedAt":
      default:
        result = compareTimestamp(a.updatedAt, b.updatedAt);
        break;
    }

    if (result === 0) result = compareTimestamp(a.updatedAt, b.updatedAt);
    if (result === 0) result = compareText(a.name, b.name);
    return result * direction;
  });
}

export function filterAndSortEquipments(rows: Equipment[], filters: EquipmentFilterState): Equipment[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (filters.region && row.region !== filters.region) return false;
    if (filters.status && row.statusMain !== filters.status) return false;
    if (filters.capacity && row.capacity.level !== filters.capacity) return false;
    if (keyword && !matchesEquipmentKeyword(row, keyword)) return false;
    return true;
  });

  const direction = filters.sortDir === "asc" ? 1 : -1;

  return filtered.sort((a, b) => {
    let result = 0;
    switch (filters.sortKey) {
      case "customer":
        result = compareText(a.customer, b.customer);
        break;
      case "owner":
        result = compareText(toDisplayShortName(a.owner), toDisplayShortName(b.owner));
        break;
      case "serialNo":
        result = compareText(getEquipmentSerialLabel(a), getEquipmentSerialLabel(b));
        break;
      case "statusMain":
        result = (EQUIPMENT_STATUS_ORDER.get(a.statusMain) ?? 999) - (EQUIPMENT_STATUS_ORDER.get(b.statusMain) ?? 999);
        break;
      case "utilization":
        result = getLiveUtilization(a.capacity) - getLiveUtilization(b.capacity);
        break;
      case "updatedAt":
      default:
        result = compareTimestamp(a.updatedAt, b.updatedAt);
        break;
    }

    if (result === 0) result = compareTimestamp(a.updatedAt, b.updatedAt);
    if (result === 0) result = compareText(a.equipmentId, b.equipmentId);
    return result * direction;
  });
}
