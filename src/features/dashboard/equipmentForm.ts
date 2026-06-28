import { EQUIPMENT_SUB_STATUS_OPTIONS } from "@/domain/constants";
import type { CapacityLevel, Equipment, EquipmentMainStatus, RegionKey } from "@/domain/types";
import { buildCapacitySnapshot, calculateUtilization } from "@/domain/capacity";
import { toDisplayShortName } from "@/domain/personDisplay";
import { getEquipmentSerialLabel } from "@/features/dashboard/dashboardFilters";
import { calcCapacityLevel } from "@/features/dashboard/dashboardStats";
import { clamp } from "@/features/dashboard/dashboardViewUtils";

export type EquipmentProductDraft = {
  name: string;
  dailyCap: number | string;
};

export type EquipmentFormDraft = {
  equipmentId: string;
  region: RegionKey;
  customer: string;
  site: string;
  modelCode: string;
  serialNo: string;
  statusMain: EquipmentMainStatus;
  statusSub: string;
  owner: string;
  milestones: Required<Equipment["milestones"]>;
  hasBlocking: boolean;
  blocking: {
    reasonCode: string;
    detail: string;
    owner: string;
    eta: string;
  };
  capacity: {
    utilization: number;
    uph: number | string;
    targetUph: number | string;
    level: CapacityLevel;
    trend7dCsv: string;
  };
  products: EquipmentProductDraft[];
};

export function getEquipmentDefaultFormDraft(defaultModelCode = "FlexTRAK-S"): EquipmentFormDraft {
  return {
    equipmentId: "",
    region: "north",
    customer: "",
    site: "",
    modelCode: defaultModelCode,
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
      reachTargetDate: "",
    },
    hasBlocking: false,
    blocking: {
      reasonCode: "",
      detail: "",
      owner: "",
      eta: "",
    },
    capacity: {
      utilization: 0,
      uph: 0,
      targetUph: 0,
      level: "綠",
      trend7dCsv: "",
    },
    products: [],
  };
}

export function normalizeEquipmentRegionKey(raw: string | undefined): RegionKey {
  if (raw === "north" || raw === "central" || raw === "south") return raw;
  if (raw === "北區") return "north";
  if (raw === "中區") return "central";
  return "south";
}

export function defaultEquipSubStatus(statusMain: EquipmentMainStatus): string {
  return EQUIPMENT_SUB_STATUS_OPTIONS[statusMain]?.[0] ?? "";
}

export function buildEquipmentFormDraftFromEquipment(row: Equipment): EquipmentFormDraft {
  const snapshot = buildCapacitySnapshot(row.capacity);
  return {
    equipmentId: row.equipmentId ?? "",
    region: normalizeEquipmentRegionKey(row.region),
    customer: row.customer ?? "",
    site: row.site ?? "",
    modelCode: row.modelCode ?? "",
    serialNo: getEquipmentSerialLabel(row),
    statusMain: row.statusMain ?? "裝機",
    statusSub: row.statusSub ?? "",
    owner: toDisplayShortName(row.owner) || "",
    milestones: {
      installStart: row.milestones?.installStart ?? "",
      installDone: row.milestones?.installDone ?? "",
      trialStart: row.milestones?.trialStart ?? "",
      trialPass: row.milestones?.trialPass ?? "",
      prodStart: row.milestones?.prodStart ?? "",
      reachTargetDate: row.milestones?.reachTargetDate ?? "",
    },
    hasBlocking: Boolean(row.blocking?.reasonCode),
    blocking: {
      reasonCode: row.blocking?.reasonCode ?? "",
      detail: row.blocking?.detail ?? "",
      owner: row.blocking?.owner ?? "",
      eta: row.blocking?.eta ?? "",
    },
    capacity: {
      utilization: snapshot.utilization,
      uph: String(snapshot.uph),
      targetUph: String(snapshot.targetUph),
      level: calcCapacityLevel(snapshot.uph, snapshot.targetUph),
      trend7dCsv: (row.capacity?.trend7d ?? []).join(","),
    },
    products: (row.products ?? []).map((product) => ({
      name: product.name,
      dailyCap: product.dailyCap,
    })),
  };
}

export function parseTrend7d(csv: string, fallback: number): number[] {
  const parts = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s));
  const vals = parts.filter((n) => Number.isFinite(n)).map((n) => clamp(n, 0, 100));
  if (vals.length === 7) return vals;
  const base = clamp(fallback, 0, 100);
  return Array.from({ length: 7 }, (_, i) => Math.round(clamp(base + (i - 3) * 1.5, 0, 100)));
}

export function updateEquipmentCapacityDraft(
  capacity: EquipmentFormDraft["capacity"],
  patch: Partial<Pick<EquipmentFormDraft["capacity"], "uph" | "targetUph">>,
): EquipmentFormDraft["capacity"] {
  const next = { ...capacity, ...patch };
  const uph = parseFloat(String(next.uph)) || 0;
  const targetUph = parseFloat(String(next.targetUph)) || 0;
  return {
    ...next,
    utilization: calculateUtilization(uph, targetUph),
    level: calcCapacityLevel(uph, targetUph),
  };
}

export function buildEquipmentPayloadFromDraft(draft: EquipmentFormDraft): Omit<Equipment, "id"> {
  const uph = Number(draft.capacity.uph);
  const targetUph = Number(draft.capacity.targetUph);
  const utilization = calculateUtilization(uph, targetUph);

  return {
    equipmentId: draft.equipmentId,
    region: draft.region,
    customer: draft.customer,
    site: draft.site,
    modelCode: draft.modelCode,
    serialNo: draft.serialNo,
    statusMain: draft.statusMain,
    statusSub: draft.statusSub ?? "",
    owner: toDisplayShortName(draft.owner),
    milestones: draft.milestones,
    blocking: draft.hasBlocking
      ? {
          reasonCode: draft.blocking.reasonCode,
          detail: draft.blocking.detail,
          owner: draft.blocking.owner,
          eta: draft.blocking.eta || undefined,
        }
      : undefined,
    capacity: {
      utilization,
      uph,
      targetUph,
      level: calcCapacityLevel(uph, targetUph),
      trend7d: parseTrend7d(draft.capacity.trend7dCsv ?? "", utilization),
    },
    products: (draft.products ?? [])
      .filter((product) => product.name.trim())
      .map((product) => ({
        name: product.name.trim(),
        dailyCap: Number(product.dailyCap) || 0,
      })),
  };
}

export function buildSafeEquipmentMilestones(milestones: Equipment["milestones"]): Required<Equipment["milestones"]> {
  return {
    installStart: milestones?.installStart ?? "",
    installDone: milestones?.installDone ?? "",
    trialStart: milestones?.trialStart ?? "",
    trialPass: milestones?.trialPass ?? "",
    prodStart: milestones?.prodStart ?? "",
    reachTargetDate: milestones?.reachTargetDate ?? "",
  };
}

export function buildSafeEquipmentBlocking(blocking: Equipment["blocking"]): Equipment["blocking"] | null {
  return blocking
    ? {
        reasonCode: blocking.reasonCode ?? "",
        detail: blocking.detail ?? "",
        owner: blocking.owner ?? "",
        eta: blocking.eta ?? "",
      }
    : null;
}
