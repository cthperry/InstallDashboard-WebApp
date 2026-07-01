"use client";

import { useMemo, useState } from "react";
import type { Installation } from "@/domain/types";
import { PHASES } from "@/domain/constants";
import { toDisplayShortName } from "@/domain/personDisplay";
import { buildGanttViewModel } from "@/features/dashboard/ganttViewModel";

export function GanttView({ rows, onClickRow }: { rows: Installation[]; onClickRow: (r: Installation) => void }) {
  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);
  const phaseColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const p of PHASES) colors[p.key] = p.color;
    return colors;
  }, []);

  const { rows: gRows, timeline } = useMemo(() => buildGanttViewModel(rows, today), [rows, today]);
  const { totalMs, todayPct, months } = timeline;
  function pct(d: Date) { return ((d.getTime() - timeline.minDate.getTime()) / totalMs) * 100; }

  const [dragging, setDragging] = useState<{ id: string; type: "move" | "resize-end"; startX: number; containerW: number } | null>(null);
  const [offsets, setOffsets] = useState<Record<string, { dStart: number; dEnd: number }>>({});

  function handleBarMouseDown(e: React.MouseEvent, rowId: string, type: "move" | "resize-end") {
    const cw = (e.currentTarget.closest(".ganttBars") as HTMLElement)?.clientWidth ?? 700;
    e.preventDefault(); e.stopPropagation();
    setDragging({ id: rowId, type, startX: e.clientX, containerW: cw });
  }
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dMs = dx * (totalMs / dragging.containerW);
    setOffsets((prev) => ({ ...prev, [dragging.id]: dragging.type === "move" ? { dStart: dMs, dEnd: dMs } : { dStart: 0, dEnd: Math.max(dMs, 86400000) } }));
  }
  function handleMouseUp() { setDragging(null); }

  return (
    <div className="card" style={{ marginTop: 12, overflowX: "auto", padding: 0 }}>
      <div style={{ fontWeight: 900, padding: "12px 14px 8px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        甘特圖視圖
        <span style={{ fontWeight: 400, fontSize: 12, color: "var(--muted-foreground, #94a3b8)" }}>拖曳橫條可調整時程（視覺預覽）</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#ef4444", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />今日
        </span>
      </div>
      {gRows.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--muted-foreground, #94a3b8)" }}>無符合條件的裝機案</div>
      ) : (
        <div style={{ position: "relative", minWidth: 700, userSelect: "none" }} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
            <div style={{ width: 180, minWidth: 180, background: "var(--muted, #f1f5f9)", padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "var(--muted-foreground, #64748b)" }}>裝機案</div>
            <div className="ganttBars" style={{ flex: 1, position: "relative", height: 28, background: "var(--muted, #f1f5f9)" }}>
              {months.map((m) => (
                <div key={m.label} style={{ position: "absolute", left: m.left + "%", top: 4, fontSize: 11, color: "var(--muted-foreground, #94a3b8)", whiteSpace: "nowrap", pointerEvents: "none" }}>{m.label}</div>
              ))}
              <div style={{ position: "absolute", left: todayPct + "%", top: 0, bottom: 0, width: 2, background: "#ef4444", opacity: 0.8, pointerEvents: "none" }} />
            </div>
          </div>
          {gRows.map((row) => {
            const off = offsets[row.id] ?? { dStart: 0, dEnd: 0 };
            const effStart = new Date(row.start.getTime() + off.dStart);
            const effEnd = new Date(row.end.getTime() + off.dEnd);
            const left = pct(effStart); const width = Math.max(pct(effEnd) - left, 0.5);
            const color = phaseColors[row.phase] ?? "#3b82f6";
            const isDragging = dragging?.id === row.id;
            return (
              <div key={row.id} style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", height: 46 }}>
                <div style={{ width: 180, minWidth: 180, padding: "0 12px", cursor: "pointer", overflow: "hidden" }} onClick={() => onClickRow(row.install)}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.install.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground, #94a3b8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.install.customer}{toDisplayShortName(row.install.engineer) ? " · " + toDisplayShortName(row.install.engineer) : ""}</div>
                </div>
                <div className="ganttBars" style={{ flex: 1, position: "relative", height: "100%", background: "var(--muted, #f8fafc)" }}>
                  <div style={{ position: "absolute", left: todayPct + "%", top: 0, bottom: 0, width: 2, background: "#ef4444", opacity: 0.35, pointerEvents: "none" }} />
                  <div
                    style={{ position: "absolute", left: left + "%", width: width + "%", top: "20%", height: "60%", background: color, opacity: isDragging ? 0.7 : 0.85, borderRadius: 4, cursor: "grab", boxShadow: isDragging ? "0 2px 12px rgba(0,0,0,0.25)" : "0 1px 3px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", overflow: "hidden" }}
                    onMouseDown={(e) => handleBarMouseDown(e, row.id, "move")}
                  >
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: row.progress + "%", background: "rgba(255,255,255,0.28)", pointerEvents: "none" }} />
                    <span style={{ fontSize: 11, color: "white", fontWeight: 700, paddingLeft: 6, position: "relative", whiteSpace: "nowrap" }}>{row.progress}%</span>
                    <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 10, cursor: "ew-resize", background: "rgba(0,0,0,0.18)", borderRadius: "0 4px 4px 0" }} onMouseDown={(e) => handleBarMouseDown(e, row.id, "resize-end")} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
