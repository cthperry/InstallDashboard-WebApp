# Install-Operations F43 變更摘要

- App Version: `20260330-F43`
- 日期欄位統一為：預計出貨日／預計安裝日／實際安裝日期／驗收完成日期
- 裝機案表單日期欄位改為原生日曆輸入（`type="date"`）
- 裝機案機型下拉補上舊值 fallback，避免 `FlexTRAK-S` 在編輯時誤顯示成第一個選項
- 裝機案表單儲存前改走單一契約：`installationContract`，統一欄位正規化、機型正規化、日期正規化、階段驗證
- `machineModels` 改為合併 Firestore 設定與內建預設，避免設定異動導致既有機型消失
- 型號清洗邏輯改為共用 `machineModels` 規則，移除重複定義
- `trimString / normalizeString` 抽到 `src/lib/utils.ts`
- Equipment milestone 對應改為共用 `equipmentMilestones` 規則，避免匯入與轉換邏輯分岐
