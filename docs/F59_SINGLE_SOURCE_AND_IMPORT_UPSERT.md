# F59 修正摘要

## 本次處理
1. App 版本改為單一來源：`package.json.version`
2. `public/sw.js`、`public/version.json`、`src/generated/appBuild.ts` 改為自動產生
3. localhost 不再註冊 Service Worker，並主動清除舊 `premtek-*` cache
4. Excel 智慧匯入改為：每列先進 installation，驗收完成且有序號再同步 equipment
5. installation 新增 `importKey` upsert，修正重複匯入會新增重複案件
6. equipment 改為依 `serialNo` 更新既有資料，不再重複新增

## 資料流
Excel -> parseWorkbookJsonRows -> SmartImportModal / ImportExcelModal -> commitSmartImportBatch -> Firestore

### installation
- 先建 `buildInstallationPayload`
- 以 `importKey` 比對既有文件
- 命中則 update；否則 create

### equipment
- 只在同列具備「驗收完成日期 + 機台序號」時建立 payload
- 以 `serialNo` 比對既有文件
- 命中則 update；否則 create
