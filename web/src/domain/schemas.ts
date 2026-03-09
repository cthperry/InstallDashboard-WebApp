import { z } from "zod";

export const machineModelSchema = z.object({
  code: z.string().min(1).max(60).regex(/^[A-Za-z0-9][A-Za-z0-9-_]+$/, "code 僅允許英數與 - _，且不可空白"),
  displayName: z.string().min(1).max(80),
  category: z.string().max(80).optional(),
  vendor: z.string().max(80).optional(),
  defaultStages: z.array(z.string().max(40)).optional(),
  tags: z.array(z.string().max(20)).optional()
});

export const machineModelsDocSchema = z.object({
  version: z.string().min(1).max(40),
  models: z.array(machineModelSchema).min(1)
});

export const appVariablesDocSchema = z.object({
  version: z.string().min(1).max(40),
  engineers: z.array(z.string().min(1).max(60)).default([]),
  customers: z.array(z.string().min(1).max(80)).default([])
});

export const installationSchema = z.object({
  name: z.string().min(1).max(80),
  modelCode: z.string().min(1).max(60),
  region: z.enum(["north", "central", "south"]),
  customer: z.string().min(1).max(80),
  phase: z.enum(["ordered","shipping","arrived","installing","hookup","trial","qual","released"]),
  engineer: z.string().max(40).optional().or(z.literal("")),

  custContact: z.string().max(40).optional().or(z.literal("")),
  custPhone: z.string().max(40).optional().or(z.literal("")),
  orderDate: z.string().max(20).optional().or(z.literal("")),
  estArrival: z.string().max(20).optional().or(z.literal("")),
  actArrival: z.string().max(20).optional().or(z.literal("")),
  estComplete: z.string().max(20).optional().or(z.literal("")),
  actComplete: z.string().max(20).optional().or(z.literal("")),

  notes: z.string().max(400).optional().or(z.literal("")),
  progress: z.number().min(0).max(100),
  checklist: z.record(z.string(), z.boolean()).optional(),
});


export const equipmentSchema = z.object({
  equipmentId: z.string().max(40).optional().or(z.literal("")),
  region: z.enum(["north","central","south"]),
  customer: z.string().min(1).max(80),
  site: z.string().min(1).max(80),
  modelCode: z.string().min(1).max(60),
  serialNo: z.string().min(1).max(60),
  statusMain: z.enum(["裝機","試產","正式上產中"]),
  statusSub: z.string().max(80).optional().or(z.literal("")),
  owner: z.string().min(1).max(60),
  milestones: z.object({
    installStart: z.string().max(20).optional().or(z.literal("")),
    installDone: z.string().max(20).optional().or(z.literal("")),
    trialStart: z.string().max(20).optional().or(z.literal("")),
    trialPass: z.string().max(20).optional().or(z.literal("")),
    prodStart: z.string().max(20).optional().or(z.literal("")),
    reachTargetDate: z.string().max(20).optional().or(z.literal(""))
  }),
  blocking: z.object({
    reasonCode: z.string().max(40),
    detail: z.string().max(200),
    owner: z.string().max(60),
    eta: z.string().max(20).optional().or(z.literal(""))
  }).optional(),
  capacity: z.object({
    utilization: z.number().min(0).max(100),
    uph: z.number().min(0),
    targetUph: z.number().min(0),
    level: z.enum(["綠","黃","紅"]),
    trend7d: z.array(z.number().min(0).max(100)).length(7)
  })
});
