import type { Equipment, EquipmentBlockingStatus } from "@/domain/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const EQUIPMENT_BLOCKING_STATUS_LABEL: Record<EquipmentBlockingStatus, string> = {
  open: "OPEN",
  resolved: "RESOLVED",
  reopened: "REOPENED",
};

export const EQUIPMENT_BLOCKING_STATUS_COLOR: Record<EquipmentBlockingStatus, string> = {
  open: "#ef4444",
  resolved: "#10b981",
  reopened: "#f59e0b",
};

export function normalizeEquipmentBlockingStatus(status: unknown): EquipmentBlockingStatus {
  if (status === "resolved" || status === "reopened") return status;
  return "open";
}

export function isActiveEquipmentBlocking(blocking?: Equipment["blocking"] | null): blocking is NonNullable<Equipment["blocking"]> {
  if (!blocking?.reasonCode) return false;
  return normalizeEquipmentBlockingStatus(blocking.status) !== "resolved";
}

export function getEquipmentBlockingAgeDays(blocking?: Equipment["blocking"] | null, now: number = Date.now()): number | null {
  if (!blocking?.openedAt) return null;
  const end = blocking.resolvedAt && normalizeEquipmentBlockingStatus(blocking.status) === "resolved" ? blocking.resolvedAt : now;
  return Math.max(0, Math.floor((end - blocking.openedAt) / DAY_MS));
}

export function mergeEquipmentBlockingLifecycle(
  previous: Equipment["blocking"] | undefined,
  next: Equipment["blocking"] | null,
  now: number = Date.now(),
): Equipment["blocking"] | null {
  if (!next?.reasonCode) return null;

  const previousStatus = previous?.reasonCode ? normalizeEquipmentBlockingStatus(previous.status) : null;
  const requestedStatus = normalizeEquipmentBlockingStatus(next.status);
  const isReopen = previousStatus === "resolved" && requestedStatus !== "resolved";
  const status: EquipmentBlockingStatus = isReopen ? "reopened" : requestedStatus;
  const openedAt = previous?.openedAt ?? now;
  const reopenCount = (previous?.reopenCount ?? 0) + (isReopen ? 1 : 0);

  return {
    reasonCode: next.reasonCode,
    detail: next.detail,
    owner: next.owner,
    ...(next.eta ? { eta: next.eta } : {}),
    status,
    openedAt,
    ...(status === "resolved" ? { resolvedAt: previous?.resolvedAt ?? now } : {}),
    ...(status === "reopened" ? { reopenedAt: now } : previous?.reopenedAt ? { reopenedAt: previous.reopenedAt } : {}),
    ...(reopenCount > 0 ? { reopenCount } : {}),
    ...(next.resolutionNote ? { resolutionNote: next.resolutionNote } : previous?.resolutionNote ? { resolutionNote: previous.resolutionNote } : {}),
  };
}
