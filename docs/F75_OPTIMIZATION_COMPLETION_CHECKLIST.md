# F75 Optimization Completion Checklist

本文件整理本輪「根據規劃書完成所有功能優化」的交付範圍與最後驗證步驟。

## 已完成優化範圍

- 使用者角色維持兩種：`admin`、`engineer`。
- 裝機任務流：SLA aging、下一步 owner、下一步期限、下一步動作、逾期原因、admin 批次治理。
- 設備台帳：blocking lifecycle（open / resolved / reopened）、處理天數、重開次數、解決備註、容量風險。
- 智慧匯入：dry-run 摘要、拒收 CSV、匯入 session history、admin 匯入 alias 設定。
- War Room：晨會 / 週會模式、決策佇列、Markdown 預覽、複製與下載。
- Insights：治理健康分數、cycle time、階段 aging、客戶 / 機型健康、Markdown 分析報告下載。
- 匯出：裝機 CSV、設備 CSV。
- 測試基礎：輕量 unit test runner，覆蓋治理、分析、Insights report 與設備 CSV 匯出純邏輯。

## 最後驗證 gate

shell 可用後，正式提交 / 推送前需執行：

```powershell
npm run test:unit
npm run verify:quality
npm run build
```

預期結果：

- `test:unit` 通過，至少包含 `tests/dashboardReports.test.ts`。
- `verify:quality` 通過 lint、typecheck、high audit gate。
- `build` 通過 Next production build 與 build version 驗證。

## 已知注意事項

- `npm audit --audit-level=high` 先前只回報既有 moderate advisories（Next internal postcss、ExcelJS uuid），high gate 仍可通過。
- 目前工作樹尚未提交；最後需要在驗證通過後 commit 並 push。
- 若 shell tool 仍回報 `CreateProcessAsUserW failed: 1312`，代表尚未進入 npm / git，不能把 gate 視為已通過。
