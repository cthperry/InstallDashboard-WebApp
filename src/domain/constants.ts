import type { EquipmentMainStatus, PhaseKey, RegionKey } from "@/domain/types";

export const SETTINGS_COL = "settings" as const;
export const USERS_COL = "users" as const;
export const INSTALLATIONS_COL = "installations" as const;
export const EQUIPMENTS_COL = "equipments" as const;
export const AUDIT_LOGS_COL = "auditLogs" as const;
export const EVENTS_COL = "events" as const;
export const IMPORT_SESSIONS_COL = "importSessions" as const;

export const REGIONS: Record<RegionKey, { label: string; cities: string; color: string }> = {
  north:   { label: "北區", cities: "新竹/桃園/台北", color: "#3b82f6" },
  central: { label: "中區", cities: "台中/彰化/南投", color: "#10b981" },
  south:   { label: "南區", cities: "台南/高雄/屏東", color: "#f59e0b" }
};

export const PHASES: Array<{ key: PhaseKey; label: string; icon: string; color: string; seq: number }> = [
  { key: "ordered",    label: "訂單確認", icon: "📋", color: "#94a3b8", seq: 0 },
  { key: "shipping",   label: "備貨出貨", icon: "🚚", color: "#a78bfa", seq: 1 },
  { key: "arrived",    label: "到廠待裝", icon: "📦", color: "#38bdf8", seq: 2 },
  { key: "installing", label: "裝機中",   icon: "🔧", color: "#f59e0b", seq: 3 },
  { key: "trial",      label: "試產",     icon: "⚙️", color: "#22d3ee", seq: 4 },
  { key: "qual",       label: "Qual 驗證", icon: "🔬", color: "#84cc16", seq: 5 },
  { key: "released",   label: "正式量產", icon: "✅", color: "#10b981", seq: 6 }
];

export const PHASE_MAP = Object.fromEntries(PHASES.map(p => [p.key, p])) as Record<PhaseKey, (typeof PHASES)[number]>;

export const DEFAULT_MACHINE_MODELS = [
  { code: "FlexTRAK-S", displayName: "FlexTRAK-S" },
  { code: "AP-1000", displayName: "AP-1000" },
  { code: "ExoSPHERE", displayName: "ExoSPHERE" }
] as const;

// 混合式設定（推薦）：程式內建預設 + Firestore settings/appVariables 覆蓋
// - 若 Firestore 有設定：以 Firestore 為準
// - 若 Firestore 尚未設定：使用此預設值（避免列表為空）
export const DEFAULT_ENGINEERS = [
  "Stone",
  "Simon",
  "Wayne",
  "Frank",
  "Perry",
  "Sam",
] as const;

export const DEFAULT_CUSTOMERS = [
  "TSMC",
  "ASE",
  "SPIL"
] as const;


export const EQUIPMENT_MAIN_STATUSES = ["裝機","試產","正式生產中"] as const;
export const CAPACITY_LEVELS = ["綠","黃","紅"] as const;

export const EQUIPMENT_SUB_STATUS_OPTIONS: Record<EquipmentMainStatus, readonly string[]> = {
  裝機: ["到廠點收", "配管配線", "軟體安裝", "參數設定", "試車調校"],
  試產: ["小量試產", "製程調校", "良率驗證", "缺陷排查", "客戶確認"],
  正式生產中: ["量產穩定", "效率優化", "例行保養", "異常處理", "待排程"]
} as const;

export const CAPACITY_COLOR: Record<(typeof CAPACITY_LEVELS)[number], string> = {
  "綠": "#10b981",
  "黃": "#f59e0b",
  "紅": "#ef4444"
};

export const STATUS_COLOR: Record<(typeof EQUIPMENT_MAIN_STATUSES)[number], string> = {
  "裝機": "#f59e0b",
  "試產": "#38bdf8",
  "正式生產中": "#10b981"
};

export type ChecklistItem = { id: string; label: string };

export const PHASE_CHECKLIST: Record<string, ChecklistItem[]> = {
  installing: [
    { id: "ins1", label: "機台定位 / 水平調整" },
    { id: "ins2", label: "配管完成" },
    { id: "ins3", label: "配線完成" },
    { id: "ins4", label: "Leak Check 洩漏測試" },
    { id: "ins5", label: "基本功能確認" },
    { id: "ins6", label: "Gas Line 連接確認" },
    { id: "ins7", label: "排氣管路確認" },
    { id: "ins8", label: "電氣連接與接地確認" },
    { id: "ins9", label: "安全連鎖（Interlock）確認" },
    { id: "hkp1", label: "管路連接確認" },
    { id: "hkp2", label: "冷卻水接通" },
    { id: "hkp3", label: "氣體 / 化學品接通" }
  ],
  trial: [
    { id: "tri1", label: "Recipe 設定完成" },
    { id: "tri2", label: "Trial Run 第一輪" },
    { id: "tri3", label: "Trial Run 第二輪" },
    { id: "tri4", label: "工程師確認數據" },
    { id: "tri5", label: "客戶確認結果" }
  ],
  qual: [
    { id: "qal1", label: "Qual 測試完成" },
    { id: "qal2", label: "品質文件提交" },
    { id: "qal3", label: "客戶驗收通過" }
  ],
  released: [
    { id: "rel1", label: "量產正式啟動" },
    { id: "rel2", label: "工程師撤退確認" },
    { id: "rel3", label: "文件 & 訓練歸檔" }
  ]
};
