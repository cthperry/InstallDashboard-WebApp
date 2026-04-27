import { z } from "zod";
import { CAPACITY_LEVELS, EQUIPMENT_MAIN_STATUSES } from "@/domain/constants";
import { getInstallationValidationIssues } from "@/domain/installationContract";

function emptyableString(max: number) {
  return z.string().max(max).optional().default("");
}

export const machineModelSchema = z.object({
  code: z.string().min(1).max(60).regex(/^[A-Za-z0-9][A-Za-z0-9-_]+$/, "code 僅允許英數與 - _，且不可空白"),
  displayName: z.string().min(1).max(80)
});

export const machineModelsDocSchema = z.object({
  version: z.string().min(1).max(40),
  models: z.array(machineModelSchema).min(1)
});

export const customerEntrySchema = z.object({
  name: z.string().min(1).max(80),
  region: z.enum(["north", "central", "south"]),
});

export const appVariablesDocSchema = z.object({
  version: z.string().min(1).max(40),
  engineers: z.array(z.string().min(1).max(60)).default([]),
  customers: z.array(customerEntrySchema).default([]),
});

export const retentionSettingsSchema = z.object({
  version: z.string().min(1).max(40),
  auditLogsRetentionDays: z.number().int().min(0).max(3650).default(0),
  eventsRetentionDays: z.number().int().min(0).max(3650).default(0),
  autoPurgeEnabled: z.boolean().default(false),
  autoPurgeTime: z.string().regex(/^\d{2}:\d{2}$/, "autoPurgeTime 格式需為 HH:MM").default("03:00")
});

export const installationBaseSchema = z.object({
  name: z.string().max(80),
  modelCode: z.string().min(1, "請填寫機型").max(60),
  region: z.enum(["north", "central", "south"]),
  customer: z.string().min(1, "請填寫客戶").max(80),
  phase: z.enum(["ordered", "shipping", "arrived", "installing", "trial", "qual", "released"]),
  engineer: z.string().max(40),
  custContact: emptyableString(40),
  custPhone: emptyableString(40),
  orderDate: emptyableString(20),
  estArrival: emptyableString(20),
  actArrival: emptyableString(20),
  estComplete: emptyableString(20),
  actComplete: emptyableString(20),
  notes: emptyableString(400),
  progress: z.number().min(0).max(100),
  checklist: z.record(z.string(), z.boolean()).optional().default({})
});

export const installationSchema = installationBaseSchema.superRefine((data, ctx) => {
  const issues = getInstallationValidationIssues(data);
  for (const issue of issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message,
    });
  }
});

export const equipmentSchema = z.object({
  equipmentId: z.string().min(1).max(40),
  region: z.enum(["north", "central", "south"]),
  customer: z.string().min(1).max(80),
  site: emptyableString(80),
  modelCode: z.string().min(1).max(60),
  serialNo: z.string().min(1).max(60),
  statusMain: z.enum(EQUIPMENT_MAIN_STATUSES),
  statusSub: emptyableString(80),
  owner: emptyableString(60),
  milestones: z.object({
    installStart: emptyableString(20),
    installDone: emptyableString(20),
    trialStart: emptyableString(20),
    trialPass: emptyableString(20),
    prodStart: emptyableString(20),
    reachTargetDate: emptyableString(20)
  }),
  blocking: z.object({
    reasonCode: z.string().max(40),
    detail: z.string().max(200),
    owner: z.string().max(60),
    eta: emptyableString(20)
  }).optional(),
  capacity: z.object({
    utilization: z.number().min(0).max(100),
    uph: z.number().min(0),
    targetUph: z.number().min(0),
    level: z.enum(CAPACITY_LEVELS),
    trend7d: z.array(z.number().min(0).max(100)).length(7)
  }),
  products: z.array(z.object({
    name: z.string().min(1).max(40),
    dailyCap: z.number().min(0)
  })).optional().default([])
});
