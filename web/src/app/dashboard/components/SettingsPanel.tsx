"use client";

import Link from "next/link";
import { REGIONS } from "@/domain/constants";
import type { RegionKey } from "@/domain/types";
import { C } from "../utils";

export type SettingsPanelProps = {
  C: typeof C;
  engineers: string[];
  customers: string[];
  customerRegionMap: Record<string, string>;
  machineModels: any[];
  settingEngInput: string;
  setSettingEngInput: (val: string) => void;
  settingCustInput: string;
  setSettingCustInput: (val: string) => void;
  settingModelCode: string;
  setSettingModelCode: (val: string) => void;
  settingModelName: string;
  setSettingModelName: (val: string) => void;
  addEngineer: () => void;
  removeEngineer: (name: string) => void;
  addCustomer: () => void;
  removeCustomer: (name: string) => void;
  addMachineModel: () => void;
  removeMachineModel: (code: string) => void;
  setCustomerRegion: (cust: string, region: string) => void;
};

export function SettingsPanel({
  C: colors,
  engineers,
  customers,
  customerRegionMap,
  machineModels,
  settingEngInput,
  setSettingEngInput,
  settingCustInput,
  setSettingCustInput,
  settingModelCode,
  setSettingModelCode,
  settingModelName,
  setSettingModelName,
  addEngineer,
  removeEngineer,
  addCustomer,
  removeCustomer,
  addMachineModel,
  removeMachineModel,
  setCustomerRegion,
}: SettingsPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", padding: "20px" }}>
      <h2 style={{ color: colors.text1, marginBottom: 20, fontSize: 18, fontWeight: 600 }}>⚙️ 設定</h2>

      {/* Engineers */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, padding: 16, borderRadius: 4, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px 0", color: colors.text1, fontSize: 14, fontWeight: 600 }}>工程師管理</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="輸入工程師名稱..."
            value={settingEngInput}
            onChange={e => setSettingEngInput(e.target.value)}
            className="input"
            style={{ flex: 1 }}
          />
          <button
            onClick={addEngineer}
            style={{
              background: colors.accent,
              border: "none",
              color: "#0d1200",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            新增
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {engineers.map(e => (
            <div
              key={e}
              style={{
                background: colors.panelHigh,
                border: `1px solid ${colors.border}`,
                padding: "4px 8px",
                borderRadius: 3,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: colors.text1,
              }}
            >
              {e}
              <button
                onClick={() => removeEngineer(e)}
                style={{
                  background: "none",
                  border: "none",
                  color: colors.danger,
                  cursor: "pointer",
                  fontSize: 14,
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Customers */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, padding: 16, borderRadius: 4, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px 0", color: colors.text1, fontSize: 14, fontWeight: 600 }}>客戶管理</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="輸入客戶名稱..."
            value={settingCustInput}
            onChange={e => setSettingCustInput(e.target.value)}
            className="input"
            style={{ flex: 1 }}
          />
          <button
            onClick={addCustomer}
            style={{
              background: colors.accent,
              border: "none",
              color: "#0d1200",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            新增
          </button>
        </div>
        <div style={{ fontSize: 13 }}>
          {customers.map(c => (
            <div
              key={c}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "8px",
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <span style={{ flex: 1, color: colors.text1 }}>{c}</span>
              <select
                value={customerRegionMap[c] || ""}
                onChange={e => setCustomerRegion(c, e.target.value)}
                className="input"
                style={{ width: 120, flex: "0 0 auto", fontSize: 12 }}
              >
                <option value="">未分配</option>
                {Object.keys(REGIONS).map(key => {
                  const r = REGIONS[key as RegionKey];
                  return (
                    <option key={key} value={key}>
                      {r.label}
                    </option>
                  );
                })}
              </select>
              <button
                onClick={() => removeCustomer(c)}
                style={{
                  background: colors.dangerDim,
                  border: `1px solid ${colors.danger}`,
                  color: colors.danger,
                  padding: "2px 8px",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                刪除
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Machine Models */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, padding: 16, borderRadius: 4, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 4px 0", color: colors.text1, fontSize: 14, fontWeight: 600 }}>機型管理</h3>
        <div style={{ fontSize: 12, color: colors.text3, marginBottom: 12 }}>新增後可在裝機案與設備表單的機型選單中選取</div>

        {/* Add form */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>機型代碼（唯一識別）</label>
            <input
              type="text"
              placeholder="例：FlexTRAK-Pro"
              value={settingModelCode}
              onChange={e => setSettingModelCode(e.target.value)}
              className="input"
              onKeyDown={e => e.key === "Enter" && addMachineModel()}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>顯示名稱</label>
            <input
              type="text"
              placeholder="例：FlexTRAK Pro v2"
              value={settingModelName}
              onChange={e => setSettingModelName(e.target.value)}
              className="input"
              onKeyDown={e => e.key === "Enter" && addMachineModel()}
            />
          </div>
          <button
            onClick={addMachineModel}
            style={{
              background: colors.accent,
              border: "none",
              color: "#0d1200",
              padding: "7px 14px",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 500,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            新增
          </button>
        </div>

        {/* Model list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(machineModels as any[]).map((m: any) => (
            <div
              key={m.code}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                background: colors.panelHigh,
                border: `1px solid ${colors.border}`,
                borderRadius: 4,
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{ color: colors.text1, fontWeight: 500, fontSize: 13 }}>{m.displayName}</span>
                <span style={{ color: colors.text3, fontSize: 11, marginLeft: 8 }}>代碼：{m.code}</span>
              </div>
              <button
                onClick={() => removeMachineModel(m.code)}
                style={{
                  background: colors.dangerDim,
                  border: `1px solid ${colors.danger}`,
                  color: colors.danger,
                  padding: "2px 8px",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                刪除
              </button>
            </div>
          ))}
          {(machineModels as any[]).length === 0 && (
            <div style={{ color: colors.text3, fontSize: 12, padding: 8 }}>尚未設定任何機型</div>
          )}
        </div>
      </div>

      {/* Advanced */}
      <div style={{ background: colors.panel, border: `1px solid ${colors.border}`, padding: 16, borderRadius: 4 }}>
        <h3 style={{ margin: "0 0 12px 0", color: colors.text1, fontSize: 14, fontWeight: 600 }}>進階設定</h3>
        <Link href="/admin/setup-users" style={{ textDecoration: "none" }}>
          <button
            style={{
              background: colors.accentDim,
              border: `1px solid ${colors.accent}`,
              color: colors.accent,
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            🔐 內建使用者管理
          </button>
        </Link>
      </div>
    </div>
  );
}
