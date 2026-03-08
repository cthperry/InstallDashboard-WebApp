# 部署說明：GitHub + Vercel

## 步驟 1 — 取得 GitHub Personal Access Token（PAT）

1. 前往 https://github.com/settings/tokens/new
2. Note（備註）：`InstallDashboard deploy`
3. Expiration：依需求選擇（建議 90 days）
4. Scopes 勾選：**`repo`**（完整 repo 存取）
5. 點「Generate token」，**複製 token**（只顯示一次）

---

## 步驟 2 — 推送到 GitHub（在你的電腦終端機執行）

開啟終端機，`cd` 到本資料夾：

```bash
cd "你的資料夾路徑/InstallDashboard_WebApp_20260228-F9_full"
```

執行以下指令（將 `YOUR_PAT` 替換為剛才複製的 token）：

```bash
# 設定 remote（只做一次）
git remote add origin https://cthperry:YOUR_PAT@github.com/cthperry/InstallDashboard-WebApp.git

# 建立 GitHub repo（需要 gh CLI）或直接在瀏覽器建立：
# https://github.com/new → Repository name: InstallDashboard-WebApp → Private → Create

# 推送
git push -u origin main
```

推送成功後可刪除含 PAT 的 remote，改用一般 HTTPS：
```bash
git remote set-url origin https://github.com/cthperry/InstallDashboard-WebApp.git
```

---

## 步驟 3 — 在 Vercel 部署

### 方法 A：網頁操作（推薦）

1. 前往 https://vercel.com/new
2. 點「Import Git Repository」→ 選 `cthperry/InstallDashboard-WebApp`
3. **Root Directory** 改為 **`web`**（重要！）
4. Framework 會自動偵測為 **Next.js**
5. 展開「Environment Variables」，逐一填入：

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | 你的 Firebase API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `dashboard-webapp-97917.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `dashboard-webapp-97917` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `dashboard-webapp-97917.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `294834589459` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | 你的 Firebase App ID |
| `NEXT_PUBLIC_APP_VERSION` | `20260228-F9` |

6. 點「Deploy」，等待約 2 分鐘
7. 部署完成後取得網址，例如：`https://install-dashboard-webapp.vercel.app`

### 方法 B：Vercel CLI

```bash
npm i -g vercel
cd web
vercel --prod
```

---

## 步驟 4 — Firebase Auth 設定（必做）

部署完成後，需將 Vercel 網址加入 Firebase Auth 授權清單：

1. 前往 Firebase Console → Authentication → Settings → **Authorized domains**
2. 點「Add domain」
3. 輸入 Vercel 給你的網址（如 `install-dashboard-webapp.vercel.app`）
4. 儲存

---

## 步驟 5 — 建立 Admin 帳號（首次使用）

1. 前往 Firebase Console → Authentication → Users → 「Add user」
2. 填入你的 Email 與密碼，手動建立第一個 Admin 帳號
3. 登入後，在 Firebase Console → Firestore → `users/{你的uid}` → 編輯：
   - 將 `role` 改為 `"admin"`
4. 回到 Dashboard → 設定 → 進階設定 → **「👥 建立內建使用者」**
5. 點「開始建立所有使用者」，完成 7 位使用者的帳號建立

---

## 往後更新流程

每次修改程式碼後：

```bash
cd "你的資料夾路徑/InstallDashboard_WebApp_20260228-F9_full"
git add .
git commit -m "描述你的修改"
git push origin main
```

Vercel 會自動偵測 push 並重新部署（約 1~2 分鐘）。
