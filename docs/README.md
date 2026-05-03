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
- Excel 依裝機階段分流：未正式量產保留在 `installation`，正式量產且有機台序號直接轉入 `equipment`
- `actComplete` 只寫入設備 milestone，不再作為轉設備台帳的必要條件
- `installation` 以 `importKey` 與 `serialKey` 做 upsert / 去重，避免重複匯入時產生重複案件
- `equipment` 以 `serialKey` 去重 / 更新，`serialNo` 保留為使用者可讀序號

## Firebase 設定（必要）
1. 啟用 Authentication
2. 建立 Firestore Database
3. 套用根目錄 `firestore.rules`
4. 首次登入後，可於 `users/{uid}` 將 `role` 設為 `admin`
