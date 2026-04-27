# F62 匯入邏輯回復（對齊 F42）

## 本次目標
依你要求，比對 **F42（正確）** 與目前版本的匯入/轉移邏輯，將偏掉的地方拉回單一規則來源。

## F42 正確規則
1. 同一套 app，只是不同資料輸入方式。
2. 裝機生命週期規則只能有一套。
3. `released / 正式量產` 後：
   - 從 `installations` 移除
   - 轉入 `equipments`
   - 不可同時存在兩邊
4. 匯入、手動建立、編輯、階段推進，都必須共用同一套規則。

## 這次找到的 root cause
### 1. Smart Import 與手動流程沒有共用同一套生命週期判定
先前 Smart Import：
- 先依 Excel 日期初判 `_createEquipment`
- 但使用者手動改 `phase` 後，`_createEquipment` 不會同步重算
- 造成畫面 phase 與實際寫入目標可能不一致

### 2. 匯入驗證沒有完整承接建立案件的既有契約
先前匯入驗證只檢查：
- 客戶
- 機型
- 日期前後順序
- 設備台帳缺序號

但沒有完整套用案件建立時就已存在的規則：
- 出貨後階段序號必填
- 出貨後階段工程師必填
- 已安裝後需有實際安裝日期
- released 需有驗收完成日期

### 3. released 轉設備時只刪一筆 matching installation
若 Firestore 內已存在同序號的多筆 installation，先前只刪掉第一筆，其他重複 installation 仍會殘留。

## 本次修正
### A. 收斂成單一匯入生命週期判定
新增共用判定：
- `src/domain/importRules.ts -> resolveWorkbookImportDisposition()`

所有匯入入口都改成共用這個結果：
- phase
- progress
- 是否轉設備
- 是否保留 installation

### B. Smart Import 改回 F42 規則
`src/features/dashboard/SmartImportModal.tsx`

現在改成：
- 若 lifecycle 判定為 released transfer：
  - 不建立 installation
  - 改建立 transfer（installation identity + equipment payload）
- 若不是 released transfer：
  - 只建立/更新 installation

另外修正：
- 使用者在預覽表手動改 `phase` 時，會同步重算匯入目標
- 不再出現 phase 已改、但匯入目標還停留舊狀態

### C. 舊 Excel 匯入也套用同一套規則
`src/features/dashboard/ImportExcelModal.tsx`

現在改成：
- phase/progress 用同一套 lifecycle 判定
- 若資料已屬 released transfer，直接阻擋並提示改用 Smart Import
- 不再自己維護另一套判定

### D. 匯入驗證改用建立案件既有契約
`src/domain/importRules.ts -> validateWorkbookRow()`

現在會共用：
- `getInstallationValidationIssues()`

因此匯入也會遵守：
- 出貨後序號必填
- 出貨後工程師必填
- install started 要有實際安裝日期
- released 要有驗收完成日期

### E. transfer 時會刪除所有 matching installation，不只一筆
`src/features/data/installations.ts`
`src/features/dashboard/services/smartImportService.ts`

現在改成：
- 依 `importKey` / `serial` 找到所有 matching installation doc ids
- 保留 installation 匯入時：
  - 更新 primary doc
  - 刪除其餘重複 installation
- released transfer 時：
  - 刪除所有 matching installation
  - 再 upsert equipment

## 修正後資料流
### 裝機案件匯入
Excel
-> `parseWorkbookJsonRows()`
-> `resolveWorkbookImportDisposition()`
-> `validateWorkbookRow()`（共用 installation 契約）
-> `commitSmartImportBatch({ installations, transfers: [] })`
-> Firestore `installations`

### 智慧匯入 released transfer
Excel
-> `parseWorkbookJsonRows()`
-> `resolveWorkbookImportDisposition()`
-> `validateWorkbookRow()`
-> `commitSmartImportBatch({ installations, transfers })`
-> 刪除所有 matching `installations`
-> upsert `equipments`

## 已修改檔案
- `src/domain/installPhase.ts`
- `src/domain/importRules.ts`
- `src/features/data/installations.ts`
- `src/features/dashboard/services/smartImportService.ts`
- `src/features/dashboard/SmartImportModal.tsx`
- `src/features/dashboard/ImportExcelModal.tsx`
- `package.json`
- `package-lock.json`
- `src/generated/appBuild.ts`
- `public/version.json`
- `public/sw.js`

## 已做檢查
- `node scripts/sync-app-version.cjs`：通過
- `node scripts/verify-version-source.cjs`：通過
- `npx tsc --noEmit`：目前停在環境缺少 `@types/node`，未取得完整型別檢查結束狀態

## 需要你實機驗證
1. 同一份正式量產 Excel 再匯一次：
   - `installations` 不可殘留同序號資料
   - `equipments` 只保留一筆同序號設備
2. 預覽表手動改 phase：
   - 匯入目標是否同步切換
3. 出貨後但缺序號／缺工程師資料：
   - 匯入是否被正確擋下
4. released 匯入後：
   - 裝機與設備台帳不可同時存在同一序號
