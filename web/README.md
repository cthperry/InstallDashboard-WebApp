# web（Next.js WebApp）

版本：20260228-F2

## 模組
- Dashboard
  - 📋 裝機進度（表格/卡片、篩選、CSV 匯出、CRUD、推進階段）
  - 🔄 Pipeline（Kanban）
  - 🧩 設備狀態（區域/狀態/容量篩選、KPI、詳情抽屜、CRUD；admin 可匯入示範資料）
  - 📈 分析（裝機 + 設備 KPI、近 7 天 events）
  - 📝 紀錄（auditLogs；events 僅 admin）

## 快速啟動
```bash
npm install
npm run dev
```

## 環境變數
請先填寫 `web/.env.local`（已提供範本，不含機密）。

- `NEXT_PUBLIC_APP_VERSION`：顯示用版本號
- `NEXT_PUBLIC_FIREBASE_*`：Firebase Web App 設定
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`：可選（GA4）

## Firebase 設定（必要）
1. 啟用 Authentication → Google
2. 建立 Firestore Database
3. 套用 `docs/firestore.rules`
4. 首次登入後，於 `users/{uid}` 將 `role` 設為 `admin`（才能使用「管理：機型設定」與「匯入示範設備資料」）

## UI/Design System
- 已整套移植 equipment-dashboard.zip 的 Design System（Tailwind v4 + shadcn/ui + Radix UI + Sonner + Vaul）。
- 保留舊版 Dashboard JSX 的 className（透過 globals.css 的 compatibility layer 映射到新 Token），降低改動風險。
