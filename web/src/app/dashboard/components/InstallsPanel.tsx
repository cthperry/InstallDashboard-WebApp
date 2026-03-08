"use client";

import { useRef } from "react";
import { PHASES, REGIONS } from "@/domain/constants";
import type { Installation, RegionKey, PhaseKey } from "@/domain/types";
import { C, daysLeft, slaLabel, isOverdueInstall, todayYYYYMMDD, exportInstallationsCSV } from "../utils";

export type InstallsPanelProps = {
  C: typeof C;
  filteredInstalls: Installation[];
  installations: Installation[];
  engineers: string[];
  customers: string[];
  sortCol: "name" | "region" | "customer" | "phase" | "engineer" | "progress" | "sla";
  setSortCol: (col: "name" | "region" | "customer" | "phase" | "engineer" | "progress" | "sla") => void;
  sortDir: "asc" | "desc";
  setSortDir: (dir: "asc" | "desc") => void;
  fRegion: "" | RegionKey;
  setFRegion: (val: "" | RegionKey) => void;
  fPhase: "" | PhaseKey;
  setFPhase: (val: "" | PhaseKey) => void;
  fEngineer: string;
  setFEngineer: (val: string) => void;
  fCustomer: string;
  setFCustomer: (val: string) => void;
  keyword: string;
  setKeyword: (val: string) => void;
  installView: "table" | "card" | "gantt";
  setInstallView: (view: "table" | "card" | "gantt") => void;
  importDragOver: boolean;
  setImportDragOver: (val: boolean) => void;
  processExcelFile: (file: File) => void;
  showToast: (msg: string) => void;
  openAddInstall: () => void;
  openEditInstall: (r: Installation) => void;
  delInstall: (r: Installation) => void;
};

export function InstallsPanel({
  C: colors,
  filteredInstalls,
  installations,
  engineers,
  customers,
  sortCol,
  setSortCol,
  sortDir,
  setSortDir,
  fRegion,
  setFRegion,
  fPhase,
  setFPhase,
  fEngineer,
  setFEngineer,
  fCustomer,
  setFCustomer,
  keyword,
  setKeyword,
  installView,
  setInstallView,
  importDragOver,
  setImportDragOver,
  processExcelFile,
  showToast,
  openAddInstall,
  openEditInstall,
  delInstall,
}: InstallsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const today = todayYYYYMMDD();

  const sortedInstalls = [...filteredInstalls].sort((a, b) => {
    let av: any, bv: any;
    if (sortCol === "sla") {
      av = daysLeft(a.estComplete) ?? 9999;
      bv = daysLeft(b.estComplete) ?? 9999;
    } else if (sortCol === "progress") {
      av = a.progress || 0;
      bv = b.progress || 0;
    } else if (sortCol === "phase") {
      av = PHASES.findIndex(p => p.key === a.phase);
      bv = PHASES.findIndex(p => p.key === b.phase);
    } else {
      av = (a[sortCol as keyof typeof a] || "").toString().toLowerCase();
      bv = (b[sortCol as keyof typeof b] || "").toString().toLowerCase();
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setImportDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setImportDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setImportDragOver(false);
    const file = Array.from(e.dataTransfer.files).find(f => /\.(xlsx|xls)$/i.test(f.name));
    if (file) processExcelFile(file);
    else showToast("⚠️ 請拖入 .xlsx 或 .xls 檔案");
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag-over overlay */}
      {importDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            background: "rgba(16,185,129,0.12)",
            border: "2px dashed #10b981",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ textAlign: "center", color: "#10b981" }}>
            <div style={{ fontSize: 40 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>放開以匯入 Excel</div>
          </div>
        </div>
      )}

      {/* Header & Filters */}
      <div
        style={{
          background: colors.panel,
          borderBottom: `1px solid ${colors.border}`,
          padding: "14px 20px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, color: colors.text1, fontSize: 16, flex: 1 }}>📋 裝機管理</h2>
          <button
            onClick={openAddInstall}
            style={{
              background: colors.accent,
              border: "none",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            + 新增
          </button>
          <button
            onClick={() => exportInstallationsCSV(sortedInstalls)}
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
            📥 匯出
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) processExcelFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: "rgba(16,185,129,0.15)",
              border: "1px solid #10b981",
              color: "#10b981",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            📤 匯入 Excel
          </button>
          <span style={{ fontSize: 11, color: colors.text3, alignSelf: "center" }}>或拖曳檔案至此</span>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <select
            value={fRegion}
            onChange={e => setFRegion(e.target.value as "" | RegionKey)}
            className="input"
            style={{ width: 120, flex: "0 0 auto" }}
          >
            <option value="">所有地區</option>
            {Object.keys(REGIONS).map(key => {
              const r = REGIONS[key as RegionKey];
              return (
                <option key={key} value={key}>
                  {r.label}
                </option>
              );
            })}
          </select>

          <select
            value={fPhase}
            onChange={e => setFPhase(e.target.value as "" | PhaseKey)}
            className="input"
            style={{ width: 130, flex: "0 0 auto" }}
          >
            <option value="">所有階段</option>
            {PHASES.map(p => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>

          <select
            value={fEngineer}
            onChange={e => setFEngineer(e.target.value)}
            className="input"
            style={{ width: 130, flex: "0 0 auto" }}
          >
            <option value="">所有工程師</option>
            {engineers.map(e => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>

          <select
            value={fCustomer}
            onChange={e => setFCustomer(e.target.value)}
            className="input"
            style={{ width: 130, flex: "0 0 auto" }}
          >
            <option value="">所有客戶</option>
            {customers.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="搜尋名稱或客戶..."
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            className="input"
            style={{ flex: 1, minWidth: 160, width: "auto" }}
          />
        </div>

        {/* View Toggle */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["table", "card", "gantt"] as const).map(v => (
            <button
              key={v}
              onClick={() => setInstallView(v)}
              style={{
                background: installView === v ? colors.accent : colors.panelHigh,
                border: `1px solid ${installView === v ? colors.accent : colors.border}`,
                color: installView === v ? "#fff" : colors.text2,
                padding: "4px 10px",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {v === "table" ? "📊 表" : v === "card" ? "🗂️ 卡" : "📅 甘特"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
        {installView === "table" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ position: "sticky", top: 0, background: colors.panelHigh, zIndex: 10 }}>
              <tr>
                {[
                  { key: "name", label: "名稱" },
                  { key: "region", label: "地區" },
                  { key: "customer", label: "客戶" },
                  { key: "phase", label: "階段" },
                  { key: "engineer", label: "工程師" },
                  { key: "progress", label: "進度" },
                  { key: "sla", label: "SLA" },
                  { key: "_op", label: "操作" },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={
                      col.key !== "_op"
                        ? () => {
                            if (sortCol === col.key) setSortDir(sortDir === "asc" ? "desc" : "asc");
                            else {
                              setSortCol(col.key as any);
                              setSortDir("asc");
                            }
                          }
                        : undefined
                    }
                    style={{
                      padding: "8px",
                      textAlign: "left",
                      borderBottom: `1px solid ${colors.border}`,
                      color: sortCol === col.key ? colors.accent : colors.text2,
                      fontWeight: 600,
                      cursor: col.key !== "_op" ? "pointer" : "default",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.label}
                    {sortCol === col.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedInstalls.map(r => {
                const dl = daysLeft(r.estComplete);
                const sla = slaLabel(dl);
                const isOD = isOverdueInstall(r, today);
                const dl2 = daysLeft(r.estComplete);
                const isUrgent = !isOD && dl2 !== null && dl2 >= 0 && dl2 <= 7;
                const rowBg = isOD ? "rgba(244,63,94,0.06)" : isUrgent ? "rgba(245,158,11,0.06)" : "transparent";
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${colors.border}`, background: rowBg }}>
                    <td style={{ padding: "8px", color: colors.text1 }}>{r.name}</td>
                    <td style={{ padding: "8px", color: colors.text2 }}>
                      {REGIONS[r.region as RegionKey]?.label || r.region}
                    </td>
                    <td style={{ padding: "8px", color: colors.text2 }}>{r.customer}</td>
                    <td style={{ padding: "8px", color: colors.text2 }}>
                      {PHASES.find(p => p.key === r.phase)?.label}
                    </td>
                    <td style={{ padding: "8px", color: colors.text2 }}>{r.engineer}</td>
                    <td style={{ padding: "8px", color: colors.accent, fontWeight: 600 }}>
                      {r.progress || 0}%
                    </td>
                    <td style={{ padding: "8px", color: sla?.color || colors.text3 }}>
                      {sla?.text || "—"}
                    </td>
                    <td style={{ padding: "8px" }}>
                      <button
                        onClick={() => openEditInstall(r)}
                        style={{
                          background: colors.accentDim,
                          border: `1px solid ${colors.accent}`,
                          color: colors.accent,
                          padding: "2px 8px",
                          borderRadius: 3,
                          cursor: "pointer",
                          fontSize: 11,
                          marginRight: 4,
                        }}
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => delInstall(r)}
                        style={{
                          background: colors.dangerDim,
                          border: `1px solid ${colors.danger}`,
                          color: colors.danger,
                          padding: "2px 8px",
                          borderRadius: 3,
                          cursor: "pointer",
                          fontSize: 11,
                        }}
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {installView === "table" && sortedInstalls.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: colors.text3 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, color: colors.text2, marginBottom: 6 }}>
              {installations.length === 0 ? "尚未建立任何裝機案" : "沒有符合篩選條件的案件"}
            </div>
            {installations.length > 0 && (
              <div style={{ fontSize: 12, color: colors.text3 }}>請調整上方的篩選條件</div>
            )}
          </div>
        )}

        {installView === "card" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {sortedInstalls.map(r => {
              const dl = daysLeft(r.estComplete);
              const sla = slaLabel(dl);
              return (
                <div
                  key={r.id}
                  style={{
                    background: colors.panelHigh,
                    border: `1px solid ${colors.border}`,
                    padding: "12px",
                    borderRadius: 4,
                    cursor: "pointer",
                    transition: "0.2s",
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = colors.accent;
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = colors.border;
                  }}
                >
                  <div style={{ fontWeight: 600, color: colors.text1, marginBottom: 8 }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: 12, color: colors.text2, marginBottom: 4 }}>
                    {r.customer} • {REGIONS[r.region as RegionKey]?.label || r.region}
                  </div>
                  <div style={{ fontSize: 12, color: colors.text3, marginBottom: 8 }}>
                    {PHASES.find(p => p.key === r.phase)?.label} • {r.engineer}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        background: colors.panel,
                        height: 16,
                        borderRadius: 2,
                        overflow: "hidden",
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          background: colors.accent,
                          height: "100%",
                          width: `${r.progress || 0}%`,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: colors.text3, textAlign: "right" }}>
                      {r.progress || 0}%
                    </div>
                  </div>
                  {sla && (
                    <div style={{ fontSize: 12, color: sla.color, fontWeight: 500, marginBottom: 8 }}>
                      {sla.text}
                    </div>
                  )}
                  <button
                    onClick={() => openEditInstall(r)}
                    style={{
                      background: colors.accent,
                      border: "none",
                      color: "#fff",
                      padding: "4px 8px",
                      borderRadius: 3,
                      cursor: "pointer",
                      fontSize: 11,
                      width: "100%",
                    }}
                  >
                    編輯
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {installView === "card" && sortedInstalls.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: colors.text3 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, color: colors.text2, marginBottom: 6 }}>
              {installations.length === 0 ? "尚未建立任何裝機案" : "沒有符合篩選條件的案件"}
            </div>
            {installations.length > 0 && (
              <div style={{ fontSize: 12, color: colors.text3 }}>請調整上方的篩選條件</div>
            )}
          </div>
        )}

        {installView === "gantt" && (
          <div>
            {sortedInstalls.map(r => {
              const startDate = new Date(r.orderDate || r.estComplete || today);
              const endDate = new Date(r.estComplete || today);
              const now = new Date(today);
              const totalDays = Math.max(
                (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
                1
              );
              const progress = Math.min(
                100,
                Math.max(
                  0,
                  ((now.getTime() - startDate.getTime()) / (totalDays * 1000 * 60 * 60 * 24)) * 100
                )
              );

              return (
                <div key={r.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ minWidth: 140, fontSize: 12, color: colors.text2 }}>
                      <div style={{ color: colors.text1, fontWeight: 500 }}>{r.name}</div>
                      <div style={{ fontSize: 11 }}>{r.customer}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          background: colors.panel,
                          height: 24,
                          borderRadius: 2,
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            background: colors.accent,
                            height: "100%",
                            width: `${Math.min(progress, 100)}%`,
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: 0,
                            height: "100%",
                            width: 2,
                            background: colors.warning,
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ minWidth: 50, textAlign: "right", fontSize: 12, color: colors.text2 }}>
                      {r.progress || 0}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
