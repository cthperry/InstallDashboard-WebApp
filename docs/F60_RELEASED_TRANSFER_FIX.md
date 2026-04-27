# F60 正式量產轉移修正

## 問題 root cause
目前重複出現在「裝機進度 + 設備台帳」的真正原因，不是 UI，而是 **Excel 智慧匯入流程繞過了 installation -> equipment 的生命週期轉移規則**。

原本手動編輯 / 推進時，`DashboardWorkspace.tsx` 會在裝機案進入 `released`（正式量產）時呼叫：

- `transferReleasedInstallationToEquipment()`
- 建立或更新 `equipments`
- 刪除 `installations`

但 Excel 智慧匯入走的是另一條資料流：

`Excel -> SmartImportModal -> commitSmartImportBatch() -> Firestore`

這條匯入路徑先前直接：

- 寫入 / 更新 `installations`
- 同時寫入 / 更新 `equipments`

因此正式量產列會被 **雙寫**，造成同一台設備同時存在於：

- `installations`
- `equipments`

這就是本次重複顯示的根因。

## 本次修正

### 1. service 層強制套用正式量產轉移規則
修改：`src/features/dashboard/services/smartImportService.ts`

現在 `commitSmartImportBatch()` 在寫入 Firestore 前，會先判斷 installation row 是否屬於：

- `phase === released`
- 且 `name(serial)` 有值

若成立，則：

- **不建立 / 不更新 installation**
- 若既有 installation 已存在，則 **batch.delete** 移除
- 只保留 / 更新對應 `equipment`

### 2. 匯入預覽文案改正
修改：`src/features/dashboard/SmartImportModal.tsx`

原本錯誤文案是「每列都會先進裝機案件，再同步設備」。
現在改為：

- 未正式量產：留在裝機案件
- 正式量產且有序號：直接轉入設備台帳，且不保留裝機案件

### 3. installation-only Excel 匯入加上阻擋
修改：`src/features/dashboard/ImportExcelModal.tsx`

此模式只匯入裝機案件。
若資料已屬正式量產，現在會直接提示：

- 請改用「Excel 智慧匯入」

避免 installation-only 模式誤把正式量產資料寫進裝機案件。

### 4. toast 結果改正
修改：`src/features/dashboard/DashboardWorkspace.tsx`

匯入完成提示新增：

- 裝機保留新增 / 更新
- 設備新增 / 更新
- 自裝機移除幾筆

## 修正後資料流

### 未正式量產列
`Excel -> SmartImportModal -> commitSmartImportBatch() -> installations`

### 正式量產列（驗收完成 + 序號）
`Excel -> SmartImportModal -> commitSmartImportBatch() -> equipments`
並同步：
`delete installations(existing matched row)`

## 單一版本來源
仍維持：

- 唯一版本來源：`package.json.version`
- `src/generated/appBuild.ts`
- `public/version.json`
- `public/sw.js`

皆由 script 自動產生。

## 已修改檔案
- `package.json`
- `package-lock.json`
- `src/features/dashboard/services/smartImportService.ts`
- `src/features/dashboard/SmartImportModal.tsx`
- `src/features/dashboard/ImportExcelModal.tsx`
- `src/features/dashboard/DashboardWorkspace.tsx`
- `src/generated/appBuild.ts`
- `public/version.json`
- `public/sw.js`

## 驗證
已完成：
- `node scripts/sync-app-version.cjs`
- `node scripts/verify-version-source.cjs`

未在此容器完成：
- `npm run build`

原因：此環境未安裝專案依賴，無法在容器內做完整 Next build 驗證。
