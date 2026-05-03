import type { Installation } from "@/domain/types";
import { trimString } from "@/lib/utils";

type InstallationWithLegacySerial = Installation & {
  serialNo?: unknown;
};

export function getInstallationSerial(row: Installation): string {
  const legacyAwareRow = row as InstallationWithLegacySerial;
  return trimString(legacyAwareRow.serialNo ?? row.name);
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
