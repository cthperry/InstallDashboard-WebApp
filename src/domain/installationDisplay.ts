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

export function normalizeInstallationSerialCandidate(candidate: unknown, modelCode: unknown): string {
  const serial = trimString(candidate);
  if (!serial) return "";
  if (isModelNamePlaceholder(serial, modelCode)) return "";
  return serial;
}

export function getInstallationSerial(row: Installation): string {
  const legacyAwareRow = row as InstallationWithLegacySerial;
  return normalizeInstallationSerialCandidate(legacyAwareRow.serialNo ?? row.name, row.modelCode);
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
