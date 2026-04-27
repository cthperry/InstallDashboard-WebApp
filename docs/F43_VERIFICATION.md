# F43 驗證紀錄

## 已做
- 全域搜尋舊日期 label，確認已移除：實際出貨日／預計完工日／實際完工日
- 全域搜尋重複 `trimString / normalizeString`，確認已收斂到 `src/lib/utils.ts`
- 裝機案表單改為共用 `installationContract`
- 裝機案機型下拉補上舊值 fallback
- 日期欄位改為 `DateInput`（原生日曆輸入）

## 未完成
- 未在此容器完成 `next build`
- 原因：專案依賴未安裝，缺少 React / Next / Firebase 型別與套件，無法在容器內做完整型別編譯與建置驗證

## 需要你實機確認
1. 匯入 `FlexTRAK-S` 後，再進入裝機案編輯表單，機型仍顯示 `FlexTRAK-S`
2. 訂單確認階段，僅修改工程師後可正常儲存
3. 四個日期欄位可點日曆並正常寫回 Firestore
4. 舊資料若 machine model 不在 settings 清單內，表單仍顯示舊值，不會跳成第一個選項
