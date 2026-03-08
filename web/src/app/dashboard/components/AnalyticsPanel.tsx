"use client";

import { PHASES, REGIONS } from "@/domain/constants";
import type { Installation, RegionKey } from "@/domain/types";
import { C } from "../utils";

export type AnalyticsPanelProps = {
  C: typeof C;
  globalStats: {
    total: number;
    wip: number;
    released: number;
    overdue: number;
    avgProg: number;
    byPhase: Record<string, number>;
  };
  urgentList: Installation[];
  installations: Installation[];
  engineers: string[];
};

export function AnalyticsPanel({
  C: colors,
  globalStats,
  urgentList,
  installations,
  engineers,
}: AnalyticsPanelProps) {
  const phaseDistData = PHASES.map(p => ({ label: p.label, value: globalStats.byPhase[p.key] }));
  const regionDistData = Object.keys(REGIONS).map(key => {
    const r = REGIONS[key as RegionKey];
    const count = installations.filter(i => i.region === key).length;
    return { label: r.label, value: count };
  });
  const engineerData = engineers.map(e => {
    const count = installations.filter(i => i.engineer === e).length;
    return { label: e, value: count };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", padding: "20px" }}>
      <h2 style={{ color: colors.text1, marginBottom: 20, fontSize: 18, fontWeight: 600 }}>📊 分析</h2>

      {/* SLA Health Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "🚨 SLA逾期", value: globalStats.overdue, color: colors.danger, bg: colors.dangerDim },
          { label: "⏰ 7天內到期", value: urgentList.length, color: colors.warning, bg: colors.warningDim },
          { label: "✅ 狀態正常", value: globalStats.wip - globalStats.overdue - urgentList.length, color: colors.success, bg: colors.successDim },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: 6, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: s.color }}>{Math.max(0, s.value)}</div>
          </div>
        ))}
      </div>

      {/* Completion & Progress Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 4, padding: 16 }}>
          <div style={{ fontSize: 13, color: colors.text2, fontWeight: 600, marginBottom: 8 }}>完工率</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: colors.success, marginBottom: 6 }}>
            {globalStats.total > 0 ? Math.round((globalStats.released / globalStats.total) * 100) : 0}%
          </div>
          <div style={{ fontSize: 12, color: colors.text3 }}>{globalStats.released} / {globalStats.total} 案件已量產</div>
          <div style={{ marginTop: 10, background: colors.panelHigh, height: 8, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ background: colors.success, height: "100%", width: `${globalStats.total > 0 ? (globalStats.released / globalStats.total) * 100 : 0}%`, transition: "width 0.5s" }} />
          </div>
        </div>
        <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 4, padding: 16 }}>
          <div style={{ fontSize: 13, color: colors.text2, fontWeight: 600, marginBottom: 8 }}>平均施工進度</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: colors.accent, marginBottom: 6 }}>{globalStats.avgProg}%</div>
          <div style={{ fontSize: 12, color: colors.text3 }}>進行中 {globalStats.wip} 案件</div>
          <div style={{ marginTop: 10, background: colors.panelHigh, height: 8, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ background: colors.accent, height: "100%", width: `${globalStats.avgProg}%`, transition: "width 0.5s" }} />
          </div>
        </div>
      </div>

      {/* Phase Distribution */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, padding: 16, borderRadius: 4, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 16px 0", color: colors.text1, fontSize: 14, fontWeight: 600 }}>階段分布</h3>
        {phaseDistData.map(d => {
          const max = Math.max(...phaseDistData.map(x => x.value), 1);
          return (
            <div key={d.label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: colors.text2 }}>{d.label}</span>
                <span style={{ color: colors.text1, fontWeight: 600 }}>{d.value}</span>
              </div>
              <div style={{ background: colors.panelHigh, height: 20, borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    background: colors.accent,
                    height: "100%",
                    width: `${(d.value / max) * 100}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Region Distribution */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, padding: 16, borderRadius: 4, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 16px 0", color: colors.text1, fontSize: 14, fontWeight: 600 }}>地區分布</h3>
        {regionDistData.map(d => {
          const max = Math.max(...regionDistData.map(x => x.value), 1);
          return (
            <div key={d.label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: colors.text2 }}>{d.label}</span>
                <span style={{ color: colors.text1, fontWeight: 600 }}>{d.value}</span>
              </div>
              <div style={{ background: colors.panelHigh, height: 20, borderRadius: 2, overflow: "hidden" }}>
                <div
                  style={{
                    background: colors.success,
                    height: "100%",
                    width: `${(d.value / max) * 100}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Engineer Workload */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, padding: 16, borderRadius: 4 }}>
        <h3 style={{ margin: "0 0 16px 0", color: colors.text1, fontSize: 14, fontWeight: 600 }}>工程師負荷</h3>
        {engineerData.sort((a, b) => b.value - a.value).map(d => {
          const maxVal = Math.max(...engineerData.map(x => x.value), 1);
          return (
            <div key={d.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: colors.text1 }}>{d.label}</span>
                <span style={{ color: colors.accent, fontWeight: 600 }}>{d.value} 案</span>
              </div>
              <div style={{ background: colors.panelHigh, height: 18, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ background: d.value > 3 ? colors.warning : colors.accent, height: "100%", width: `${(d.value / maxVal) * 100}%`, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
        {engineerData.length === 0 && <div style={{ color: colors.text3, fontSize: 12 }}>尚無工程師資料</div>}
      </div>
    </div>
  );
}
