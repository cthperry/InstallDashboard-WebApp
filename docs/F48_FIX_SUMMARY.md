# F48 修正摘要

## 本次修正

### 1. 版號來源收斂為單一來源
- UI 顯示版號改為直接讀取 `package.json.version`
- 移除 `next.config.ts` 內獨立的 `NEXT_PUBLIC_APP_VERSION` 寫死值
- 目前產品顯示版號唯一來源：`package.json`

### 2. Excel 智慧匯入預覽寬度與欄位顯示收斂
- Modal 最大寬度改為接近滿版視窗，減少被外框吃掉的可視空間
- 預覽表格改為固定欄寬與較緊湊配置
- 日期欄維持單行顯示
- 客戶欄保留多行換行，其餘關鍵欄位維持單行
- 選單欄寬改為跟隨欄位寬度，不再額外撐寬整張表
- 預覽表格最小寬度由 1560 下修至 1360

## 實際修改檔案
- `package.json`
- `src/app/layout.tsx`
- `next.config.ts`
- `src/features/ui/Modal.tsx`
- `src/features/dashboard/SmartImportModal.tsx`
