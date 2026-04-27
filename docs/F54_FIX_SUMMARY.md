# F54 修正摘要

- 修正 `src/domain/capacity.ts` 的 TypeScript 語法錯誤，恢復 Dashboard 可編譯
- 戰情室 `地區產品產能` 改為摘要格式：`5100 -> 5.1K UPH`
- 保留明細/編輯表單使用完整數值顯示
- 修正 `src/features/data/audit.ts` 缺少 `AUDIT_LOGS_COL` import 的編譯問題
- 版號更新為 `20260403-F54`，唯一來源仍為 `package.json.version`
