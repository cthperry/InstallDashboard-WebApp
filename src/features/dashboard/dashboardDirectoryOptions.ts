import type { AppVariablesDoc, Equipment, Installation, RegionKey } from "@/domain/types";
import { DEFAULT_CUSTOMERS } from "@/domain/constants";
import { buildOwnerListFromUserEmails, normalizePersonKey, toDisplayShortName } from "@/domain/personDisplay";

type UserEmailRow = {
  email: string;
};

type CustomerConfigEntry = string | {
  name?: unknown;
  region?: unknown;
};

export type DashboardDirectoryOptions = {
  ownerList: string[];
  engineers: string[];
  customers: string[];
  customerRegionMap: Record<string, RegionKey>;
};

function compareZh(a: string, b: string) {
  return a.localeCompare(b, "zh-Hant");
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function addCustomerName(set: Set<string>, value: unknown) {
  const name = toTrimmedString(value);
  if (name) set.add(name);
}

function isRegionKey(value: unknown): value is RegionKey {
  return value === "north" || value === "central" || value === "south";
}

function addEngineer(seen: Set<string>, output: string[], value: unknown) {
  const key = normalizePersonKey(value);
  const display = toDisplayShortName(value);
  if (!key || !display || seen.has(key)) return;
  seen.add(key);
  output.push(display);
}

function finalizeCustomers(set: Set<string>): string[] {
  return Array.from(set).sort(compareZh);
}

export function buildDashboardDirectoryOptions({
  managedUsers,
  appVars,
  installations,
  equipments,
}: {
  managedUsers: UserEmailRow[];
  appVars: AppVariablesDoc | null | undefined;
  installations: Installation[];
  equipments: Equipment[];
}): DashboardDirectoryOptions {
  const ownerEmails: string[] = [];
  for (const user of managedUsers) ownerEmails.push(user.email);

  const ownerList = buildOwnerListFromUserEmails(ownerEmails);
  const cfgCustomers = (appVars?.customers ?? []) as CustomerConfigEntry[];
  const customerRegionMap: Record<string, RegionKey> = {};
  const configuredCustomerSet = new Set<string>();

  for (const customer of cfgCustomers) {
    if (typeof customer === "string") {
      addCustomerName(configuredCustomerSet, customer);
      continue;
    }

    if (!customer || typeof customer !== "object") continue;
    const name = toTrimmedString(customer.name);
    if (!name) continue;

    configuredCustomerSet.add(name);
    if (isRegionKey(customer.region)) customerRegionMap[name] = customer.region;
  }

  const engineerSeen = new Set<string>();
  const engineerCandidates: string[] = [];
  const needsEngineerRows = ownerList.length === 0;
  const dataCustomerSet = configuredCustomerSet.size > 0 ? null : new Set<string>();

  if (needsEngineerRows) {
    for (const engineer of appVars?.engineers ?? []) addEngineer(engineerSeen, engineerCandidates, engineer);
  }

  if (needsEngineerRows || dataCustomerSet) {
    for (const row of installations) {
      if (needsEngineerRows) addEngineer(engineerSeen, engineerCandidates, row.engineer);
      if (dataCustomerSet) addCustomerName(dataCustomerSet, row.customer);
    }

    for (const row of equipments) {
      if (needsEngineerRows) addEngineer(engineerSeen, engineerCandidates, row.owner);
      if (dataCustomerSet) addCustomerName(dataCustomerSet, row.customer);
    }
  }

  let customers = finalizeCustomers(configuredCustomerSet);
  if (customers.length === 0 && dataCustomerSet) customers = finalizeCustomers(dataCustomerSet);
  if (customers.length === 0) customers = finalizeCustomers(new Set(DEFAULT_CUSTOMERS));

  return {
    ownerList,
    engineers: ownerList.length > 0 ? ownerList : engineerCandidates.sort(compareZh),
    customers,
    customerRegionMap,
  };
}
