# 裝機狀態 Dashboard（WebApp）部署與設定

版本：20260228-F4

> 結構：
> - `web/`：Next.js WebApp
> - `docs/`：文件、Rules、範本設定檔

---

## 0) 已實作的核心需求
- WebApp：支援行動裝置與桌機（RWD）
- Firebase Auth：僅允許 `@premtek.com.tw` 登入
- 機型：
  - 內建預設：FlexTRAK-S、AP-1000、ExoSPHERE
  - 管理者可用 JSON 設定檔新增/更新機型
- 設備狀態：
  - equipments：設備狀態資料（可 CRUD；admin 可匯入示範資料）

- logs + analytics：
  - `auditLogs`：稽核操作紀錄
  - `events`：行為事件（可搭配 GA4）

---

## 1) Firebase Console 設定

### 1.1 建立 Firebase Project
啟用：
- Authentication
- Firestore Database

### 1.2 Authentication（Google + Email/Password）
- Sign-in method：啟用「Google」與「Email/Password」
- 帳號建立方式（建議）：
  - Google：直接使用公司 Google 帳號登入（必須是 @premtek.com.tw）
  - Email/Password：由管理者在 Firebase Console → Authentication → Users 先建立公司使用者（email/password）

### 1.3 Firestore Rules
把 `docs/firestore.rules` 貼到 Firebase Console → Firestore → Rules，然後 Publish。

> 真正安全控管以 Rules 為準；前端只做 UX 層的網域檢查。

---

## 2) 指派 admin
1. 先用公司帳號登入一次（系統會自動建立 `users/{uid}`）
2. Firestore → users → 找到你的 uid 文件 → 把 role 改成 `admin`

---

## 3) 設定環境變數（web/.env.local）
已提供範本（不含機密），請填入 Firebase Web App 設定。

> 注意：Next.js 的 NEXT_PUBLIC_* 變數必須使用 `process.env.NEXT_PUBLIC_XXX` 靜態存取，
> 不可用 `process.env[name]` 動態 bracket notation（否則 bundler 無法注入值）。

---

## 4) 本機啟動
```bash
cd web
npm install
npm run dev
```
開啟：http://localhost:3000

---

## 5) 部署（Vercel 建議）
- 專案 Root Directory 指向 `web/`
- Vercel 設定 Environment Variables（把 `.env.local` 裡的值填進去）
- 部署後回 Firebase Authorized domains 加入新網域

---

## 6) 套用機型設定檔
- admin 登入
- Dashboard → 管理：機型設定
- 貼上 JSON（參考 `docs/machine-models.sample.json`）→ 套用

---

## 7) 你下一步最可能要加的東西（我已先留好資料管道）
- 增加欄位：Site、SN、PO、ETA/ETC、SLA
- 附件：Google Drive 或 Firebase Storage
- 手機版卡片視圖（目前先採表格可橫向滑動）
- 「套用設定檔」改為 Cloud Functions（更強的後端可信驗證）
