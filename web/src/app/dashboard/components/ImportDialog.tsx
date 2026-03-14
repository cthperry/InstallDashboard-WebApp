"use client";

import { PHASE_MAP, REGIONS } from "@/domain/constants";
import type { Installation, PhaseKey, RegionKey } from "@/domain/types";
import { Modal } from "@/features/ui/Modal";
import { C } from "../utils";

export type ImportDialogProps = {
  C: typeof C;
  open: boolean;
  onClose: () => void;
  importRows: Array<Omit<Installation, "id"> & { _rowNum: number; _warn?: string }>;
  setImportRows: (rows: Array<Omit<Installation, "id"> & { _rowNum: number; _warn?: string }>) => void;
  onConfirmImport: () => void;
  importSaving: boolean;
};

export function ImportDialog({
  C: colors,
  open,
  onClose,
  importRows,
  setImportRows,
  onConfirmImport,
  importSaving,
}: ImportDialogProps) {
  if (!open) return null;

  return (
    <Modal
      title={`📤 匯入預覽 — 共 ${importRows.length} 筆`}
      open={open}
      onClose={onClose}
      width={820}
    >
      <p style={{ color: colors.text2, fontSize: 13, margin: "0 0 12px 0" }}>
        請確認以下解析結果，確認無誤後點擊「確認匯入」以批量建立裝機案。
      </p>

      {/* Warning summary */}
      {importRows.some(r => r._warn) && (
        <div
          style={{
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.35)",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 12,
            fontSize: 12,
            color: "#f59e0b",
          }}
        >
          ⚠️ 部分列有警告，請檢查後再匯入
        </div>
      )}

      {/* Preview table */}
      <div
        style={{
          maxHeight: 420,
          overflowY: "auto",
          borderRadius: 6,
          border: `1px solid ${colors.border}`,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: colors.panelHigh, position: "sticky", top: 0 }}>
              {[
                "列",
                "案件名稱",
                "客戶",
                "機型",
                "地區",
                "工程師",
                "預計出貨",
                "預計安裝",
                "實際安裝",
                "驗收完成",
                "階段",
                "備註",
              ].map(h => (
                <th
                  key={h}
                  style={{
                    padding: "6px 8px",
                    textAlign: "left",
                    color: colors.text3,
                    fontWeight: 600,
                    borderBottom: `1px solid ${colors.border}`,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {importRows.map((row) => {
              const phase = PHASE_MAP[row.phase as PhaseKey];
              const region = REGIONS[row.region as RegionKey];
              return (
                <tr
                  key={row._rowNum}
                  style={{
                    background: row._warn ? "rgba(245,158,11,0.05)" : "transparent",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  <td style={{ padding: "5px 8px", color: colors.text3 }}>{row._rowNum}</td>
                  <td
                    style={{
                      padding: "5px 8px",
                      color: colors.text1,
                      maxWidth: 180,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.name}
                  </td>
                  <td style={{ padding: "5px 8px", color: colors.text2, whiteSpace: "nowrap" }}>
                    {row.customer || "—"}
                  </td>
                  <td style={{ padding: "5px 8px", color: colors.text2 }}>{row.modelCode}</td>
                  <td style={{ padding: "5px 8px" }}>
                    <select
                      value={row.region || "central"}
                      onChange={e => {
                        const newRegion = e.target.value as RegionKey;
                        setImportRows(
                          importRows.map(ir =>
                            ir._rowNum === row._rowNum
                              ? { ...ir, region: newRegion }
                              : ir
                          )
                        );
                      }}
                      style={{
                        background: colors.panel,
                        border: `1px solid ${colors.borderMed}`,
                        color: colors.text1,
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      <option value="north">北區</option>
                      <option value="central">中區</option>
                      <option value="south">南區</option>
                    </select>
                  </td>
                  <td style={{ padding: "5px 8px", color: colors.text2 }}>
                    {row.engineer || "—"}
                  </td>
                  <td style={{ padding: "5px 8px", color: colors.text3 }}>
                    {row.estArrival || "—"}
                  </td>
                  <td style={{ padding: "5px 8px", color: colors.text3 }}>
                    {row.estComplete || "—"}
                  </td>
                  <td style={{ padding: "5px 8px", color: colors.text3 }}>
                    {row.actArrival || "—"}
                  </td>
                  <td style={{ padding: "5px 8px", color: colors.text3 }}>
                    {row.actComplete || "—"}
                  </td>
                  <td style={{ padding: "5px 8px" }}>
                    <span
                      style={{
                        background: phase?.color ? `${phase.color}22` : "transparent",
                        color: phase?.color || colors.text2,
                        padding: "2px 6px",
                        borderRadius: 3,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {phase?.icon} {phase?.label || row.phase}
                    </span>
                  </td>
                  <td style={{ padding: "5px 8px", color: "#f59e0b", fontSize: 11 }}>
                    {row._warn || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button
          onClick={onClose}
          disabled={importSaving}
          style={{
            background: "transparent",
            border: `1px solid ${colors.border}`,
            color: colors.text2,
            padding: "7px 16px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          取消
        </button>
        <button
          onClick={onConfirmImport}
          disabled={importSaving}
          style={{
            background: importSaving ? "#c8d8c8" : colors.success,
            border: "none",
            color: "#0d1200",
            padding: "7px 20px",
            borderRadius: 4,
            cursor: importSaving ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {importSaving ? "匯入中…" : `確認匯入 ${importRows.length} 筆`}
        </button>
      </div>
    </Modal>
  );
}
