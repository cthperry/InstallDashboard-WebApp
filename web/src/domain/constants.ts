import type { PhaseKey, RegionKey } from "@/domain/types";

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
  { key: "hookup",     label: "管線連接",  icon: "🔌", color: "#f472b6", seq: 4 },
  { key: "trial",      label: "試產",     icon: "⚙️", color: "#22d3ee", seq: 5 },
  { key: "qual",       label: "品質驗證", icon: "🔬", color: "#84cc16", seq: 6 },
  { key: "released",   label: "正式量產", icon: "✅", color: "#10b981", seq: 7 }
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
  "Asher",
] as const;

export const DEFAULT_CUSTOMERS = [
  "TSMC",
  "ASE-K18",
  "ASE-K22",
  "SPIL-二林",
  "SPIL-中山",
  "SPIL-大豐",
  "PTI",
] as const;


// ── 各階段標準 Checklist 項目 ────────────────────────────────────
export const PHASE_CHECKLISTS: Record<string, string[]> = {
  ordered:    [],
  shipping:   ["通知客戶預計到廠日期"],
  arrived:    ["清點入庫清單", "外觀損傷確認", "通知客戶到廠", "排定裝機時程"],
  installing: ["機台定位 / 水平調整", "配管完成", "配線完成", "Leak Check 洩漏測試", "基本功能確認"],
  hookup:     ["Gas Line 連接確認", "排氣管路確認", "電氣連接與接地確認", "安全連鎖（Interlock）確認"],
  trial:      ["Recipe 設定完成", "Trial Run 第一輪", "Trial Run 第二輪", "工程師確認數據", "客戶確認結果"],
  qual:       ["Qual Recipe 確認", "Lot 驗證完成", "客戶工程簽核", "驗收報告準備"],
  released:   ["正式移交客戶", "驗收單簽署", "客戶教育訓練完成", "資料歸檔"],
};

export const EQUIPMENT_MAIN_STATUSES = ["裝機","試產","正式上產中"] as const;
export const CAPACITY_LEVELS = ["綠","黃","紅"] as const;

export const CAPACITY_COLOR: Record<(typeof CAPACITY_LEVELS)[number], string> = {
  "綠": "#10b981",
  "黃": "#f59e0b",
  "紅": "#ef4444"
};

export const STATUS_COLOR: Record<(typeof EQUIPMENT_MAIN_STATUSES)[number], string> = {
  "裝機": "#f59e0b",
  "試產": "#38bdf8",
  "正式上產中": "#10b981"
};
