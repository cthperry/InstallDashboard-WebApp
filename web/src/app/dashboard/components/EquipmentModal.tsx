"use client";

import { CAPACITY_LEVELS, EQUIPMENT_MAIN_STATUSES, REGIONS } from "@/domain/constants";
import type { Equipment, RegionKey, CapacityLevel } from "@/domain/types";
import { Modal } from "@/features/ui/Modal";
import { C } from "../utils";

export type EquipmentModalProps = {
  C: typeof C;
  open: boolean;
  onClose: () => void;
  eqEditId: string | null;
  eqForm: any;
  setEqForm: (form: any) => void;
  onSave: () => void;
  onDelete: () => void;
  customers: string[];
  machineModels: any[];
  equipments: Equipment[];
};

export function EquipmentModal({
  C: colors,
  open,
  onClose,
  eqEditId,
  eqForm,
  setEqForm,
  onSave,
  onDelete,
  customers,
  machineModels,
  equipments,
}: EquipmentModalProps) {
  if (!open) return null;

  return (
    <Modal
      title={eqEditId ? "編輯設備" : "新增設備"}
      open={open}
      onClose={onClose}
      width={600}
    >
      {/* ── 基本資訊 ── */}
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        基本資訊
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            設備 ID *
          </label>
          <input
            type="text"
            placeholder="例：EQ-001"
            value={eqForm.equipmentId}
            onChange={e => setEqForm({ ...eqForm, equipmentId: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            序號 (S/N)
          </label>
          <input
            type="text"
            placeholder="機器序號"
            value={eqForm.serialNo}
            onChange={e => setEqForm({ ...eqForm, serialNo: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            地區
          </label>
          <select
            value={eqForm.region}
            onChange={e => setEqForm({ ...eqForm, region: e.target.value })}
            className="input"
          >
            {Object.keys(REGIONS).map(key => {
              const r = REGIONS[key as RegionKey];
              return (
                <option key={key} value={key}>
                  {r.label}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            客戶
          </label>
          <select
            value={eqForm.customer}
            onChange={e => setEqForm({ ...eqForm, customer: e.target.value })}
            className="input"
          >
            <option value="">選擇客戶</option>
            {customers.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            工廠 / 裝機地點
          </label>
          <input
            type="text"
            placeholder="例：台北廠 A棟"
            value={eqForm.site}
            onChange={e => setEqForm({ ...eqForm, site: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            機型
          </label>
          <select
            value={eqForm.modelCode}
            onChange={e => setEqForm({ ...eqForm, modelCode: e.target.value })}
            className="input"
          >
            {machineModels?.map((m: any) => (
              <option key={m.code} value={m.code}>
                {m.displayName || m.code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            設備所有人
          </label>
          <input
            type="text"
            placeholder="負責人姓名"
            value={eqForm.owner}
            onChange={e => setEqForm({ ...eqForm, owner: e.target.value })}
            className="input"
          />
        </div>
      </div>

      {/* ── 狀態 ── */}
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        狀態
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            主狀態
          </label>
          <select
            value={eqForm.statusMain}
            onChange={e => setEqForm({ ...eqForm, statusMain: e.target.value })}
            className="input"
          >
            {EQUIPMENT_MAIN_STATUSES.map(st => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            副狀態（補充說明）
          </label>
          <input
            type="text"
            placeholder="例：待零件、維修中..."
            value={eqForm.statusSub}
            onChange={e => setEqForm({ ...eqForm, statusSub: e.target.value })}
            className="input"
          />
        </div>
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            background: colors.panelHigh,
            borderRadius: 4,
            border: `1px solid ${colors.border}`,
          }}
        >
          <input
            type="checkbox"
            checked={!!eqForm.blocking}
            onChange={e => setEqForm({
              ...eqForm,
              blocking: e.target.checked
                ? (eqForm.blocking && typeof eqForm.blocking === "object"
                    ? eqForm.blocking
                    : { reasonCode: "", detail: "", owner: "", eta: "" })
                : undefined,
            })}
            style={{ cursor: "pointer", accentColor: "#f43f5e", width: 16, height: 16 }}
          />
          <span style={{ fontSize: 12, color: colors.text1 }}>設備已阻塞</span>
          <span style={{ fontSize: 11, color: colors.text3 }}>
            （勾選後會在設備列表標示警示）
          </span>
        </div>
      </div>

      {/* ── 產能 ── */}
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        產能
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            實際時產量 (UPH)
          </label>
          <input
            type="number"
            placeholder="0"
            value={eqForm.capacity?.uph || 0}
            onChange={e =>
              setEqForm({
                ...eqForm,
                capacity: { ...eqForm.capacity, uph: parseInt(e.target.value) },
              })
            }
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            目標時產量 (UPH)
          </label>
          <input
            type="number"
            placeholder="0"
            value={eqForm.capacity?.targetUph || 0}
            onChange={e =>
              setEqForm({
                ...eqForm,
                capacity: { ...eqForm.capacity, targetUph: parseInt(e.target.value) },
              })
            }
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            產能等級
          </label>
          <select
            value={eqForm.capacity?.level || "綠"}
            onChange={e =>
              setEqForm({
                ...eqForm,
                capacity: { ...eqForm.capacity, level: e.target.value as CapacityLevel },
              })
            }
            className="input"
          >
            {CAPACITY_LEVELS.map(cl => (
              <option key={cl} value={cl}>
                {cl}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            使用率：{eqForm.capacity?.utilization || 0}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={eqForm.capacity?.utilization || 0}
            onChange={e =>
              setEqForm({
                ...eqForm,
                capacity: { ...eqForm.capacity, utilization: parseInt(e.target.value) },
              })
            }
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onSave}
          style={{
            background: colors.accent,
            border: "none",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            flex: 1,
          }}
        >
          保存
        </button>
        <button
          onClick={onClose}
          style={{
            background: colors.panelHigh,
            border: `1px solid ${colors.border}`,
            color: colors.text1,
            padding: "6px 12px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          取消
        </button>
        {eqEditId && (
          <button
            onClick={onDelete}
            style={{
              background: colors.dangerDim,
              border: `1px solid ${colors.danger}`,
              color: colors.danger,
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            刪除
          </button>
        )}
      </div>
    </Modal>
  );
}
