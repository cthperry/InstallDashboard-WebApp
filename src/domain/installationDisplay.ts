import type { Installation } from "@/domain/types";
import { cleanMachineModelName } from "@/domain/machineModels";
import { normalizeCompactKey, trimString } from "@/lib/utils";

type InstallationWithLegacySerial = Installation & {
  serialNo?: unknown;
};

function isModelNamePlaceholder(candidate: string, modelCode: unknown): boolean {
  const candidateKey = normalizeCompactKey(cleanMachineModelName(candidate));
  const modelKey = normalizeCompactKey(cleanMachineModelName(modelCode));
  if (!candidateKey || !modelKey) return false;
  return candidateKey === modelKey;
}

function extractMarkedSerial(candidate: string): string {
  const match = candidate.match(/[#＃]\s*([A-Za-z0-9][A-Za-z0-9._-]*)\b/);
  return match?.[1]?.trim() ?? "";
}

function stripLeadingSerialMarker(candidate: string): string {
  return candidate.replace(/^[#＃]+\s*/, "").trim();
}

export function normalizeInstallationSerialCandidate(candidate: unknown, modelCode: unknown): string {
  const serial = trimString(candidate).replace(/\s+/g, " ");
  if (!serial) return "";
  const markedSerial = extractMarkedSerial(serial);
  if (markedSerial) return markedSerial;
  const unmarkedSerial = stripLeadingSerialMarker(serial);
  if (isModelNamePlaceholder(unmarkedSerial, modelCode)) return "";
  return unmarkedSerial;
}

export function getInstallationSerial(row: Installation): string {
  const legacyAwareRow = row as InstallationWithLegacySerial;
  return normalizeInstallationSerialCandidate(legacyAwareRow.serialNo ?? row.name, row.modelCode);
}

export function getInstallationSerialKey(row: Installation): string {
  return normalizeCompactKey(getInstallationSerial(row));
}

export function getInstallationModelSerial(row: Installation): string {
  const model = trimString(row.modelCode);
  const serial = getInstallationSerial(row);
  if (model && serial) return `${model} · ${serial}`;
  return model || serial;
}

export function getInstallationTaskTitle(row: Installation): string {
  return getInstallationSerial(row)
    || trimString(row.customer)
    || trimString(row.modelCode)
    || row.id;
}
