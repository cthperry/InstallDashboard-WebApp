# F65 Aurora Executive UI Refresh

## 版本
- Base：F64 `20260403-F64`
- Output：F65 `20260427-F65`

## 修改目標
將 F64 版本的實際 App 介面改成 A 方案：`Aurora Executive` 淡色玻璃戰情室。

## 已修改
- 全站色系由原紫色/偏沉重風格，調整為淡藍灰、白色玻璃感、低飽和企業級視覺。
- Dashboard topbar、tabs、按鈕、卡片、資料表、篩選器、輸入欄位全面套用 Aurora 視覺語言。
- 裝機頁 hero 文案改為「裝機營運戰情室」。
- 裝機頁 KPI、篩選/操作面板、資料表、卡片視圖、Pipeline/Kanban 視圖套用 Aurora 樣式。
- 保留 F64 匯入鍵修正、released 轉設備台帳與既有資料流程，未改動業務邏輯。
- 版本來源同步至 `20260427-F65`。

## 已做靜態檢查
- `node scripts/verify-version-source.cjs`
- `node scripts/sync-app-version.cjs`
- `node scripts/verify-version-source.cjs`
- `node --check scripts/sync-app-version.cjs`
- `node --check scripts/verify-version-source.cjs`
- `node --check scripts/write-build-version.cjs`
- `node --check scripts/verify-build-version.cjs`
- ZIP 結構檢查：解壓後為單層根目錄。

## 需要實機驗證
- `npm install`
- `npm run build`
- Vercel 發佈後開啟 `/dashboard/install`
- 檢查桌機/手機版面是否符合 Aurora A 方案。
- 實測 Excel 智慧匯入、出貨後序號必填、released 轉設備台帳。

## 尚未確認
- 本環境未安裝 `node_modules`，因此未執行 Next.js build 或瀏覽器層驗證。
