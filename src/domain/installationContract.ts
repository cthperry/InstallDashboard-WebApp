import type { Installation, MachineModel, PhaseKey, RegionKey } from "@/domain/types";
import { toDisplayShortName } from "@/domain/personDisplay";
import { canonicalizeMachineModelCode } from "@/domain/machineModels";
import { isDateYmd, normalizeDateYmd, trimString } from "@/lib/utils";

export const INSTALLATION_DATE_FIELDS = [
  { key: "estArrival", label: "預計出貨日" },
  { key: "estComplete", label: "預計安裝日" },
  { key: "actArrival", label: "實際安裝日期" },
  { key: "actComplete", label: "驗收完成日期" },
] as const;

export type InstallationDateFieldKey = typeof INSTALLATION_DATE_FIELDS[number]["key"];
export type InstallationDraft = Omit<Installation, "id">;
export type InstallationDraftInput = Partial<InstallationDraft>;
export type InstallationPhaseGroup = "preShip" | "postShip" | "installStarted" | "accepted";
export type InstallationValidationIssuePath =
  | "name"
  | "engineer"
  | InstallationDateFieldKey;

export type InstallationValidationIssue = {
  path: [InstallationValidationIssuePath];
  message: string;
};

const VALID_REGIONS: readonly RegionKey[] = ["north", "central", "south"] as const;
const VALID_PHASES: readonly PhaseKey[] = ["ordered", "shipping", "arrived", "installing", "trial", "qual", "released"] as const;
const DATE_FIELD_LABELS = Object.fromEntries(INSTALLATION_DATE_FIELDS.map((field) => [field.key, field.label])) as Record<InstallationDateFieldKey, string>;

function normalizeRegion(value: unknown): RegionKey {
  return VALID_REGIONS.includes(value as RegionKey) ? (value as RegionKey) : "north";
}

function normalizePhase(value: unknown): PhaseKey {
  return VALID_PHASES.includes(value as PhaseKey) ? (value as PhaseKey) : "ordered";
}

function normalizeChecklist(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, checked]) => [key, Boolean(checked)]),
  );
}

function compareYmd(left: string, right: string): number {
  return left.localeCompare(right);
}

function pushDateFormatIssue(issues: InstallationValidationIssue[], field: InstallationDateFieldKey, value: string) {
  if (!value) return;
  if (isDateYmd(value)) return;
  issues.push({
    path: [field],
    message: `${DATE_FIELD_LABELS[field]}格式需為 YYYY-MM-DD`,
  });
}

export function getInstallationPhaseGroup(phase: unknown): InstallationPhaseGroup {
  switch (normalizePhase(phase)) {
    case "ordered":
      return "preShip";
    case "shipping":
    case "arrived":
      return "postShip";
    case "installing":
    case "trial":
    case "qual":
      return "installStarted";
    case "released":
      return "accepted";
    default:
      return "preShip";
  }
}

export function doesInstallationPhaseRequireSerial(phase: unknown): boolean {
  const normalized = normalizePhase(phase);
  return normalized !== "ordered" && normalized !== "shipping";
}

export function doesInstallationPhaseRequireEngineer(phase: unknown): boolean {
  return getInstallationPhaseGroup(phase) !== "preShip";
}

export function doesInstallationPhaseRequireInstallStart(phase: unknown): boolean {
  const group = getInstallationPhaseGroup(phase);
  return group === "installStarted" || group === "accepted";
}

export function doesInstallationPhaseRequireAcceptance(_phase: unknown): boolean {
  return false;
}

export function getInstallationDefaultDraft(machineModels: readonly MachineModel[]): InstallationDraft {
  return {
    name: "",
    modelCode: canonicalizeMachineModelCode(machineModels[0]?.code || "FlexTRAK-S", machineModels),
    region: "north",
    customer: "",
    phase: "ordered",
    engineer: "",
    custContact: "",
    custPhone: "",
    orderDate: "",
    estArrival: "",
    estComplete: "",
    actArrival: "",
    actComplete: "",
    notes: "",
    progress: 0,
    checklist: {},
  };
}

export function normalizeInstallationDraft(
  input: InstallationDraftInput,
  machineModels: readonly MachineModel[],
): InstallationDraft {
  const base = getInstallationDefaultDraft(machineModels);
  const phase = normalizePhase(input.phase ?? base.phase);
  const progressRaw = Number(input.progress ?? base.progress);
  const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, progressRaw)) : base.progress;

  return {
    ...base,
    name: trimString(input.name),
    modelCode: canonicalizeMachineModelCode(input.modelCode ?? base.modelCode, machineModels),
    region: normalizeRegion(input.region ?? base.region),
    customer: trimString(input.customer),
    phase,
    engineer: toDisplayShortName(input.engineer),
    custContact: trimString(input.custContact),
    custPhone: trimString(input.custPhone),
    orderDate: normalizeDateYmd(input.orderDate),
    estArrival: normalizeDateYmd(input.estArrival),
    estComplete: normalizeDateYmd(input.estComplete),
    actArrival: normalizeDateYmd(input.actArrival),
    actComplete: normalizeDateYmd(input.actComplete),
    notes: trimString(input.notes),
    progress,
    checklist: normalizeChecklist(input.checklist),
  };
}

export function getInstallationValidationIssues(
  input: Pick<InstallationDraft, "phase" | "name" | "engineer" | "estArrival" | "estComplete" | "actArrival" | "actComplete">,
): InstallationValidationIssue[] {
  const issues: InstallationValidationIssue[] = [];

  const serialNo = trimString(input.name);
  const engineer = trimString(input.engineer);
  const rawEstArrival = trimString(input.estArrival);
  const rawEstComplete = trimString(input.estComplete);
  const rawActArrival = trimString(input.actArrival);
  const rawActComplete = trimString(input.actComplete);
  const estArrival = normalizeDateYmd(rawEstArrival);
  const estComplete = normalizeDateYmd(rawEstComplete);
  const actArrival = normalizeDateYmd(rawActArrival);
  const actComplete = normalizeDateYmd(rawActComplete);

  if (doesInstallationPhaseRequireSerial(input.phase) && !serialNo) {
    issues.push({
      path: ["name"],
      message: "到廠後階段需填寫機台序號",
    });
  }

  if (doesInstallationPhaseRequireEngineer(input.phase) && !engineer) {
    issues.push({
      path: ["engineer"],
      message: "出貨後階段需填寫工程師",
    });
  }

  pushDateFormatIssue(issues, "estArrival", rawEstArrival);
  pushDateFormatIssue(issues, "estComplete", rawEstComplete);
  pushDateFormatIssue(issues, "actArrival", rawActArrival);
  pushDateFormatIssue(issues, "actComplete", rawActComplete);

  if (doesInstallationPhaseRequireInstallStart(input.phase) && !actArrival) {
    issues.push({
      path: ["actArrival"],
      message: "開始安裝後階段需填寫實際安裝日期",
    });
  }

  if (estArrival && estComplete && compareYmd(estArrival, estComplete) > 0) {
    issues.push({
      path: ["estComplete"],
      message: "預計安裝日不可早於預計出貨日",
    });
  }

  if (actArrival && actComplete && compareYmd(actArrival, actComplete) > 0) {
    issues.push({
      path: ["actComplete"],
      message: "驗收完成日期不可早於實際安裝日期",
    });
  }

  return issues;
}
