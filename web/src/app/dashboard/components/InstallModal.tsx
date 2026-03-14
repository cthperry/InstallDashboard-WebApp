"use client";

import { PHASES, PHASE_CHECKLISTS, REGIONS } from "@/domain/constants";
import { getCheckValue, setCheckValue } from "@/domain/checklistUtils";
import type { Installation, InstallFormData, MachineModel, RegionKey } from "@/domain/types";
import { Modal } from "@/features/ui/Modal";
import { C } from "../utils";

export type InstallModalProps = {
  C: typeof C;
  open: boolean;
  onClose: () => void;
  installEditId: string | null;
  installForm: InstallFormData;
  setInstallForm: (form: InstallFormData) => void;
  installSaving: boolean;
  onSave: () => void;
  onDelete: () => void;
  machineModels: MachineModel[];
  engineers: string[];
  formCustomers: string[];
  installations: Installation[];
};

export function InstallModal({
  C: colors,
  open,
  onClose,
  installEditId,
  installForm,
  setInstallForm,
  installSaving,
  onSave,
  onDelete,
  machineModels,
  engineers,
  formCustomers,
  installations,
}: InstallModalProps) {
  if (!open) return null;

  return (
    <Modal
      title={installEditId ? "編輯裝機案" : "新增裝機案"}
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
            案件名稱 *
          </label>
          <input
            type="text"
            placeholder="例：台北101-001"
            value={installForm.name}
            onChange={e => setInstallForm({ ...installForm, name: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            機型
          </label>
          <select
            value={installForm.modelCode}
            onChange={e => setInstallForm({ ...installForm, modelCode: e.target.value })}
            className="input"
          >
            {machineModels.map(m => (
              <option key={m.code} value={m.code}>
                {m.displayName || m.code}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            機器序號 (S/N){installForm.phase !== "ordered" ? <span style={{ color: colors.danger }}> *</span> : <span style={{ color: colors.text3 }}> （備貨出貨後必填）</span>}
          </label>
          <input
            type="text"
            placeholder="例：SN-20260101-001"
            value={installForm.serialNo ?? ""}
            onChange={e => setInstallForm({ ...installForm, serialNo: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            地區
          </label>
          <select
            value={installForm.region}
            onChange={e => setInstallForm({ ...installForm, region: e.target.value as RegionKey })}
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
            value={installForm.customer}
            onChange={e => setInstallForm({ ...installForm, customer: e.target.value })}
            className="input"
          >
            <option value="">選擇客戶</option>
            {formCustomers.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            負責工程師
          </label>
          <select
            value={installForm.engineer}
            onChange={e => setInstallForm({ ...installForm, engineer: e.target.value })}
            className="input"
          >
            <option value="">選擇工程師</option>
            {engineers.map(e => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            裝機階段
          </label>
          <select
            value={installForm.phase}
            onChange={e => setInstallForm({ ...installForm, phase: e.target.value as import("@/domain/types").PhaseKey })}
            className="input"
          >
            {PHASES.map(p => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            客戶聯絡人
          </label>
          <input
            type="text"
            placeholder="聯絡人姓名"
            value={installForm.custContact}
            onChange={e => setInstallForm({ ...installForm, custContact: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            客戶電話
          </label>
          <input
            type="text"
            placeholder="聯絡電話"
            value={installForm.custPhone}
            onChange={e => setInstallForm({ ...installForm, custPhone: e.target.value })}
            className="input"
          />
        </div>
      </div>

      {/* ── 日期 ── */}
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        日期
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            預計出貨
          </label>
          <input
            type="date"
            value={installForm.estArrival}
            onChange={e => setInstallForm({ ...installForm, estArrival: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            實際出貨
          </label>
          <input
            type="date"
            value={installForm.actArrival}
            onChange={e => setInstallForm({ ...installForm, actArrival: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            預計完工 (SLA依據)
          </label>
          <input
            type="date"
            value={installForm.estComplete}
            onChange={e => setInstallForm({ ...installForm, estComplete: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            實際完工
          </label>
          <input
            type="date"
            value={installForm.actComplete}
            onChange={e => setInstallForm({ ...installForm, actComplete: e.target.value })}
            className="input"
          />
        </div>
      </div>

      {/* ── 進度 ── */}
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        施工進度
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={installForm.progress || 0}
            onChange={e => setInstallForm({ ...installForm, progress: parseInt(e.target.value) })}
            style={{ flex: 1 }}
          />
          <div style={{ fontSize: 14, color: colors.accent, fontWeight: 700, minWidth: 38, textAlign: "right" }}>
            {installForm.progress || 0}%
          </div>
        </div>
      </div>

      {/* Checklist */}
      {installForm.phase && PHASE_CHECKLISTS[installForm.phase] && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 8, fontSize: 12, color: colors.text2, fontWeight: 600 }}>
            檢查清單
          </label>
          <div style={{ display: "grid", gap: 6 }}>
            {PHASE_CHECKLISTS[installForm.phase].map((item: string, idx: number) => (
              <label
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: colors.text1,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={getCheckValue(installForm.checklist, installForm.phase, idx, item)}
                  onChange={e =>
                    setInstallForm({
                      ...installForm,
                      checklist: setCheckValue(installForm.checklist, installForm.phase, idx, item, e.target.checked),
                    })
                  }
                  style={{ cursor: "pointer", accentColor: C.accent }}
                />
                {item}
              </label>
            ))}
          </div>
        </div>
      )}

      <textarea
        placeholder="備註"
        value={installForm.notes}
        onChange={e => setInstallForm({ ...installForm, notes: e.target.value })}
        className="input"
        style={{ gridColumn: "1 / -1", minHeight: 80, width: "100%", marginBottom: 12 }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onSave}
          disabled={installSaving}
          style={{
            background: colors.accent,
            border: "none",
            color: "#0d1200",
            padding: "6px 12px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            flex: 1,
            opacity: installSaving ? 0.6 : 1,
          }}
        >
          {installSaving ? "保存中..." : "保存"}
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
        {installEditId && (
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
