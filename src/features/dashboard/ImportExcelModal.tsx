"use client";

import { useRef, useState } from "react";
import { Modal } from "@/features/ui/Modal";
import type { PhaseKey, RegionKey } from "@/domain/types";
import { PHASES, REGIONS } from "@/domain/constants";
import { buildInstallationPayload, buildWorkbookInstallationImportKey, inferRegionByCustomer, parseWorkbookJsonRows, resolveWorkbookImportDisposition, validateWorkbookRow, type WorkbookRow } from "@/domain/importRules";
import { commitSmartImportBatch } from "@/features/dashboard/services/smartImportService";

type PreviewRow = WorkbookRow & {
  _idx: number;
  _sourceRowIndex: number;
  _region: RegionKey;
  _regionMatched: boolean;
  _phase: PhaseKey;
  _progress: number;
  _selected: boolean;
};

async function downloadTemplate() {
  const xlsx = await import("xlsx");
  const headers = ["產品序號", "產品名稱", "訂單來源公司名稱", "預計出貨日", "預計安裝日", "實際安裝日期", "驗收完成日期", "服務人員名稱"];
  const ws = xlsx.utils.aoa_to_sheet([headers]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Incident");
  xlsx.writeFile(wb, "安裝案件匯入範本.xlsx");
}

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: (count: number) => void;
  customerRegionMap?: Record<string, RegionKey>;
};

function applyLifecycleToPreviewRow(row: PreviewRow, phaseOverride?: PhaseKey): PreviewRow {
  const lifecycle = resolveWorkbookImportDisposition(row, phaseOverride);
  return {
    ...row,
    _phase: lifecycle.phase,
    _progress: lifecycle.progress,
  };
}

export function ImportExcelModal({ open, onClose, onImported, customerRegionMap = {} }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  function reset() {
    setRows([]);
    setError("");
    setLoading(false);
    setImporting(false);
    setDone(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(file: File) {
    if (!file) return;
    setError("");
    setLoading(true);
    setRows([]);
    setDone(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setError("讀取 Excel 檔案失敗，請重新選擇檔案後再試");
      setLoading(false);
    };
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const xlsx = await import("xlsx");
        const wb = xlsx.read(data, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true, defval: "" });
        const parsed = parseWorkbookJsonRows(jsonRows);
        if (parsed.length === 0) {
          setError("找不到有效資料列，請確認欄位名稱符合範本格式。");
          setLoading(false);
          return;
        }
        setRows(parsed.map((r, i) => {
          const regionResult = inferRegionByCustomer(r.customer, customerRegionMap);
          return applyLifecycleToPreviewRow({
            ...r,
            _idx: i,
            _sourceRowIndex: r.rowIndex,
            _region: regionResult.region,
            _regionMatched: regionResult.matched,
            _phase: "ordered",
            _progress: 0,
            _selected: true,
          });
        }));
      } catch {
        setError("解析 Excel 失敗，請確認檔案格式正確。");
      }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function toggleRow(idx: number) {
    setRows((prev) => prev.map((r) => r._idx === idx ? { ...r, _selected: !r._selected } : r));
  }

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, _selected: checked })));
  }

  function setRowRegion(idx: number, region: RegionKey) {
    setRows((prev) => prev.map((r) => r._idx === idx ? { ...r, _region: region, _regionMatched: true } : r));
  }

  function setRowPhase(idx: number, phase: PhaseKey) {
    setRows((prev) => prev.map((r) => r._idx === idx ? applyLifecycleToPreviewRow(r, phase) : r));
  }

  const selectedRows = rows.filter((r) => r._selected);
  const allSelected = rows.length > 0 && rows.every((r) => r._selected);
  const unmatchedCount = rows.filter((r) => r._selected && !r._regionMatched).length;

  async function handleImport() {
    if (selectedRows.length === 0) return;
    setImporting(true);
    setError("");
    try {
      const errors: string[] = [];
      const installations = [] as Array<ReturnType<typeof buildInstallationPayload>>;
      for (const r of selectedRows) {
        const rowErrors = validateWorkbookRow(r, "installation", r._phase);
        if (rowErrors.length > 0) {
          errors.push(`第 ${r._idx + 1} 筆：${rowErrors.join("、")}`);
          continue;
        }
        const lifecycle = resolveWorkbookImportDisposition(r, r._phase);
        if (lifecycle.transferToEquipment) {
          errors.push(`第 ${r._idx + 1} 筆：此模式僅匯入裝機案件，正式量產資料請改用「Excel 智慧匯入」`);
          continue;
        }
        installations.push({
          ...buildInstallationPayload(r, r._region, new Date(), { phase: lifecycle.phase, progress: lifecycle.progress }),
          importKey: buildWorkbookInstallationImportKey(r, r._sourceRowIndex),
        });
      }
      if (errors.length > 0) {
        setError(errors.join("；"));
        setImporting(false);
        return;
      }
      const result = await commitSmartImportBatch({ installations, transfers: [] });
      const total = result.createdInstallations + result.updatedInstallations;
      setDone(total);
      onImported?.(total);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <Modal title="Excel 匯入安裝案件" open={open} onClose={handleClose} width={rows.length > 0 ? 1200 : 720}>
      {done !== null ? (
        <div style={{ textAlign: "center", padding: "36px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>匯入完成</div>
          <div style={{ color: "var(--muted-foreground)", marginBottom: 18 }}>已同步安裝案件 {done} 筆</div>
          <button className="btn btnAccent" onClick={handleClose}>關閉</button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} style={{ border: "1.5px dashed var(--border)", borderRadius: 14, padding: 28, textAlign: "center", background: "var(--card)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>拖曳 Excel 到這裡，或點擊選擇檔案</div>
            <div style={{ color: "var(--muted-foreground)", fontSize: 12, marginBottom: 12 }}>此模式只同步裝機案件；若資料已正式量產，請改用「Excel 智慧匯入」轉入設備台帳</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onFileChange} style={{ display: "none" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn btnAccent" onClick={() => fileRef.current?.click()} disabled={loading}>{loading ? "解析中…" : "選擇 Excel"}</button>
              <button className="btn" onClick={() => void downloadTemplate()}>下載範本</button>
            </div>
          </div>
          {error ? <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div> : null}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--muted-foreground)" }}>
            <span>已選：<strong>{selectedRows.length}</strong> 筆</span>
            <span style={{ color: unmatchedCount ? "#f59e0b" : undefined }}>未匹配區域：<strong>{unmatchedCount}</strong> 筆</span>
          </div>
          <div style={{ overflow: "auto", maxHeight: "60vh", border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
            <table style={{ width: "100%", minWidth: 960, borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, left: 0, background: "var(--muted)", width: 40, padding: "8px 6px", borderBottom: "1px solid var(--border)" }}><input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} /></th>
                  <th style={{ position: "sticky", top: 0, left: 40, background: "var(--muted)", width: 40, padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>#</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--muted)", padding: "8px 8px", borderBottom: "1px solid var(--border)" }}>客戶</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--muted)", padding: "8px 8px", borderBottom: "1px solid var(--border)" }}>機型</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--muted)", padding: "8px 8px", borderBottom: "1px solid var(--border)" }}>機台序號</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--muted)", padding: "8px 8px", borderBottom: "1px solid var(--border)" }}>區域</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--muted)", padding: "8px 8px", borderBottom: "1px solid var(--border)" }}>階段</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--muted)", padding: "8px 8px", borderBottom: "1px solid var(--border)" }}>預計出貨日</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--muted)", padding: "8px 8px", borderBottom: "1px solid var(--border)" }}>預計安裝日</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--muted)", padding: "8px 8px", borderBottom: "1px solid var(--border)" }}>實際安裝日期</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--muted)", padding: "8px 8px", borderBottom: "1px solid var(--border)" }}>驗收完成日期</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._idx}>
                    <td style={{ position: "sticky", left: 0, background: "var(--card)", padding: "8px 6px", borderTop: "1px solid var(--border)" }}><input type="checkbox" checked={r._selected} onChange={() => toggleRow(r._idx)} /></td>
                    <td style={{ position: "sticky", left: 40, background: "var(--card)", padding: "8px 6px", borderTop: "1px solid var(--border)" }}>{r._idx + 1}</td>
                    <td style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}>{r.customer || "-"}</td>
                    <td style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}>{r.modelCode || "-"}</td>
                    <td style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}>{r.serialNo || "-"}</td>
                    <td style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}><select style={{ width: 88, fontSize: 12 }} value={r._region} onChange={(e) => setRowRegion(r._idx, e.target.value as RegionKey)}>{(Object.entries(REGIONS) as [RegionKey, { label: string }][]).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></td>
                    <td style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}><select style={{ width: 118, fontSize: 12 }} value={r._phase} onChange={(e) => setRowPhase(r._idx, e.target.value as PhaseKey)}>{PHASES.map((phase) => <option key={phase.key} value={phase.key}>{phase.label}</option>)}</select></td>
                    <td style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}>{r.estArrival || "-"}</td>
                    <td style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}>{r.estComplete || "-"}</td>
                    <td style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}>{r.actArrival || "-"}</td>
                    <td style={{ padding: "8px 8px", borderTop: "1px solid var(--border)" }}>{r.actComplete || "-"}</td>
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
