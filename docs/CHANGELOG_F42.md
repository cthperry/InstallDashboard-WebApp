# Install-Operations F42 變更摘要

## 本次範圍
本版先執行 **Phase 0 + Phase 1**，目標是先把裝機生命週期規則與 released 轉設備台帳流程收斂，暫不擴大 UI 重做。

## 已修改

### 1. 鎖定單一規則來源
新增與收斂下列核心規則到共用邏輯：
- 序號何時必填
- released 判定
- released 後是否應轉設備台帳
- phase 對應 progress 規則
- phase 推進時的 released 轉移規則

調整檔案：
- `src/domain/installPhase.ts`
- `src/domain/schemas.ts`
- `src/features/dashboard/services/installationLifecycleService.ts`

### 2. 抽出 released → equipment transfer service
新增：
- `src/features/dashboard/services/equipmentTransferService.ts`

已把以下邏輯集中：
- 依序號查既有設備
- 有相同序號就更新
- 沒有相同序號就新增
- released 後自裝機進度移除
- 寫入對應 audit log
- 統一 toast 文案來源

### 3. 抽出 Dashboard data hook
新增：
- `src/features/dashboard/hooks/useDashboardData.ts`

已把 `DashboardWorkspace.tsx` 內原本分散的 listener 收斂成單一 hook：
- appVariables
- retention settings
- machine models
- installations
- equipments
- audit logs
- events
- users

### 4. 修正 released 流程只在 submitInstall 生效的風險
原本 `advanceInstall()` 只做 phase update，可能繞過 released → equipment transfer。

本版已改為：
- 推進階段時先走共用 lifecycle 驗證
- 若推進後到 released，直接走共用 transfer service
- 避免出現「phase 已到 released，但資料還留在裝機進度」的偏差

### 5. 匯入/phase progress 共用規則對齊
已讓舊 Excel 匯入的 phase / progress 推算改用共用規則來源：
- `src/features/dashboard/ImportExcelModal.tsx`

### 6. 移除 build 時對 Google Fonts 的外部依賴
`src/app/layout.tsx` 已移除 `next/font/google`，改回走 CSS fallback 字型堆疊，避免在無外網環境 build 時卡在 Google Fonts 解析。

### 7. 匯入與設備狀態文字修正
已將誤植的 `正式上產中` 全面修正為 `正式生產中`，並同步更新：
- domain constants / schema / types
- Smart Import / 舊設備匯入
- 設備台帳統計與顯示
- released 後設備狀態寫入

## 版本
- App Version: `20260329-F42`

## 已做靜態檢查
- `tsc --noEmit`：**通過**
- Next build：
  - 已確認可通過 `Compiled successfully`
  - 後續在 `Checking validity of types / linting` 階段，CLI 在本容器環境未回傳完整結束狀態
  - 目前以 `tsc --noEmit` 通過作為主要型別靜態檢查依據

## 需要實機驗證
1. `ordered` 階段只改工程師是否可正常儲存
2. `shipping` 之後未填序號是否正確擋下
3. 表單儲存成 `released` 後是否：
   - 更新既有設備或新增設備
   - 自裝機進度移除
4. 使用「推進階段」推到 `released` 時，是否同樣正確轉移
5. SmartImport / 舊匯入流程的 phase / progress 是否符合預期

## 尚未確認
1. 舊匯入 modal 是否要在下一版直接移出主要流程
2. `useDashboardData` 是否還要再往下拆成 install/equipment/settings 多個 hook
3. `DashboardWorkspace.tsx` 其餘非核心 UI/統計區塊的再拆分
