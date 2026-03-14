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
  customerRegionMap: Record<string, string>;
  machineModels: any[];
  equipments: Equipment[];
};

/** 根據使用率自動推算產能等級 */
function autoLevel(uph: number, targetUph: number): CapacityLevel {
  if (!targetUph || targetUph <= 0) return "綠";
  const pct = uph / targetUph;
  if (pct >= 0.8) return "綠";
  if (pct >= 0.5) return "黃";
  return "紅";
}

/** 更新 UPH 或 targetUph 時，同步換算 utilization 與 level */
function updateCapacity(
  prev: any,
  patch: { uph?: number; targetUph?: number }
): any {
  const uph = patch.uph ?? prev?.uph ?? 0;
  const targetUph = patch.targetUph ?? prev?.targetUph ?? 0;
  const utilization = targetUph > 0 ? Math.min(100, Math.round((uph / targetUph) * 100)) : 0;
  const level = autoLevel(uph, targetUph);
  return { ...prev, uph, targetUph, utilization, level };
}

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
  customerRegionMap,
  machineModels,
  equipments,
}: EquipmentModalProps) {
  // 根據選擇的地區過濾客戶：無對應地區的客戶仍顯示；有對應但不同地區的才隱藏
  const filteredCustomers = eqForm.region
    ? customers.filter(c => {
        const mapped = customerRegionMap[c];
        return !mapped || mapped === eqForm.region;
      })
    : customers;
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
            設備 ID
          </label>
          <input
            type="text"
            placeholder="例：EQ-001（選填）"
            value={eqForm.equipmentId}
            onChange={e => setEqForm({ ...eqForm, equipmentId: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            序號 (S/N) *
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
            客戶 *
          </label>
          <select
            value={eqForm.customer}
            onChange={e => setEqForm({ ...eqForm, customer: e.target.value })}
            className="input"
          >
            <option value="">選擇客戶</option>
            {filteredCustomers.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            工廠 / 裝機地點 *
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
            機型 *
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
            設備所有人 *
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
        {/* 阻塞 checkbox */}
        <div
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            background: colors.panelHigh,
            borderRadius: 4,
            border: `1px solid ${eqForm.blocking ? colors.danger : colors.border}`,
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
          <span style={{ fontSize: 12, color: eqForm.blocking ? colors.danger : colors.text1, fontWeight: eqForm.blocking ? 600 : 400 }}>
            🚧 設備已阻塞
          </span>
          <span style={{ fontSize: 11, color: colors.text3 }}>（勾選後展開詳情）</span>
        </div>

        {/* 阻塞詳情展開區塊 */}
        {eqForm.blocking && typeof eqForm.blocking === "object" && (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: "12px",
              background: `rgba(244,63,94,0.06)`,
              border: `1px solid ${colors.danger}`,
              borderRadius: 4,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
                阻塞原因類別 *
              </label>
              <select
                value={eqForm.blocking.reasonCode || ""}
                onChange={e => setEqForm({ ...eqForm, blocking: { ...eqForm.blocking, reasonCode: e.target.value } })}
                className="input"
              >
                <option value="">選擇原因</option>
                {["料件未到", "人力不足", "環境未備", "客戶延遲", "技術問題", "其他"].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
                預計解除日期 (ETA)
              </label>
              <input
                type="date"
                value={eqForm.blocking.eta || ""}
                onChange={e => setEqForm({ ...eqForm, blocking: { ...eqForm.blocking, eta: e.target.value } })}
                className="input"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
                負責跟進人員 *
              </label>
              <input
                type="text"
                placeholder="例：SCM-Judy"
                value={eqForm.blocking.owner || ""}
                onChange={e => setEqForm({ ...eqForm, blocking: { ...eqForm.blocking, owner: e.target.value } })}
                className="input"
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
                阻塞詳細說明
              </label>
              <input
                type="text"
                placeholder="說明阻塞狀況..."
                value={eqForm.blocking.detail || ""}
                onChange={e => setEqForm({ ...eqForm, blocking: { ...eqForm.blocking, detail: e.target.value } })}
                className="input"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 里程碑 ── */}
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: colors.accent, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        里程碑日期
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        {([
          { key: "installStart",     label: "開始裝機" },
          { key: "installDone",      label: "裝機完成" },
          { key: "trialStart",       label: "開始試產" },
          { key: "trialPass",        label: "試產通過" },
          { key: "prodStart",        label: "正式上產" },
          { key: "reachTargetDate",  label: "達標日期" },
        ] as const).map(({ key, label }) => (
          <div key={key}>
            <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
              {label}
            </label>
            <input
              type="date"
              value={eqForm.milestones?.[key] || ""}
              onChange={e => setEqForm({
                ...eqForm,
                milestones: { ...eqForm.milestones, [key]: e.target.value || undefined },
              })}
              className="input"
            />
          </div>
        ))}
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
            min="0"
            value={eqForm.capacity?.uph ?? 0}
            onChange={e =>
              setEqForm({
                ...eqForm,
                capacity: updateCapacity(eqForm.capacity, { uph: parseInt(e.target.value) || 0 }),
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
            min="0"
            value={eqForm.capacity?.targetUph ?? 0}
            onChange={e =>
              setEqForm({
                ...eqForm,
                capacity: updateCapacity(eqForm.capacity, { targetUph: parseInt(e.target.value) || 0 }),
              })
            }
            className="input"
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 3 }}>
            產能等級（自動 / 可覆寫）
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
        {/* 使用率：唯讀，自動換算 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ display: "block", fontSize: 11, color: colors.text3, marginBottom: 4 }}>
            使用率（自動換算）
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, background: colors.panelHigh, borderRadius: 4, height: 20, overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  height: "100%",
                  width: `${eqForm.capacity?.utilization ?? 0}%`,
                  background:
                    (eqForm.capacity?.level || "綠") === "綠" ? colors.success :
                    (eqForm.capacity?.level || "綠") === "黃" ? colors.warning :
                    colors.danger,
                  transition: "width 0.3s",
                }}
              />
            </div>
            <span style={{ minWidth: 36, textAlign: "right", fontWeight: 600, fontSize: 13, color: colors.text1 }}>
              {eqForm.capacity?.utilization ?? 0}%
            </span>
          </div>
          {(!eqForm.capacity?.targetUph || eqForm.capacity.targetUph === 0) && (
            <div style={{ fontSize: 11, color: colors.text3, marginTop: 4 }}>
              請填入目標 UPH 以自動計算使用率
            </div>
          )}
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
