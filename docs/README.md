# Install-Operations（Next.js WebApp）

## 專案定位
這是 **Install-Operations** 的 Next.js App Router 專案，根目錄即為 WebApp 專案根目錄，**不是 `web/` 子資料夾結構**。

## 版本規則
- App 版本唯一來源：`package.json -> version`
- UI 顯示版本、`public/sw.js`、`public/version.json` 均由 script 自動產生
- 不可在 `.env`、README、UI 程式碼中手寫 App 版本字串

## 快速啟動
```bash
npm install
npm run dev
```

## 環境變數
請在**專案根目錄**建立 `.env.local`：

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_GA_MEASUREMENT_ID=
```

也可直接複製 `.env.example` 為 `.env.local` 後再填值。

## 匯入規則
- 每一列 Excel 一律先進 `installation`
- 若同列已具備「驗收完成日期 + 機台序號」，再另外同步 `equipment`
- installation 以 `importKey` 做 upsert，避免重複匯入時產生重複案件
- equipment 以 `serialNo` 去重 / 更新

## Firebase 設定（必要）
1. 啟用 Authentication
2. 建立 Firestore Database
3. 套用根目錄 `firestore.rules`
4. 首次登入後，可於 `users/{uid}` 將 `role` 設為 `admin`
