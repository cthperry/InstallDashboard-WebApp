# Changelog

## v1.2.0 — 2026-03-15 — 架構優化與維護性提升

### 型別安全 (Type Safety)
- 新增 `InstallFormData`、`EquipmentFormData` 正式型別，取代表單中所有 `any`
- 新增 `INSTALL_FORM_DEFAULTS`、`EQUIPMENT_FORM_DEFAULTS` 集中管理初始值
- `machineModels` state 改用 `MachineModel[]` 型別，移除 `as any` 轉型

### 模組拆分 (Architecture)
- 新增 `hooks/useInstallActions.ts` — 裝機案 CRUD 業務邏輯 hook
- 新增 `hooks/useEquipmentActions.ts` — 設備 CRUD 業務邏輯 hook
- 新增 `hooks/useToast.ts` — Toast 提示狀態管理 hook
- 新增 `features/ui/FormField.tsx` — 共用表單元件 (FormInput, FormSelect, FormGrid, FormSection)

### 資料遷移安全 (Data Migration)
- 新增 `domain/migrations.ts` — 舊版 phase 自動正規化（hookup → installing）
- 新增 `PhaseKeyLegacy` 型別處理 Firestore 中舊版資料
- `listenInstallations` 增加 `normalizeInstallations()` 自動修正

### Checklist 穩定性
- 新增 `domain/checklistUtils.ts` — slug-based checklist key 取代 index-based
- 新 key 格式 `${phase}_${slug}` 不受項目順序變動影響
- 向後相容：讀取時先查新 key，fallback 舊 index key

### 死欄位清理 (Dead Field Cleanup)
- Schema 移除 `orderDate`（UI 已於 v1.1.0 移除表單欄位）
- Types 中 `orderDate` 標記 `@deprecated`，保留向後讀取
- 欄位名稱加入 UI 標籤註解（estArrival → 預計出貨、actArrival → 實際出貨）

### 樣式一致性 (Style Tokens)
- 移除失效的 `--phase-hookup` CSS 變數
- 新增間距 token：`--space-xs` ~ `--space-xl`
- 新增字級 token：`--text-xs` ~ `--text-xl`

---

## v1.1.0 — 2026-03-15

- 新增 機器序號 (S/N) 欄位，備貨出貨後必填
- 裝機表單標籤修正：預計到貨 → 預計出貨、實際到貨 → 實際出貨
- 移除表單中 訂單日期 欄位
- 合併管線連接 (hookup) 階段至裝機中 (installing)
- 訂單確認清單清空、備貨出貨清單精簡為單項
- NVIDIA 綠 (#76b900) 亮色主題全面上線

## v1.0.0 — 2026-02-28

- 初始版本：裝機戰情室 Dashboard
- 支援裝機案 CRUD、設備管理、Excel 匯入
- Firebase 認證 + Firestore 即時同步
- 區域篩選、階段進度追蹤、SLA 逾期警示
