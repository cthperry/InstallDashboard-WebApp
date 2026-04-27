# F51 修正摘要

版本：20260331-F51

## 本次一次修復重點
- 版號維持單一來源：`package.json.version`
- `schemas.ts` 拆出 `installationBaseSchema`，避免後續共用 schema 時再分裂
- `audit.ts` 不再空 catch，寫入失敗會輸出錯誤
- `useDashboardData` 拆分多個 `useEffect`，避免 section / admin 狀態切換時整批 listener 全重建
- `logs.ts` 刪除流程改為 `writeBatch`，降低大量逐筆刪除成本
- Excel 日期字串支援 `YYYY/MM/DD`、`YYYY.MM.DD`、`YYYY年M月D日`
- 匯入不再自動塞入 `—` / `(未知客戶)` 這類 placeholder 寫進正式資料
- SmartImport / 舊 ImportExcel / ImportEquipment 都補上 `FileReader.onerror`
- SmartImport 預覽表改為左側關鍵欄 sticky，並收斂欄寬，避免最後幾欄被切掉
- equipments / smart import 補齊 `createdAtServer`、`updatedAtServer`
- Firestore rules 增加 installations / equipments 的基本欄位與型別驗證

## 仍需你實機確認
1. 智慧匯入預覽最後欄位是否可完整看到
2. Excel 文字日期用 `/` 或 `.` 匯入後是否能正確保留
3. 匯入缺客戶/機型/設備序號時，是否會直接提示而不是寫入假值
4. 右上角 UI 版號是否顯示 `v20260331-F51`
