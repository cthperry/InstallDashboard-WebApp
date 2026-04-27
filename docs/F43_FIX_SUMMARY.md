# F43 修正摘要

## 本次主修

### 1. 裝機案表單改為單一契約
新增：
- `src/domain/installationContract.ts`

統一處理：
- 預設欄位
- 日期欄位標準
- 機型正規化
- 階段驗證（訂單確認可不填機台序號；出貨後才強制）
- 表單儲存前正規化

### 2. 機型誤顯示修正
新增：
- `src/domain/machineModels.ts`

調整：
- `machineModels` 改為 Firestore 設定 + 內建預設合併
- 裝機案表單 `modelCode` 下拉加入舊值 fallback
- 匯入 / 開單 / 編輯 / 儲存共用同一套機型正規化

### 3. 日期欄位改為日曆輸入
新增：
- `src/features/ui/DateInput.tsx`

統一四個日期欄位：
- 預計出貨日
- 預計安裝日
- 實際安裝日期
- 驗收完成日期

### 4. 共用工具抽離
新增：
- `src/lib/utils.ts`
- `src/domain/equipmentMilestones.ts`

統一：
- `trimString / normalizeString`
- 日期正規化
- milestone 對應規則

## 同步修正檔案
- `src/features/dashboard/DashboardWorkspace.tsx`
- `src/domain/schemas.ts`
- `src/domain/importRules.ts`
- `src/features/dashboard/services/installationLifecycleService.ts`
- `src/features/dashboard/services/equipmentTransferService.ts`
- `src/features/data/equipments.ts`
- `src/features/dashboard/hooks/useDashboardData.ts`
- `src/features/dashboard/ImportEquipmentModal.tsx`
- `src/features/dashboard/ImportExcelModal.tsx`
- `src/features/dashboard/WarRoomPage.tsx`

## 尚未做的部分
- 未拆分 `DashboardWorkspace.tsx`
- 未重做 `SmartImport` writeBatch 原子匯入
- 未做 section-based Firestore listener 精簡

