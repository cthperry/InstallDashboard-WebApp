# PREMTEK 裝機戰情室

PREMTEK 內部使用的設備裝機管理系統，用於追蹤裝機案進度、設備狀態、SLA 逾期警示與稽核紀錄。

## 技術棧

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript
- **資料庫**: Firebase Firestore（即時同步）
- **驗證**: Firebase Authentication（限 @premtek.com.tw 帳號）
- **部署**: Vercel

## 快速開始

### 1. 安裝依賴

```bash
cd web
npm install
```

### 2. 設定環境變數

```bash
cp .env.example .env.local
# 編輯 .env.local，填入 Firebase 設定
```

### 3. 啟動開發伺服器

```bash
npm run dev
# 開啟 http://localhost:3000
```

## 專案結構

```
web/src/
├── app/
│   ├── api/parse-excel/   # Excel 匯入 API（需 Firebase Auth token）
│   ├── dashboard/
│   │   ├── components/    # 各面板元件（Warroom/Installs/Equipment…）
│   │   ├── page.tsx       # 主頁面（資料訂閱 + 狀態管理）
│   │   └── utils.ts       # 純函式工具（日期、統計、CSV 匯出）
│   └── login/             # 登入頁
├── domain/
│   ├── constants.ts       # 階段/地區/checklist 常數
│   ├── regionUtils.ts     # 地區推斷共用邏輯（前後端共用）
│   ├── schemas.ts         # Zod 驗證 schema
│   └── types.ts           # TypeScript 型別定義
├── features/
│   ├── auth/              # Firebase Auth + RequireAuth guard
│   └── data/              # Firestore CRUD（installations/equipments…）
└── version.ts             # 版號（每次發布必須更新）
```

## 版號規則

每次提交前必須更新 `web/src/version.ts`：

```typescript
export const APP_VERSION = "1.0.x"; // patch: bug fix / minor: 新功能 / major: 重大改版
```

## Firestore Collections

| Collection   | 說明                     |
|--------------|--------------------------|
| `installations` | 裝機案資料               |
| `equipments`    | 設備狀態資料             |
| `auditLogs`     | 稽核紀錄（action log）   |
| `users`         | 使用者 profile + 角色    |
| `settings/appVariables` | 工程師/客戶/地區 mapping |
| `settings/machineModels` | 機型清單               |

## 部署

詳見 [DEPLOY.md](./DEPLOY.md)。

## 安全設計

- 登入限制：僅 `@premtek.com.tw` 帳號可登入
- API Route 驗證：`/api/parse-excel` 需附帶有效的 Firebase ID Token
- Admin 功能（設定頁）：僅 `role: "admin"` 的帳號可見
- 首次登入強制修改密碼（Email/Password 帳號）
