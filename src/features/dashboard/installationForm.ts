import type { Installation, MachineModel, PhaseKey, RegionKey } from "@/domain/types";
import { getInstallationDefaultDraft, normalizeInstallationDraft, type InstallationDraft } from "@/domain/installationContract";
import { getInstallationSerial } from "@/domain/installationDisplay";
import { toDisplayShortName } from "@/domain/personDisplay";
import { getInstallationProgressByPhase } from "@/features/dashboard/services/installationLifecycleService";
import { normalizeDateYmd } from "@/lib/utils";

export type InstallationDraftSeed = {
  customer: string;
  region: "" | RegionKey;
  modelCode: string;
  phase: "" | PhaseKey;
  engineer: string;
  inferredRegion: RegionKey | null;
};

export function buildNewInstallationDraft(
  machineModels: readonly MachineModel[],
  seed: InstallationDraftSeed,
): InstallationDraft {
  const draft = getInstallationDefaultDraft(machineModels);
  return {
    ...draft,
    customer: seed.customer || "",
    region: seed.inferredRegion ?? (seed.region || draft.region),
    modelCode: seed.modelCode || draft.modelCode,
    phase: seed.phase || draft.phase,
    engineer: seed.engineer || "",
    progress: seed.phase ? getInstallationProgressByPhase(seed.phase) : draft.progress,
  };
}

export function buildEditInstallationDraft(
  row: Installation,
  machineModels: readonly MachineModel[],
): InstallationDraft {
  return normalizeInstallationDraft({
    name: getInstallationSerial(row),
    modelCode: row.modelCode ?? "",
    region: row.region ?? "north",
    customer: row.customer ?? "",
    phase: row.phase ?? "ordered",
    engineer: toDisplayShortName(row.engineer) || "",
    custContact: row.custContact ?? "",
    custPhone: row.custPhone ?? "",
    orderDate: row.orderDate ?? "",
    estArrival: normalizeDateYmd(row.estArrival),
    actArrival: normalizeDateYmd(row.actArrival),
    estComplete: normalizeDateYmd(row.estComplete),
    actComplete: normalizeDateYmd(row.actComplete),
    notes: row.notes ?? "",
    progress: row.progress ?? 0,
    checklist: row.checklist ?? {},
  }, machineModels);
}
