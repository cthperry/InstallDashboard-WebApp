"use client";

import { C, fmtDate } from "../utils";

export type LogsPanelProps = {
  C: typeof C;
  visibleLogs: any[];
  logAutoClearMin: number;
  setLogAutoClearMin: (val: number) => void;
  setLogsClearedAt: (val: number) => void;
};

export function LogsPanel({
  C: colors,
  visibleLogs,
  logAutoClearMin,
  setLogAutoClearMin,
  setLogsClearedAt,
}: LogsPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          background: colors.panel,
          borderBottom: `1px solid ${colors.border}`,
          padding: "14px 20px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: colors.text1, fontSize: 16, flex: 1 }}>📝 稽核紀錄</h2>
          <select
            value={logAutoClearMin}
            onChange={e => setLogAutoClearMin(parseInt(e.target.value))}
            className="input"
            style={{ width: 150, flex: "0 0 auto" }}
          >
            <option value={0}>自動清除：關閉</option>
            <option value={30}>30 分鐘</option>
            <option value={60}>1 小時</option>
            <option value={240}>4 小時</option>
            <option value={1440}>1 天</option>
          </select>
          <button
            onClick={() => setLogsClearedAt(Date.now())}
            style={{
              background: colors.accentDim,
              border: `1px solid ${colors.accent}`,
              color: colors.accent,
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            🗑️ 清空
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, background: colors.panelHigh, zIndex: 10 }}>
            <tr>
              {["時間", "使用者", "操作", "詳情"].map(h => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    borderBottom: `1px solid ${colors.border}`,
                    color: colors.text2,
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleLogs.map((log, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td style={{ padding: "8px 12px", color: colors.text2 }}>{fmtDate(log.timestamp)}</td>
                <td style={{ padding: "8px 12px", color: colors.text2 }}>{log.userId || "—"}</td>
                <td style={{ padding: "8px 12px", color: colors.text1 }}>{log.action}</td>
                <td style={{ padding: "8px 12px", color: colors.text3, fontSize: 11 }}>
                  {log.details ? JSON.stringify(log.details).slice(0, 50) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
