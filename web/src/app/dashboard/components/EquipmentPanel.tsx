"use client";

import { CAPACITY_COLOR, EQUIPMENT_MAIN_STATUSES, REGIONS, CAPACITY_LEVELS } from "@/domain/constants";
import type { Equipment, RegionKey, CapacityLevel, EquipmentMainStatus } from "@/domain/types";
import { MiniTrend } from "@/features/ui/MiniTrend";
import { C } from "../utils";

export type EquipmentPanelProps = {
  C: typeof C;
  filteredEquipments: Equipment[];
  equipStats: {
    total: number;
    avgUtil: number;
    byStatus: Record<string, number>;
    byCap: Record<CapacityLevel, number>;
    blocked: number;
  };
  eRegion: "" | RegionKey;
  setERegion: (val: "" | RegionKey) => void;
  eStatus: "" | EquipmentMainStatus;
  setEStatus: (val: "" | EquipmentMainStatus) => void;
  eCap: "" | CapacityLevel;
  setECap: (val: "" | CapacityLevel) => void;
  eKeyword: string;
  setEKeyword: (val: string) => void;
  openAddEq: () => void;
  setEqSelected: (eq: Equipment | null) => void;
  setEqDrawerOpen: (val: boolean) => void;
  openEditEq: (eq: Equipment) => void;
  delEq: (eq: Equipment) => void;
};

export function EquipmentPanel({
  C: colors,
  filteredEquipments,
  equipStats,
  eRegion,
  setERegion,
  eStatus,
  setEStatus,
  eCap,
  setECap,
  eKeyword,
  setEKeyword,
  openAddEq,
  setEqSelected,
  setEqDrawerOpen,
  openEditEq,
  delEq,
}: EquipmentPanelProps) {
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
          <h2 style={{ margin: 0, color: colors.text1, fontSize: 16, flex: 1 }}>🔩 設備狀態</h2>
          <button
            onClick={openAddEq}
            style={{
              background: colors.accent,
              border: "none",
              color: "#0d1200",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            + 新增
          </button>
        </div>

        {/* Stat Cards */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12, overflowX: "auto" }}>
          {[
            { label: "總設備數", value: equipStats.total, color: colors.info },
            { label: "平均使用率", value: `${equipStats.avgUtil}%`, color: colors.accent },
            { label: "紅色產能", value: equipStats.byCap["紅"] || 0, color: colors.danger },
            { label: "黃色產能", value: equipStats.byCap["黃"] || 0, color: colors.warning },
            { label: "阻塞中", value: equipStats.blocked, color: colors.warning },
          ].map(s => (
            <div
              key={s.label}
              style={{
                background: colors.panelHigh,
                border: `1px solid ${colors.border}`,
                padding: "8px 12px",
                borderRadius: 4,
                flex: 1,
                minWidth: 120,
              }}
            >
              <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={eRegion}
            onChange={e => setERegion(e.target.value as "" | RegionKey)}
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
            value={eStatus}
            onChange={e => setEStatus(e.target.value as "" | EquipmentMainStatus)}
            className="input"
            style={{ width: 130, flex: "0 0 auto" }}
          >
            <option value="">所有狀態</option>
            {EQUIPMENT_MAIN_STATUSES.map(st => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          <select
            value={eCap}
            onChange={e => setECap(e.target.value as "" | CapacityLevel)}
            className="input"
            style={{ width: 120, flex: "0 0 auto" }}
          >
            <option value="">所有產能</option>
            {CAPACITY_LEVELS.map(cl => (
              <option key={cl} value={cl}>
                {cl}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="搜尋設備ID或客戶..."
            value={eKeyword}
            onChange={e => setEKeyword(e.target.value)}
            className="input"
            style={{ flex: 1, minWidth: 160, width: "auto" }}
          />
        </div>
      </div>

      {/* Equipment Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ position: "sticky", top: 0, background: colors.panelHigh, zIndex: 10 }}>
            <tr>
              {["設備ID", "客戶", "地區", "狀態", "產能", "使用率", "7日趨勢", "操作"].map(h => (
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
            {filteredEquipments.map(eq => (
              <tr key={eq.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td
                  style={{ padding: "8px 12px", color: colors.text1, cursor: "pointer" }}
                  onClick={() => {
                    setEqSelected(eq);
                    setEqDrawerOpen(true);
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{eq.equipmentId}</span>
                </td>
                <td style={{ padding: "8px 12px", color: colors.text2 }}>{eq.customer}</td>
                <td style={{ padding: "8px 12px", color: colors.text2 }}>{REGIONS[eq.region as RegionKey]?.label || eq.region}</td>
                <td style={{ padding: "8px 12px", color: colors.text2 }}>{eq.statusMain}</td>
                <td style={{ padding: "8px 12px" }}>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 3,
                      background: CAPACITY_COLOR[eq.capacity?.level || "綠"],
                      color: "#000",
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    {eq.capacity?.level || "綠"}
                  </div>
                </td>
                <td style={{ padding: "8px 12px", color: colors.text2, textAlign: "right" }}>
                  {eq.capacity?.utilization || 0}%
                </td>
                <td style={{ padding: "8px 12px" }}>
                  {eq.capacity?.trend7d && eq.capacity.trend7d.length > 0 && (
                    <MiniTrend values={eq.capacity.trend7d} color={colors.accent} />
                  )}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <button
                    onClick={() => {
                      setEqSelected(eq);
                      setEqDrawerOpen(true);
                    }}
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
                    詳情
                  </button>
                  <button
                    onClick={() => openEditEq(eq)}
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
                    onClick={() => delEq(eq)}
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
