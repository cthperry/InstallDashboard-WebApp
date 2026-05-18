# F75 Quick Input UX

## 版本

- Base：F74 20260515-F74
- Output：F75 20260518-F75

## 修改目標

降低 Install Operations 的日常輸入負擔，讓使用者先用少量必要欄位建立或維護資料，再於需要時補完整時程、檢查清單與備註。

## 已修改

- 裝機案新增 / 編輯表單改為「快速新增」結構：
  - 預設顯示客戶、區域、機型、階段、機台序號、工程師。
  - 時程、進度、檢查清單、聯絡資訊與備註改為分段收合。
  - 階段切換時自動帶入對應進度。
  - 表單頂部顯示目前階段提示與進度摘要。
- 客戶輸入若命中客戶清單，會自動帶入區域。
- Excel 智慧匯入預覽改為例外優先：
  - 顯示總列數、可直接處理、需確認、目前顯示。
  - 預設只顯示需人工確認的列。
  - 正常列仍維持選取，可直接一起匯入。
  - 異常原因直接顯示在列上，減少橫向掃描成本。
- 補上對應的表單、檢查清單與匯入摘要樣式。
- 版本來源同步至 20260518-F75。

## 已做靜態檢查

- npm install
- npm run lint
- npm run sync:version
- npm run verify:version
- npm run build
- 本機補 .env.local 測試用 Firebase public env 後，/login 與 / HTTP 200。
- Playwright Chromium 截圖 /login 成功：/tmp/install-dashboard-f75-login.png。
- tsx 驗證 F75 helper：
  - 客戶名稱可由 customerRegionMap 推導區域。
  - released 階段提示包含轉設備台帳。
  - Excel 匯入異常列可抓出缺客戶、缺機型、日期順序錯誤、區域需確認。

## 需要實機驗證

- 開啟 /dashboard/install?view=pipeline，測試新增裝機案：
  - 客戶命中清單時是否自動帶區域。
  - 階段切換時進度與必填提示是否正確。
  - 時程 / 檢查清單 / 更多資料收合區是否可正常編輯。
- 開啟 Excel 智慧匯入，測試正常列與異常列的顯示切換。

## 尚未確認

- 未使用真實 Firebase 帳號登入，因此尚未在真實資料上新增 / 編輯裝機案。
- 需連線實際 Firebase 資料後確認客戶清單命中率與真實 Excel 欄位覆蓋率。
