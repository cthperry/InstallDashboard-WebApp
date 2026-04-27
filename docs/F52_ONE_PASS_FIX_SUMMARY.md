# F52 一次收斂修正版摘要

版本：20260331-F52

## 本次集中修正

### 1. 匯入與預覽
- `SmartImportModal` 改為動態載入 `xlsx`，避免把整個套件常駐進首屏 bundle。
- `SmartImportModal` 改用 `parseWorkbookJsonRows()`，匯入解析與欄位清洗集中到同一條路徑。
- `ImportExcelModal`、`ImportEquipmentModal` 也同步改成動態載入 `xlsx`，並改用共用日期解析。
- 舊匯入路徑移除假值補寫：
  - 不再自動補 `—`
  - 不再自動補 `(未知客戶)`
- 舊匯入路徑改為先驗證，再建立 payload。

### 2. 型別安全與資料層
- `equipments.ts` 移除高風險 `as any`，改成 `readEquipmentDoc()` / `mapEquipmentRow()`。
- `users.ts` 移除 `as any`，改成明確讀取 helper。
- `installations.ts` / `equipments.ts` / `settings.ts` / `audit.ts` / `logs.ts` / `telemetry/track.ts` / `AuthProvider.tsx` 收斂 collection 常數來源。

### 3. 安全與時間戳
- `AuthProvider.ensureUserProfile()` 補上 `updatedAtServer`。
- `equipments.seedDemoEquipments()`、`migrateEquipmentNameToSerialNo()` 補上 `updatedAtServer` / `createdAtServer`。
- 保留 `updatedAt` 數字欄位做前端相容排序，但所有正式寫入都同步寫入 server timestamp。

### 4. Schema / 驗證契約
- `schemas.ts` 改用 `emptyableString()`，移除 `.optional() + .or(z.literal(""))` 的重複語義。
- `equipmentSchema` 改直接引用 `EQUIPMENT_MAIN_STATUSES`、`CAPACITY_LEVELS`，避免 enum 重複定義。

### 5. 效能與穩定性
- `WarRoomPage` 區域統計改成單次走訪聚合，不再每區反覆 filter。
- `installPhase.ts` 將 phase->seq map 提升到模組層常數。
- `useComposition.ts` 補上 unmount cleanup，避免 timer 殘留。
- `ThemeProvider` 加入 localStorage try/catch，避免受限環境直接炸掉。
- `previewMigrateEquipmentNameToSerialNo()` 預設掃描量從高上限收斂，避免為了只顯示少量 sample 讀太多文件。

### 6. 版號
- `package.json` / `package-lock.json` 更新為 `20260331-F52`。
- UI 仍以 `package.json.version` 為唯一來源。

## 靜態檢查
- 已對本次修改檔案做 TypeScript `transpileModule` 語法檢查：通過。
- 本容器未完成完整 `next build` / 全量執行驗證，故不宣稱完成完整建置驗證。
