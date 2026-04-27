import type { Equipment } from "@/domain/types";

type EquipmentCapacity = Equipment["capacity"];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateUtilization(uph: unknown, targetUph: unknown): number {
  const liveUph = toFiniteNumber(uph);
  const liveTarget = toFiniteNumber(targetUph);
  if (liveUph <= 0 || liveTarget <= 0) return 0;
  return clamp(Math.round((liveUph / liveTarget) * 100), 0, 100);
}

export function getLiveUtilization(capacity: Partial<EquipmentCapacity> | null | undefined): number {
  if (!capacity) return 0;
  const calculated = calculateUtilization(capacity.uph, capacity.targetUph);
  if (calculated > 0) return calculated;
  return clamp(toFiniteNumber(capacity.utilization), 0, 100);
}


export function buildCapacitySnapshot(capacity: Partial<EquipmentCapacity> | null | undefined) {
  const liveUph = toFiniteNumber(capacity?.uph);
  const liveTarget = toFiniteNumber(capacity?.targetUph);
  const utilization = getLiveUtilization(capacity);
  return { uph: liveUph, targetUph: liveTarget, utilization };
}

export function formatUphValue(value: unknown): string {
  const num = toFiniteNumber(value);
  if (!Number.isFinite(num) || num === 0) return "0";

  const abs = Math.abs(num);
  if (abs >= 1000) {
    const compact = Math.round((num / 1000) * 10) / 10;
    return `${compact.toFixed(1)}K`;
  }

  if (Math.abs(num % 1) < 1e-9) return num.toLocaleString();
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export function formatUphPlainValue(value: unknown): string {
  const num = toFiniteNumber(value);
  if (!Number.isFinite(num)) return "0";
  if (Math.abs(num % 1) < 1e-9) return num.toLocaleString();
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
