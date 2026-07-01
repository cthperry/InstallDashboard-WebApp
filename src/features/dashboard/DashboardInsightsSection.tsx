import type { Dispatch, SetStateAction } from "react";

import type { RetentionSettingsDoc } from "@/domain/types";
import { Badge } from "@/features/ui/Badge";
import type { AuditLogRow, EventRow } from "@/features/data/logs";
import { DashboardEmptyState } from "@/features/dashboard/DashboardSharedControls";
import { clamp, fmtDate, type InsightsTab } from "@/features/dashboard/dashboardViewUtils";

export type DashboardInsightsSectionProps = {
  isAdmin: boolean;
  activeInsightsTab: InsightsTab;
  switchInsightsTab: (nextTab: InsightsTab) => void;
  downloadInsightsReport: () => void;
  insightsReportDisabled: boolean;
  insightsReportTitle: string;
  auditLogs: AuditLogRow[];
  events: EventRow[];
  retAuditDays: number;
  setRetAuditDays: Dispatch<SetStateAction<number>>;
  retEventDays: number;
  setRetEventDays: Dispatch<SetStateAction<number>>;
  retAutoEnabled: boolean;
  setRetAutoEnabled: Dispatch<SetStateAction<boolean>>;
  retAutoTime: string;
  setRetAutoTime: Dispatch<SetStateAction<string>>;
  saveRetention: (patch: Partial<RetentionSettingsDoc>) => void;
  today: string;
  doPurgeByRetention: () => void;
  purgeBusy: boolean;
  doClearAllLogs: () => void;
  purgeHint: string;
  retentionCfg: RetentionSettingsDoc;
};

export function DashboardInsightsSection({
  isAdmin,
  activeInsightsTab,
  switchInsightsTab,
  downloadInsightsReport,
  insightsReportDisabled,
  insightsReportTitle,
  auditLogs,
  events,
  retAuditDays,
  setRetAuditDays,
  retEventDays,
  setRetEventDays,
  retAutoEnabled,
  setRetAutoEnabled,
  retAutoTime,
  setRetAutoTime,
  saveRetention,
  today,
  doPurgeByRetention,
  purgeBusy,
  doClearAllLogs,
  purgeHint,
  retentionCfg,
}: DashboardInsightsSectionProps) {
  return (
    <>
      <div className="card" style={{ padding: 10, marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="segTabs">
            <button className={activeInsightsTab === "analytics" ? "segTab segTabActive" : "segTab"} onClick={() => switchInsightsTab("analytics")}>
              分析
            </button>
            {isAdmin ? (
              <button className={activeInsightsTab === "logs" ? "segTab segTabActive" : "segTab"} onClick={() => switchInsightsTab("logs")}>
                治理紀錄
              </button>
            ) : null}
          </div>
          {activeInsightsTab === "analytics" ? (
            <button className="btn btnSmall" onClick={downloadInsightsReport} disabled={insightsReportDisabled} title={insightsReportTitle}>
              下載分析報告
            </button>
          ) : null}
        </div>
      </div>

      {isAdmin && activeInsightsTab === "logs" ? (
        <>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 900 }}>稽核紀錄（auditLogs）</div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
              events 為 analytics 行為事件：僅 admin 可讀。
            </div>
          </div>

          <div className="card" style={{ padding: 14, marginTop: 12 }}>
            <div style={{ fontWeight: 900 }}>清除設定（admin）</div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
              這裡的「定時清除」為<strong>前端觸發</strong>：需有人開著系統（或每日首次開啟）才會執行。
              若要完全自動化（不依賴前端），需改用 Cloud Functions + Scheduler（通常需要 Blaze）。
            </div>

            <div className="filters" style={{ marginTop: 12 }}>
              <div className="field">
                <div className="label">保留 auditLogs（天）</div>
                <input type="number" min={0} max={3650} value={retAuditDays}
                  onChange={(event) => setRetAuditDays(clamp(Number(event.target.value || 0), 0, 3650))} />
              </div>
              <div className="field">
                <div className="label">保留 events（天）</div>
                <input type="number" min={0} max={3650} value={retEventDays}
                  onChange={(event) => setRetEventDays(clamp(Number(event.target.value || 0), 0, 3650))} />
              </div>
              <div className="field">
                <div className="label">定時清除</div>
                <select value={retAutoEnabled ? "on" : "off"} onChange={(event) => setRetAutoEnabled(event.target.value === "on")}>
                  <option value="off">關閉</option>
                  <option value="on">啟用</option>
                </select>
              </div>
              <div className="field">
                <div className="label">每日時間（台灣）</div>
                <input type="time" value={retAutoTime} onChange={(event) => setRetAutoTime(event.target.value || "03:00")} />
              </div>

              <button className="btn" onClick={() => saveRetention({
                version: `retention-${today}`,
                auditLogsRetentionDays: retAuditDays,
                eventsRetentionDays: retEventDays,
                autoPurgeEnabled: retAutoEnabled,
                autoPurgeTime: retAutoTime,
              })}>
                儲存設定
              </button>

              <button className="btn" onClick={doPurgeByRetention} disabled={purgeBusy}>
                立即清除（依保留天數）
              </button>

              <button className="btn btnDanger" onClick={doClearAllLogs} disabled={purgeBusy}>
                清除全部
              </button>

              <div style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>
                {purgeHint || (retentionCfg.lastAutoPurgeAt ? `上次自動清除：${fmtDate(retentionCfg.lastAutoPurgeAt)}` : "尚未自動清除")}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="tableWrap">
              <table className="table tableSmall">
                <thead>
                  <tr>
                    <th>時間</th>
                    <th>action</th>
                    <th>target</th>
                    <th>detail</th>
                    <th>actor</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((row) => (
                    <tr key={row.id}>
                      <td style={{ color: "#94a3b8", fontSize: 12 }}>{row.createdAt?.toDate?.().toISOString?.().slice(0, 19).replace("T", " ") ?? "-"}</td>
                      <td><Badge text={row.action} color="#3b82f6" subtle /></td>
                      <td style={{ fontWeight: 900 }}>{row.target}</td>
                      <td style={{ color: "#94a3b8" }}>{row.detail}</td>
                      <td style={{ color: "#94a3b8", fontSize: 12 }}>{row.actorEmail}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="dashboardEmptyCell">
                        <DashboardEmptyState
                          title="尚無治理紀錄"
                          detail="新增、更新、刪除或批次治理後會出現在這裡。"
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ padding: 12, borderBottom: "1px solid var(--border)", fontWeight: 900 }}>events（僅 admin）</div>
            <div className="tableWrap">
              <table className="table tableSmall">
                <thead>
                  <tr>
                    <th>時間</th>
                    <th>eventName</th>
                    <th>payload</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td style={{ color: "#94a3b8", fontSize: 12 }}>{event.createdAt?.toDate?.().toISOString?.().slice(0, 19).replace("T", " ") ?? "-"}</td>
                      <td className="mono" style={{ fontWeight: 900 }}>{event.eventName}</td>
                      <td style={{ color: "#94a3b8", fontSize: 12, maxWidth: 640, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {event.payload ? JSON.stringify(event.payload) : "-"}
                      </td>
                    </tr>
                  ))}
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="dashboardEmptyCell">
                        <DashboardEmptyState
                          title="尚無事件"
                          detail="使用者操作與系統事件寫入後會出現在這裡。"
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
