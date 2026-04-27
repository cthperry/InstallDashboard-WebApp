export type RegionKey = "north" | "central" | "south";

export type PhaseKey =
  | "ordered"
  | "shipping"
  | "arrived"
  | "installing"
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
  engineer: string;
  custContact?: string;
  custPhone?: string;

  orderDate?: string;
  estArrival?: string;
  actArrival?: string;
  estComplete?: string;
  actComplete?: string;

  notes?: string;
  progress: number;

  checklist?: Record<string, boolean>; // itemId -> checked
  importKey?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type UserProfile = {
  email: string;
  role: "admin" | "engineer";
  updatedAt: number;
};

export type MachineModel = {
  code: string;
  displayName: string;
};

export type MachineModelsDoc = {
  version: string;
  models: MachineModel[];
  updatedAt: number;
  updatedBy: string;
};

export type CustomerEntry = {
  name: string;
  region: RegionKey;
};

export type AppVariablesDoc = {
  version: string;
  engineers: string[];
  customers: CustomerEntry[];
  updatedAt: number;
  updatedBy: string;
};

// 清除/保留設定（混合：手動清除 + 依時間自動觸發）
export type RetentionSettingsDoc = {
  version: string;
  auditLogsRetentionDays: number; // 0 代表不自動清除
  eventsRetentionDays: number; // 0 代表不自動清除
  autoPurgeEnabled: boolean;
  autoPurgeTime: string; // HH:MM（Asia/Taipei）
  lastAutoPurgeAt?: number; // Date.now()
  updatedAt: number;
  updatedBy: string;
};


export type EquipmentMainStatus = "裝機" | "試產" | "正式生產中";
export type CapacityLevel = "綠" | "黃" | "紅";

// 每個機台所生產的產品 + 對應日產能
export type ProductCapacity = {
  name: string;     // 產品名稱，例如 "GB100"
  dailyCap: number; // 日產能（顆/片/片等）
};

export type Equipment = {
  id: string; // Firestore docId
  equipmentId: string; // 顯示用 ID（可與 docId 不同）
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

  // 產品產能清單（可多筆，顯示於設備台帳）
  products?: ProductCapacity[];

  updatedAt?: number;
  createdAt?: number;
};
