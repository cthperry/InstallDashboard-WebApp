import { DEFAULT_MACHINE_MODELS } from "@/domain/constants";
import type { MachineModel } from "@/domain/types";
import { normalizeCompactKey, trimString } from "@/lib/utils";

export function cleanMachineModelName(raw: unknown): string {
  return trimString(raw)
    .replace(/[‐‑‒–—−﹣－]/g, "-")
    .replace(/^march\s+/i, "")
    .replace(/\s*plasma\s*system\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function modelKey(value: unknown): string {
  return normalizeCompactKey(cleanMachineModelName(value));
}

export function canonicalizeMachineModelCode(
  raw: unknown,
  models: readonly MachineModel[] = DEFAULT_MACHINE_MODELS,
): string {
  const cleaned = cleanMachineModelName(raw);
  if (!cleaned) return "";

  const targetKey = modelKey(cleaned);
  const match = models.find((item) => {
    return modelKey(item.code) === targetKey || modelKey(item.displayName) === targetKey;
  });

  return match?.code ?? cleaned;
}

export function mergeMachineModels(
  remoteModels?: readonly MachineModel[] | null,
  baseModels: readonly MachineModel[] = DEFAULT_MACHINE_MODELS,
): MachineModel[] {
  const merged: MachineModel[] = [];
  const seen = new Set<string>();

  for (const item of [...(remoteModels ?? []), ...baseModels]) {
    const code = canonicalizeMachineModelCode(item?.code, [...(remoteModels ?? []), ...baseModels]);
    const displayName = trimString(item?.displayName) || code;
    if (!code) continue;
    const key = modelKey(code);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ code, displayName });
  }

  return merged.length > 0 ? merged : [...baseModels];
}

export function hasMachineModelCode(
  code: unknown,
  models: readonly MachineModel[],
): boolean {
  const canonical = canonicalizeMachineModelCode(code, models);
  if (!canonical) return false;
  const key = modelKey(canonical);
  return models.some((item) => modelKey(item.code) === key);
}

export function resolveMachineModelDisplayLabel(code: unknown, models: readonly MachineModel[]): string {
  const canonical = canonicalizeMachineModelCode(code, models);
  if (!canonical) return "";
  const match = models.find((item) => item.code === canonical);
  return trimString(match?.displayName) || canonical;
}
