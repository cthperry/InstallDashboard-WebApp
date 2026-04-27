import { PHASES } from "@/domain/constants";
import type { Installation, PhaseKey } from "@/domain/types";
import { trimString } from "@/lib/utils";

export type InstallationPhaseInput = {
  estArrival?: string;
  estComplete?: string;
  actArrival?: string;
  actComplete?: string;
};

export const PHASES_REQUIRE_SERIAL: ReadonlySet<PhaseKey> = new Set<PhaseKey>([
  "shipping",
  "arrived",
  "installing",
  "trial",
  "qual",
  "released",
]);

export function formatLocalYmd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmd(value?: string): Date | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

export function daysUntilYmd(targetYmd?: string, now: Date = new Date()): number | null {
  const target = parseYmd(targetYmd);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / 86_400_000);
}

export function doesInstallationPhaseRequireSerial(phase?: string | null): boolean {
  return phase != null && PHASES_REQUIRE_SERIAL.has(phase as PhaseKey);
}

export function isReleasedPhase(phase?: string | null): boolean {
  return phase === "released";
}

export function shouldTransferInstallationToEquipment(input: Pick<Installation, "phase" | "name"> | { phase?: string | null; name?: string | null }): boolean {
  return isReleasedPhase(input.phase) && Boolean(String(input.name ?? "").trim());
}

export function didInstallationEnterReleased(previousPhase?: string | null, nextPhase?: string | null): boolean {
  return !isReleasedPhase(previousPhase) && isReleasedPhase(nextPhase);
}

export function resolveInstallationPhase(input: InstallationPhaseInput, now: Date = new Date()): PhaseKey {
  if (input.actComplete) return "released";
  if (input.actArrival) return "installing";

  const daysToInstall = daysUntilYmd(input.estComplete, now);
  const daysToShip = daysUntilYmd(input.estArrival, now);

  if (daysToShip != null && daysToShip <= 0) {
    if (daysToInstall != null) {
      return daysToInstall <= 0 ? "installing" : "arrived";
    }
    return "arrived";
  }

  if (daysToShip != null && daysToShip <= 3) return "shipping";
  if (daysToInstall != null && daysToInstall <= 0) return "installing";
  return "ordered";
}

const PHASE_SEQ_MAP = Object.fromEntries(PHASES.map((phaseMeta) => [phaseMeta.key, phaseMeta.seq])) as Record<PhaseKey, number>;


export type InstallationImportDisposition = {
  phase: PhaseKey;
  progress: number;
  transferToEquipment: boolean;
  keepInstallation: boolean;
};

export function resolveInstallationImportDisposition(
  input: InstallationPhaseInput & { serialNo?: string | null },
  now: Date = new Date(),
): InstallationImportDisposition {
  const phase = resolveInstallationPhase(input, now);
  const progress = resolveInstallationProgress(phase);
  const transferToEquipment = shouldTransferInstallationToEquipment({
    phase,
    name: trimString(input.serialNo),
  });

  return {
    phase,
    progress,
    transferToEquipment,
    keepInstallation: !transferToEquipment,
  };
}

export function resolveInstallationProgress(phase: PhaseKey): number {
  const seq = PHASE_SEQ_MAP[phase] ?? 1;
  const total = PHASES.length;
  return clamp(roundTo5((seq / total) * 100), 0, 100);
}
