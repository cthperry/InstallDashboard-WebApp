# F61 build 版本鎖定修正

## root cause
- `next start` 讀取的是既有 `.next` 編譯產物，不是目前磁碟上的原始碼。
- 因此前一次 build 若仍是 F56，就算 `package.json`、`src/generated/appBuild.ts` 都已改成 F60，畫面仍可能顯示 F56。
- 之前只鎖了「來源單一」，但沒有鎖「build 產物必須與來源一致」，所以還是會出現版本顯示落後。

## 本次修正
1. `package.json.version` 仍是唯一版本來源。
2. `npm run build` 完成後，會寫入 `.next/app-build-version.json`。
3. `npm run start` 前會先驗證 `.next/app-build-version.json` 與 `package.json.version` 是否一致。
4. 若版本不一致，直接拒絕啟動並要求重新 build，不再允許「source 是 F61、畫面卻跑 F56」。

## 新增腳本
- `scripts/write-build-version.cjs`
- `scripts/verify-build-version.cjs`

## 建議本機重建步驟
```bash
rd /s /q .next
npm run build
npm run start
```

## 預期結果
- 若 `.next` 仍是舊版，`npm run start` 會直接失敗並提示重新 build。
- 重新 build 後，右上角版本應與 `package.json.version` 一致。
