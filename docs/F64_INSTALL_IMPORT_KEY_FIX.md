# F64 裝機匯入鍵修正

## root cause
F59 之後為了避免重複匯入，installation 在無序號時改用 customer/model/date/engineer 組合成 importKey。
這會把同一客戶、同一機型、同日期的多台裝機案件錯誤合併成一筆，違反 F42「一列 Excel = 一筆裝機案件」規則。

## 修正
- 無序號 installation 改為使用 `Excel 來源列鍵` 作為 importKey
- 鍵格式：`excel-row:customer|model|engineer|excelRow`
- 同一份 Excel 重匯時會更新同列資料
- 不同列即使 customer/model/date 相同，也不再互相合併

## 影響
- SmartImportModal
- ImportExcelModal
- installations importKey fallback
