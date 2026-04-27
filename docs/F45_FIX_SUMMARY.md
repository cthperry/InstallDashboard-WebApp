# F45 修正摘要

## 本次已修改

### 1. 裝機表單驗證契約收斂
- `engineer` 從 schema 的全域必填移除，改由 `installationContract` 做階段式驗證。
- 新增/收斂規則：
  - `ordered`：不強制機台序號、工程師、安裝/驗收日期。
  - `shipping` / `arrived`：強制機台序號、工程師。
  - `installing` / `trial` / `qual`：再強制 `actArrival`。
  - `released`：再強制 `actComplete`。
- 新增日期格式與日期前後關係檢查：
  - `預計出貨日 <= 預計安裝日`
  - `實際安裝日期 <= 驗收完成日期`

### 2. `actArrival` 語意修正
- `actArrival` 正式視為「實際安裝日期 / 開始安裝日期」。
- equipment milestone 改為：
  - `actArrival -> installStart`
  - `actComplete -> prodStart`
- 不再把 `actArrival` 寫入 `installDone` / `trialStart`。

### 3. phase 自動推論修正
- `actArrival` 不再直接推到 `trial`，改為 `installing`。
- 補上 `arrived` 可達路徑，避免流程節點變成死節點。

### 4. 機型 canonical / 下拉判斷修正
- `hasMachineModelCode()` 改成只用正式 `code` 判斷，不再把 `displayName` 當成 `<option value>` 來判斷。
- 裝機表單與設備表單移除 `（舊）` fallback 顯示。
- SmartImport 解析 Excel 時，改為吃目前畫面的 `machineModels` 清單，避免只靠預設字典。

### 5. SmartImport 改成單批原子寫入
- 新增 `smartImportService.ts`，使用 Firestore `writeBatch`。
- 同一次匯入中：
  - 任一列前置驗證失敗時，整批不寫入。
  - 單次上限 450 筆，避免超過 Firestore batch 上限。
- 預覽表格手動修改的 `_phase` / `_status` 會真正套用到寫入 payload。

### 6. Dashboard listener 收斂
- `useDashboardData` 改成依 `section` 控制 retention / auditLogs / events listener。
- 非 insights 頁不再建立這三條 listener。

## 本次靜態檢查
- 已對本次修改的 TS / TSX 檔做 TypeScript parser 語法檢查：通過。
- 未完成 `next build`：此容器缺少專案依賴與型別套件，無法誠實宣稱完整建置驗證已完成。

## 需要實機驗證
1. `訂單確認` 階段只改日期可儲存。
2. `訂單確認` 階段只改工程師可儲存。
3. 匯入 `FlexTRAK-S` 後，進編輯表單仍為 `FlexTRAK-S`，不再出現 `（舊）`。
4. SmartImport 手動改 phase/status 後，匯入結果應與預覽一致。
5. `actArrival > actComplete` 時，表單會明確提示錯誤。
