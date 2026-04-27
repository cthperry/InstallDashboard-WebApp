import type { Installation, MachineModel, PhaseKey } from "@/domain/types";
import {
  didInstallationEnterReleased,
  doesInstallationPhaseRequireSerial,
  isReleasedPhase,
  resolveInstallationPhase,
  resolveInstallationProgress,
  shouldTransferInstallationToEquipment,
  type InstallationPhaseInput,
} from "@/domain/installPhase";
import { normalizeInstallationDraft, type InstallationDraft } from "@/domain/installationContract";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function getInstallationProgressByPhase(phase: PhaseKey): number {
  return resolveInstallationProgress(phase);
}

export function resolveInstallationLifecycle(input: InstallationPhaseInput, now?: Date): {
  phase: PhaseKey;
  progress: number;
} {
  const phase = resolveInstallationPhase(input, now);
  return {
    phase,
    progress: resolveInstallationProgress(phase),
  };
}

export function normalizeInstallationForSave(
  input: InstallationDraft,
  machineModels: readonly MachineModel[] = [],
): InstallationDraft {
  const normalized = normalizeInstallationDraft(input, machineModels);
  const safePhase = normalized.phase;
  const safeProgress = Number.isFinite(normalized.progress)
    ? clamp(Number(normalized.progress), 0, 100)
    : resolveInstallationProgress(safePhase);

  return {
    ...normalized,
    progress: safeProgress,
  };
}

export {
  didInstallationEnterReleased,
  doesInstallationPhaseRequireSerial,
  isReleasedPhase,
  shouldTransferInstallationToEquipment,
};
