"use client";

import { PHASES, REGIONS } from "@/domain/constants";
import type { Installation, RegionKey } from "@/domain/types";
import { C, daysLeft, slaLabel } from "../utils";

export type WarroomPanelProps = {
  C: typeof C;
  installations: Installation[];
  overdueList: Installation[];
  urgentList: Installation[];
  auditLogs: any[];
  engineers: string[];
  globalStats: {
    total: number;
    wip: number;
    released: number;
    overdue: number;
    avgProg: number;
    byPhase: Record<string, number>;
  };
  alertDismissed: boolean;
  setAlertDismissed: (val: boolean) => void;
  setView: (view: "warroom" | "installs" | "equipment" | "analytics" | "settings" | "logs") => void;
  openAddInstall: () => void;
  openEditInstall: (r: Installation) => void;
};

export function WarroomPanel({
  C: colors,
  installations,
  overdueList,
  urgentList,
  auditLogs,
  engineers,
  globalStats,
  alertDismissed,
  setAlertDismissed,
  setView,
  openAddInstall,
  openEditInstall,
}: WarroomPanelProps) {
  const activeInstalls = installations.filter(r => r.phase !== "released").sort((a, b) => {
    const aDL = daysLeft(a.estComplete);
    const bDL = daysLeft(b.estComplete);
    if (aDL === null && bDL === null) return 0;
    if (aDL === null) return 1;
    if (bDL === null) return -1;
    return aDL - bDL;
  });

  const regionStats: Record<string, { total: number; wip: number }> = {};
  const regionKeys = Object.keys(REGIONS) as RegionKey[];
  regionKeys.forEach(rKey => {
    regionStats[rKey] = {
      total: installations.filter(i => i.region === rKey).length,
      wip: installations.filter(i => i.region === rKey && i.phase !== "released").length,
    };
  });

  const engineerStats: Record<string, number> = {};
  engineers.forEach(e => {
    engineerStats[e] = installations.filter(i => i.engineer === e && i.phase !== "released").length;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ALERT BANNER */}
      {!alertDismissed && overdueList.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            background: colors.dangerDim,
            borderBottom: `1px solid ${colors.danger}`,
            padding: "8px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: colors.danger,
            fontWeight: 500,
            fontSize: 13,
          }}
        >
          <span>
            🚨 有 {overdueList.length} 筆裝機案 SLA 逾期：
            {overdueList.slice(0, 3).map(r => r.name).join("、")}
            {overdueList.length > 3 && `…等 ${overdueList.length} 筆`}
          </span>
          <button
            onClick={() => setAlertDismissed(true)}
            style={{
              background: "none",
              border: "none",
              color: colors.danger,
              cursor: "pointer",
              fontSize: 18,
              padding: "0 4px",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 三欄主體 */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* LEFT PANEL - ALERTS */}
        <div
          style={{
            width: 280,
            background: colors.panel,
            borderRight: `1px solid ${colors.border}`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            fontSize: 13,
          }}
        >
          {/* Overdue */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ color: colors.danger, fontWeight: 600, marginBottom: 8 }}>🚨 SLA逾期 ({overdueList.length})</div>
            <div style={{ maxHeight: 120, overflow: "auto" }}>
              {overdueList.slice(0, 8).map(r => (
                <div key={r.id} style={{ color: colors.text2, marginBottom: 4, fontSize: 12 }}>
                  • {r.name}
                </div>
              ))}
            </div>
          </div>

          {/* Urgent */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ color: colors.warning, fontWeight: 600, marginBottom: 8 }}>⏰ 7天到期 ({urgentList.length})</div>
            <div style={{ maxHeight: 120, overflow: "auto" }}>
              {urgentList.slice(0, 8).map(r => (
                <div key={r.id} style={{ color: colors.text2, marginBottom: 4, fontSize: 12 }}>
                  • {r.name}
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div style={{ padding: "12px 14px", flex: 1, overflow: "auto" }}>
            <div style={{ color: colors.text2, fontWeight: 600, marginBottom: 8, fontSize: 12 }}>最近活動</div>
            <div style={{ fontSize: 11 }}>
              {auditLogs
                .slice(0, 5)
                .map((log, i) => (
                  <div key={i} style={{ color: colors.text3, marginBottom: 6, lineHeight: 1.4 }}>
                    {log.action} • {log.timestamp ? new Date(log.timestamp).toLocaleDateString("zh-TW") : "—"}
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* CENTER - ACTIVE INSTALLS */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            background: colors.bg,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, color: colors.text1, fontSize: 16, fontWeight: 600 }}>
                ⚡ 進行中裝機 ({activeInstalls.length})
              </h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setView("installs")}
                  style={{
                    background: colors.accentDim,
                    border: `1px solid ${colors.accent}`,
                    color: colors.accent,
                    padding: "4px 10px",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  完整甘特圖 →
                </button>
                <button
                  onClick={openAddInstall}
                  style={{
                    background: colors.accentDim,
                    border: `1px solid ${colors.accent}`,
                    color: colors.accent,
                    padding: "4px 10px",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  + 新增
                </button>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
            {activeInstalls.map(r => {
              const dl = daysLeft(r.estComplete);
              const sla = slaLabel(dl);
              return (
                <div
                  key={r.id}
                  onClick={() => openEditInstall(r)}
                  style={{
                    background: colors.panelHigh,
                    border: `1px solid ${colors.border}`,
                    padding: "12px",
                    marginBottom: 10,
                    borderRadius: 4,
                    cursor: "pointer",
                    transition: "0.2s",
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = colors.accent;
                    el.style.boxShadow = `0 0 8px ${colors.accentDim}`;
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = colors.border;
                    el.style.boxShadow = "none";
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, color: colors.text1 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: colors.text3 }}>{REGIONS[r.region as RegionKey]?.label || r.region}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          background: colors.panel,
                          height: 20,
                          borderRadius: 2,
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            background: colors.accent,
                            height: "100%",
                            width: `${r.progress || 0}%`,
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ minWidth: 30, textAlign: "right", color: colors.text2, fontSize: 12, fontWeight: 500 }}>
                      {r.progress || 0}%
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: colors.text3 }}>
                    <span>{r.customer}</span>
                    <span>{PHASES.find(p => p.key === r.phase)?.label}</span>
                    {sla && <span style={{ color: sla.color }}>{sla.text}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL - REGION & PHASE DIST */}
        <div
          style={{
            width: 260,
            background: colors.panel,
            borderLeft: `1px solid ${colors.border}`,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            fontSize: 13,
          }}
        >
          {/* Region Heat */}
          <div style={{ padding: "14px 12px", borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ fontWeight: 600, marginBottom: 12, color: colors.text1 }}>🗺️ 地區分布</div>
            {regionKeys.map(rKey => {
              const reg = REGIONS[rKey];
              const stats = regionStats[rKey];
              const maxWip = Math.max(...regionKeys.map(k => regionStats[k].wip), 1);
              const heat = stats.wip / maxWip;
              const heatColor = heat > 0.7 ? colors.danger : heat > 0.4 ? colors.warning : colors.success;
              return (
                <div key={rKey} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: colors.text2 }}>{reg.label}</span>
                    <span style={{ color: heatColor, fontWeight: 600 }}>
                      {stats.wip}/{stats.total}
                    </span>
                  </div>
                  <div
                    style={{
                      background: colors.panelHigh,
                      height: 8,
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        background: heatColor,
                        height: "100%",
                        width: `${(stats.wip / Math.max(maxWip, 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Phase Distribution */}
          <div style={{ padding: "14px 12px" }}>
            <div style={{ fontWeight: 600, marginBottom: 12, color: colors.text1 }}>📊 階段分布</div>
            {PHASES.map(phase => {
              const count = globalStats.byPhase[phase.key];
              const max = Math.max(...PHASES.map(p => globalStats.byPhase[p.key]), 1);
              return (
                <div key={phase.key} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
                    <span style={{ color: colors.text2 }}>{phase.label}</span>
                    <span style={{ color: colors.text1, fontWeight: 600 }}>{count}</span>
                  </div>
                  <div
                    style={{
                      background: colors.panelHigh,
                      height: 6,
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        background: colors.accent,
                        height: "100%",
                        width: `${(count / max) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
