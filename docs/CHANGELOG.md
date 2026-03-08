# CHANGELOG

## 20260228-F7（2026-02-28）
- Pipeline：改為「桌機多欄並列、手機橫向捲動」並強化卡片資訊（進度條、工程師、預計完成提示、快速推進）
- 分析：參考 dashboard.html 的分析區塊概念移植（階段分佈、區域進度、工程師工作量、逾期/即將到期），並在無資料時顯示提示
- 紀錄：新增 admin「清除設定」與按鈕（依保留天數清除 / 清除全部），並加入「定時清除（可設定時間，前端觸發）」
- Rules：允許 admin 刪除 auditLogs/events（支援清除功能；注意這會降低稽核不可竄改性）
- UI：新增 CSS 隱藏 Next.js dev 指示器（#__next-build-watcher）
- 表單：裝機案欄位「設備名稱」改為「機台序號」（欄位仍儲存於 name）

## 20260228-F6（2026-02-28）
- 設定：採用「混合式」設定策略（程式內建預設 + Firestore 覆蓋）
  - engineers/customers：若 Firestore settings/appVariables 未設定，改用程式內建預設清單
  - machineModels：維持既有預設（FlexTRAK-S / AP-1000 / ExoSPHERE）
- UI：設備表單 Owner 欄位改用工程師清單建議選項（datalist）
- 規則：設備稼動率（utilization）輸入新增 0~100 範圍限制（UI clamp）
- Dev：關閉 Next.js 開發模式左下角「N」指示器（devIndicators.buildActivity=false）

## 20260228-F5（2026-02-28）
- 設定檔：新增 settings/appVariables（工程師、客戶）並提供管理頁 /admin/variables（admin 可套用 JSON）
- 表單：工程師/客戶改為 datalist 建議選項（仍允許手動輸入）
- 篩選：裝機進度新增「客戶」下拉篩選（資料來源同 appVariables）
- 驗證：裝機進度 progress 限制 0~100（UI min/max + clamping；Firestore Rules 也限制）
- UI：預設改為 Light theme（移除強制 html.dark；ThemeProvider defaultTheme=light；調整 Token）

## 20260228-F4（2026-02-28）
- 登入：同時支援 Google 與 Email/Password（同一頁面）
- UI：登入頁依「內部裝機/設備管理工具」用途重整版面（清楚說明功能/權限/限制）
- 相容：Google Popup 被阻擋時自動改用 Redirect（更適合行動裝置）

## 20260228-F3（2026-02-28）
- 修正：Firebase client 端環境變數改為「靜態」`process.env.NEXT_PUBLIC_XXX` 存取，避免 Turbopack/Webpack 無法注入值
- 登入：改為 Email + 密碼表單（Firebase Auth Email/Password）
- 文件：更新部署/設定說明（含 Email/Password 與環境變數注意事項）

## 20260228-F2（2026-02-28）
- UI：整套移植 equipment-dashboard.zip 的 Design System（Tailwind v4 + shadcn/ui + Radix UI + Sonner + Vaul）
- 全站：加入 ThemeProvider（預設 dark）+ TooltipProvider + Toaster
- UI：Login / 首頁 / Admin（機型設定）改為 Design System 元件
- 相容層：保留舊版 Dashboard JSX 的 className（btn/card/table/topbar…）並映射到新 Token，降低改動風險
- 技術：新增 Tailwind v4（postcss.config.mjs、tailwind.config.ts）與 @/* alias 支援

## 20260228-F1（2026-02-28）
- 融合多版本優點：新增「設備狀態」模組（區域 Tabs / KPI / 篩選 / 詳細抽屜 / 趨勢）
- 裝機進度：加入卡片/表格切換、CSV 匯出、工程師篩選、KPI（平均進度/逾期提示）強化
- 分析：整合裝機 + 設備 KPI 與近 7 天事件統計
- Logs：整合顯示 auditLogs + events（events 僅 admin 可讀）
- Firestore：新增 equipments collection 與示範資料匯入（僅 admin）


## 20260228-A2（2026-02-28）
- Dashboard UI 全面改版：加入 Tabs（裝機進度 / Pipeline / 分析 / 紀錄）
- Pipeline：依階段 Kanban 分欄（手機左右滑動）
- 分析：平均進度、階段分佈、近 7 天 events 統計
- 紀錄：直接在 Dashboard 顯示 auditLogs（稽核紀錄）

## 20260228-A1（2026-02-28）
- 建立 Next.js（App Router）+ TypeScript WebApp 架構
- Firebase Auth：Google 登入 + 強制限制 @premtek.com.tw
- Firestore：
  - installations：裝機設備清單 CRUD（Dashboard）
  - settings/machineModels：管理者套用機型設定檔（JSON）
  - users：角色（admin/user）
  - auditLogs / events：logs + analytics
- RWD：桌機表格；手機可橫向滑動表格
