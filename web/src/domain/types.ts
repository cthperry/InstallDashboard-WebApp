export type RegionKey = "north" | "central" | "south";

export type PhaseKey =
  | "ordered"
  | "shipping"
  | "arrived"
  | "installing"
  | "hookup"
  | "trial"
  | "qual"
  | "released";

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

  orderDate?: string;
  estArrival?: string;
  actArrival?: string;
  estComplete?: string;
  actComplete?: string;

  notes?: string;
  progress: number;

  /** 各階段 checklist 完成狀態，key = "${phaseKey}_${index}" */
  checklist?: Record<string, boolean>;

  createdAt?: number;
  updatedAt?: number;
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
