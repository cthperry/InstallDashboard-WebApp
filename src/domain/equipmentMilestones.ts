import type { Equipment } from "@/domain/types";
import { normalizeDateYmd } from "@/lib/utils";

type InstallationDateInput = {
  actArrival?: string;
  actComplete?: string;
};

export function buildEquipmentMilestonesFromInstallationDates(
  input: InstallationDateInput,
  existing?: Equipment["milestones"],
): Equipment["milestones"] {
  const actArrival = normalizeDateYmd(input.actArrival);
  const actComplete = normalizeDateYmd(input.actComplete);

  return {
    installStart: actArrival || existing?.installStart || "",
    installDone: existing?.installDone || "",
    trialStart: existing?.trialStart || "",
    trialPass: existing?.trialPass || "",
    prodStart: actComplete || existing?.prodStart || "",
    reachTargetDate: existing?.reachTargetDate || "",
  };
}
