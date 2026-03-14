export type RegionKey = "north" | "central" | "south";

export type PhaseKey =
  | "ordered"
  | "shipping"
  | "arrived"
  | "installing"
  | "trial"
  | "qual"
  | "released";

/**
 * Firestore 中舊資料可能包含已移除的階段（如 "hookup"），
 * 讀取時用此寬鬆型別接收，再在 UI 層映射至有效 PhaseKey。
 */
export type PhaseKeyLegacy = PhaseKey | "hookup";

export type Installation = {
  id: string;
  name: string;
  modelCode: string;
  region: RegionKey;
  customer: string;
  phase: PhaseKey;
  engineer?: string;   // 未安裝階段可為空
  custContact?: string;
  custPhone?: string;

  serialNo?: string;   // 機器序號：備貨出貨後必填，訂單確認階段選填

  /** @deprecated 已於 v1.2.0 移除表單欄位，保留向後相容讀取 */
  orderDate?: string;
  estArrival?: string;  // UI 標籤「預計出貨」
  actArrival?: string;  // UI 標籤「實際出貨」
  estComplete?: string;
  actComplete?: string;

  notes?: string;
  progress: number;

  /** 各階段 checklist 完成狀態，key = "${phaseKey}_${checkItemSlug}" */
  checklist?: Record<string, boolean>;

  createdAt?: number;
  updatedAt?: number;
};

// ── 表單專用型別（不含 id / timestamps） ─────────────────────────
/** 裝機案表單資料：提交至 Firestore 前的欄位集合 */
export type InstallFormData = {
  name: string;
  modelCode: string;
  region: RegionKey;
  customer: string;
  phase: PhaseKey;
  engineer: string;
  serialNo: string;
  custContact: string;
  custPhone: string;
  estArrival: string;
  actArrival: string;
  estComplete: string;
  actComplete: string;
  notes: string;
  progress: number;
  checklist?: Record<string, boolean>;
};

/** 裝機案表單初始值 */
export const INSTALL_FORM_DEFAULTS: InstallFormData = {
  name: "",
  modelCode: "FlexTRAK-S",
  region: "north",
  customer: "",
  phase: "ordered",
  engineer: "",
  serialNo: "",
  custContact: "",
  custPhone: "",
  estArrival: "",
  actArrival: "",
  estComplete: "",
  actComplete: "",
  notes: "",
  progress: 0,
};

/** 設備表單資料 */
export type EquipmentFormData = {
  equipmentId: string;
  region: RegionKey;
  customer: string;
  site: string;
  modelCode: string;
  serialNo: string;
  statusMain: EquipmentMainStatus;
  statusSub: string;
  owner: string;
  milestones: Equipment["milestones"];
  blocking?: Equipment["blocking"];
  capacity: Equipment["capacity"];
};

/** 設備表單初始值 */
export const EQUIPMENT_FORM_DEFAULTS: EquipmentFormData = {
  equipmentId: "",
  region: "north",
  customer: "",
  site: "",
  modelCode: "FlexTRAK-S",
  serialNo: "",
  statusMain: "裝機",
  statusSub: "",
  owner: "",
  milestones: {},
  capacity: { utilization: 0, uph: 0, targetUph: 0, level: "綠", trend7d: [0, 0, 0, 0, 0, 0, 0] },
};

export type UserProfile = {
  email: string;
  role: "admin" | "user";
  mustChangePassword?: boolean;
  updatedAt: number;
};

export type MachineModel = {
  code: string;
  displayName: string;
  category?: string;
  vendor?: string;
  defaultStages?: string[];
  tags?: string[];
};

export type MachineModelsDoc = {
  version: string;
  models: MachineModel[];
  updatedAt: number;
  updatedBy: string;
};

export type AppVariablesDoc = {
  version: string;
  engineers: string[];
  customers: string[];
  customerRegionMap?: Record<string, string>; // customer name → RegionKey，未設定表示全區顯示
  updatedAt: number;
  updatedBy: string;
};


export type EquipmentMainStatus = "裝機" | "試產" | "正式上產中";
export type CapacityLevel = "綠" | "黃" | "紅";

export type Equipment = {
  id: string; // Firestore docId
  equipmentId?: string; // 顯示用 ID（可與 docId 不同，非必填）
  region: RegionKey;
  customer: string;
  site: string;
  modelCode: string;
  serialNo: string;

  statusMain: EquipmentMainStatus;
  statusSub: string;

  owner: string;

  milestones: {
    installStart?: string; // YYYY-MM-DD
    installDone?: string;
    trialStart?: string;
    trialPass?: string;
    prodStart?: string;
    reachTargetDate?: string;
  };

  blocking?: {
    reasonCode: string;
    detail: string;
    owner: string;
    eta?: string; // YYYY-MM-DD
  };

  capacity: {
    utilization: number; // 0~100
    uph: number;
    targetUph: number;
    level: CapacityLevel;
    trend7d: number[]; // length 7, 0~100
  };

  updatedAt?: number;
  createdAt?: number;
};
