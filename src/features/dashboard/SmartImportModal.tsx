"use client";

import { useMemo, useRef, useState } from "react";
import { Modal } from "@/features/ui/Modal";
import { PHASES, REGIONS } from "@/domain/constants";
import type { EquipmentMainStatus, MachineModel, PhaseKey, RegionKey } from "@/domain/types";
import {
  buildEquipmentPayload,
  buildInstallationPayload,
  buildWorkbookInstallationImportKey,
  inferEquipmentStatus,
  inferRegionByCustomer,
  parseWorkbookJsonRows,
  resolveWorkbookImportDisposition,
  validateWorkbookRow,
  type WorkbookRow,
} from "@/domain/importRules";
import { toDisplayShortName } from "@/domain/personDisplay";
import { MAX_ATOMIC_IMPORT_ROWS, commitSmartImportBatch, type SmartImportCommitResult, type SmartImportTransferInput } from "@/features/dashboard/services/smartImportService";

type PreviewRow = WorkbookRow & {
  _idx: number;
  _sourceRowIndex: number;
  _selected: boolean;
  _createEquipment: boolean;
  _region: RegionKey;
  _regionMatched: boolean;
  _phase: PhaseKey;
  _status: EquipmentMainStatus;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: (counts: SmartImportCommitResult) => void;
  customerRegionMap?: Record<string, RegionKey>;
  machineModels?: readonly MachineModel[];
};

function applyLifecycleToPreviewRow(row: PreviewRow, phaseOverride?: PhaseKey): PreviewRow {
  const lifecycle = resolveWorkbookImportDisposition(row, phaseOverride);
  return {
    ...row,
    _phase: lifecycle.phase,
    _createEquipment: lifecycle.transferToEquipment,
    _status: lifecycle.transferToEquipment ? "正式生產中" : inferEquipmentStatus(row),
  };
}

function toPreviewRow(row: WorkbookRow & { rowIndex?: number }, idx: number, customerRegionMap: Record<string, RegionKey>): PreviewRow {
  const regionResult = inferRegionByCustomer(row.customer, customerRegionMap);
  return applyLifecycleToPreviewRow({
    ...row,
    _idx: idx,
    _sourceRowIndex: typeof row.rowIndex === "number" ? row.rowIndex : idx,
    _selected: true,
    _createEquipment: false,
    _region: regionResult.region,
    _regionMatched: regionResult.matched,
    _phase: "ordered",
    _status: inferEquipmentStatus(row),
  });
}

export function SmartImportModal({ open, onClose, onImported, customerRegionMap = {}, machineModels = [] }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<SmartImportCommitResult | null>(null);

  function reset() {
    setRows([]);
    setLoading(false);
    setImporting(false);
    setError("");
    setDone(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(file: File) {
    setRows([]);
    setDone(null);
    setError("");
    setLoading(true);

    const reader = new FileReader();
    reader.onerror = () => {
      setError("讀取 Excel 檔案失敗，請重新選擇檔案後再試");
      setLoading(false);
    };
    reader.onload = async (event) => {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(event.target?.result, { type: "array", cellDates: false });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: "" });
        const parsed = parseWorkbookJsonRows(jsonRows, machineModels);
        if (parsed.length === 0) {
          setError("找不到有效資料列，請確認欄位名稱與範本一致。");
          setLoading(false);
          return;
        }
        setRows(parsed.map((row, idx) => toPreviewRow(row, idx, customerRegionMap)));
      } catch (fileError) {
        setError(fileError instanceof Error ? fileError.message : "Excel 解析失敗");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
    event.target.value = "";
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function setRow(idx: number, updater: (row: PreviewRow) => PreviewRow) {
    setRows((prev) => prev.map((row) => (row._idx === idx ? updater(row) : row)));
  }

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((row) => ({ ...row, _selected: checked })));
  }

  const selectedRows = useMemo(() => rows.filter((row) => row._selected), [rows]);
  const allSelected = rows.length > 0 && rows.every((row) => row._selected);
  const selectedInstallations = selectedRows.filter((row) => !row._createEquipment).length;
  const selectedEquipments = selectedRows.filter((row) => row._createEquipment).length;
  const unmatchedRegions = selectedRows.filter((row) => !row._regionMatched).length;
  const equipmentWithoutSerial = selectedRows.filter((row) => row._createEquipment && !row.serialNo).length;
  const previewTableMinWidth = 1320;

  async function handleImport() {
    if (selectedRows.length === 0) return;
    if (selectedRows.length > MAX_ATOMIC_IMPORT_ROWS) {
      setError(`智慧匯入目前採單批原子寫入，單次最多 ${MAX_ATOMIC_IMPORT_ROWS} 筆，請拆成多次匯入`);
      return;
    }

    setImporting(true);
    setError("");

    try {
      const rowErrors: string[] = [];
      const installationPayloads: Array<ReturnType<typeof buildInstallationPayload>> = [];
      const transfers: SmartImportTransferInput[] = [];

      for (const row of selectedRows) {
        const lifecycle = resolveWorkbookImportDisposition(row, row._phase);
        const installationErrors = validateWorkbookRow(row, "installation", lifecycle.phase);
        if (installationErrors.length > 0) {
          rowErrors.push(`第 ${row._idx + 1} 筆：${installationErrors.join("、")}`);
          continue;
        }

        const installationPayload = {
          ...buildInstallationPayload(row, row._region, new Date(), {
            phase: lifecycle.phase,
            progress: lifecycle.progress,
          }),
          importKey: buildWorkbookInstallationImportKey(row, row._sourceRowIndex),
        };

        if (!lifecycle.transferToEquipment) {
          installationPayloads.push(installationPayload);
          continue;
        }

        const equipmentErrors = validateWorkbookRow(row, "equipment", lifecycle.phase);
        if (equipmentErrors.length > 0) {
          rowErrors.push(`第 ${row._idx + 1} 筆（設備）：${equipmentErrors.join("、")}`);
          continue;
        }

        transfers.push({
          installation: installationPayload,
          equipment: buildEquipmentPayload(row, row._region, {
            statusMain: "正式生產中",
          }),
        });
      }

      if (rowErrors.length > 0) {
        setError(`未匯入：${rowErrors.slice(0, 3).join("；")}${rowErrors.length > 3 ? "…" : ""}`);
        setImporting(false);
        return;
      }

      const counts = await commitSmartImportBatch({
        installations: installationPayloads,
        transfers,
      });
      setDone(counts);
      onImported?.(counts);
    } catch (rowError) {
      setError(rowError instanceof Error ? rowError.message : String(rowError));
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <Modal title="Excel 智慧匯入" open={open} onClose={handleClose} width={rows.length > 0 ? 1920 : 620} contentClassName={rows.length > 0 ? "max-h-[96vh] overflow-hidden p-2 sm:p-3" : undefined}>
      {done ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>匯入完成</div>
          <div style={{ color: "var(--muted-foreground)", marginBottom: 24 }}>
            裝機保留新增 <strong>{done.createdInstallations}</strong> 筆、更新 <strong>{done.updatedInstallations}</strong> 筆；轉入設備新增 <strong>{done.createdEquipments}</strong> 筆、更新 <strong>{done.updatedEquipments}</strong> 筆；自裝機移除 <strong>{done.removedInstallations}</strong> 筆；同批重複設備略過 <strong>{done.skippedDuplicateEquipments}</strong> 筆
          </div>
          <button className="btn btnAccent" onClick={handleClose}>關閉</button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} style={{ border: "1.5px dashed var(--border)", borderRadius: 14, padding: 28, textAlign: "center", background: "var(--card)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>拖曳 Excel 到這裡，或點擊選擇檔案</div>
            <div style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 14 }}>
              同一份 Excel 上傳一次，未正式量產者會留在裝機案件；切到正式量產且有序號者會直接轉入設備台帳，且不保留裝機案件
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} style={{ display: "none" }} />
            <button className="btn btnAccent" onClick={() => fileRef.current?.click()} disabled={loading}>
              {loading ? "解析中…" : "選擇 Excel"}
            </button>
          </div>

          <div style={{ color: "var(--muted-foreground)", fontSize: 12, lineHeight: 1.7 }}>
            規則：<strong>正式量產（機台序號必填）不保留於裝機案件。</strong> 驗收完成日期不再是轉量產的阻擋條件；該列會直接寫入 / 更新設備台帳；若裝機案件內已有同序號資料，匯入時會同步移除。<br />
            智慧匯入採單批原子寫入；若單次超過 {MAX_ATOMIC_IMPORT_ROWS} 筆，請拆批匯入。
          </div>

          {error ? <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div> : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--muted-foreground)" }}>
            <span>已選：<strong>{selectedRows.length}</strong> 筆</span>
            <span>裝機：<strong>{selectedInstallations}</strong> 筆</span>
            <span>設備：<strong>{selectedEquipments}</strong> 筆</span>
            <span style={{ color: unmatchedRegions ? "#f59e0b" : undefined }}>未匹配區域：<strong>{unmatchedRegions}</strong> 筆</span>
            <span style={{ color: equipmentWithoutSerial ? "#ef4444" : undefined }}>設備缺序號：<strong>{equipmentWithoutSerial}</strong> 筆</span>
          </div>

          <div style={{ overflow: "auto", maxHeight: "70vh", maxWidth: "100%", border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
            <table style={{ width: "max-content", minWidth: previewTableMinWidth, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, left: 0, zIndex: 5, padding: "8px 6px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 40 }}><input type="checkbox" checked={allSelected} onChange={(event) => toggleAll(event.target.checked)} /></th>
                  <th style={{ position: "sticky", top: 0, left: 40, zIndex: 5, padding: "8px 6px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 38 }}>#</th>
                  <th style={{ position: "sticky", top: 0, left: 78, zIndex: 5, padding: "8px 6px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 84 }}>匯入內容</th>
                  <th style={{ position: "sticky", top: 0, left: 162, zIndex: 5, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 160 }}>客戶</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 112 }}>機型</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 116 }}>機台序號</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 88 }}>工程師</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 86 }}>區域</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 120 }}>階段 / 狀態</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 108 }}>預計出貨日</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 108 }}>預計安裝日</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 114 }}>實際安裝日期</th>
                  <th style={{ position: "sticky", top: 0, zIndex: 3, padding: "8px 8px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 114 }}>驗收完成日期</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._idx} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ position: "sticky", left: 0, zIndex: 4, padding: "8px 6px", textAlign: "center", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", background: "var(--card)" }}><input type="checkbox" checked={row._selected} onChange={() => setRow(row._idx, (current) => ({ ...current, _selected: !current._selected }))} /></td>
                    <td style={{ position: "sticky", left: 40, zIndex: 4, padding: "8px 6px", fontSize: 12, whiteSpace: "nowrap", borderTop: "1px solid var(--border)", background: "var(--card)" }}>{row._idx + 1}</td>
                    <td style={{ position: "sticky", left: 78, zIndex: 4, padding: "8px 6px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", background: "var(--card)", fontSize: 12, lineHeight: 1.35 }}><div style={{ fontWeight: 700 }}>{row._createEquipment ? "轉入設備" : "裝機案件"}</div><div style={{ color: row._createEquipment ? "#16a34a" : "var(--muted-foreground)" }}>{row._createEquipment ? "正式量產後自裝機移除" : "留在裝機"}</div></td>
                    <td style={{ position: "sticky", left: 162, zIndex: 4, padding: "8px 8px", fontWeight: 700, whiteSpace: "normal", lineHeight: 1.4, wordBreak: "break-word", borderTop: "1px solid var(--border)", maxWidth: 160, background: "var(--card)" }}>{row.customer || "-"}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", fontSize: 12 }}>{row.modelCode || "-"}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", color: row._createEquipment && !row.serialNo ? "#ef4444" : undefined, fontSize: 12 }}>{row.serialNo}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", fontSize: 12 }}>{toDisplayShortName(row.engineer) || "-"}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)" }}>
                      <select style={{ width: 72, fontSize: 12 }} value={row._region} onChange={(event) => setRow(row._idx, (current) => ({ ...current, _region: event.target.value as RegionKey, _regionMatched: true }))}>
                        {(Object.entries(REGIONS) as [RegionKey, { label: string }][]) .map(([key, meta]) => (<option key={key} value={key}>{meta.label}</option>))}
                      </select>
                    </td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <select style={{ width: 118, fontSize: 12 }} value={row._phase} onChange={(event) => setRow(row._idx, (current) => applyLifecycleToPreviewRow(current, event.target.value as PhaseKey))}>
                          {PHASES.map((phase) => (<option key={phase.key} value={phase.key}>{phase.label}</option>))}
                        </select>
                        <div style={{ fontSize: 11, color: row._createEquipment ? "#16a34a" : "var(--muted-foreground)" }}>{row._createEquipment ? `設備台帳狀態：${row._status}` : "不進設備台帳"}</div>
                      </div>
                    </td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}>{row.estArrival || "-"}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}>{row.estComplete || "-"}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}>{row.actArrival || "-"}</td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}>{row.actComplete || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error ? <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div> : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn" onClick={handleClose}>取消</button>
            <button className="btn btnAccent" onClick={handleImport} disabled={importing || selectedRows.length === 0}>{importing ? "匯入中…" : `匯入 ${selectedRows.length} 筆`}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
