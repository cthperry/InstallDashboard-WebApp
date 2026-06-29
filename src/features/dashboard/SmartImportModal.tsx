"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/features/ui/Modal";
import { useAuth } from "@/features/auth/AuthProvider";
import { PHASES, REGIONS } from "@/domain/constants";
import type { EquipmentMainStatus, ImportConfigDoc, ImportSessionStatus, MachineModel, PhaseKey, RegionKey } from "@/domain/types";
import {
  buildEquipmentPayload,
  buildInstallationPayload,
  buildWorkbookInstallationImportKey,
  getWorkbookFileValidationError,
  inferEquipmentStatus,
  inferRegionByCustomer,
  parseWorkbookJsonRows,
  readWorkbookJsonRows,
  resolveWorkbookImportDisposition,
  validateWorkbookRow,
  type WorkbookRow,
} from "@/domain/importRules";
import { toDisplayShortName } from "@/domain/personDisplay";
import { MAX_ATOMIC_IMPORT_ROWS, commitSmartImportBatch, type SmartImportCommitResult, type SmartImportTransferInput } from "@/features/dashboard/services/smartImportService";
import { createImportSession, listenImportSessions, type ImportSessionRow } from "@/features/data/importSessions";
import { todayInTaipeiYmd } from "@/lib/utils";

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
  importConfig?: ImportConfigDoc | null;
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

export function getPreviewRowIssues(row: PreviewRow): string[] {
  const lifecycle = resolveWorkbookImportDisposition(row, row._phase);
  const issues = [...validateWorkbookRow(row, "installation", lifecycle.phase)];
  if (!row._regionMatched) issues.push("區域需確認");
  if (lifecycle.transferToEquipment) {
    issues.push(...validateWorkbookRow(row, "equipment", lifecycle.phase).map((issue) => "設備：" + issue));
  }
  return Array.from(new Set(issues));
}

function toCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildRejectRowsCsv(rows: PreviewRow[]): string {
  const columns = [
    "sourceRow",
    "customer",
    "modelCode",
    "serialNo",
    "engineer",
    "region",
    "phase",
    "estArrival",
    "estComplete",
    "actArrival",
    "actComplete",
    "issues",
  ];
  return [
    columns.join(","),
    ...rows.map((row) => [
      String(row._sourceRowIndex + 1),
      row.customer,
      row.modelCode,
      row.serialNo,
      row.engineer,
      row._region,
      row._phase,
      row.estArrival,
      row.estComplete,
      row.actArrival,
      row.actComplete,
      getPreviewRowIssues(row).join("；"),
    ].map((value) => toCsvCell(String(value ?? "").replace(/\r?\n/g, " "))).join(",")),
  ].join("\r\n");
}

function downloadRejectRowsCsv(rows: PreviewRow[], fileName: string): void {
  const csv = buildRejectRowsCsv(rows);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `import_rejects_${fileName.replace(/\.[^.]+$/, "") || todayInTaipeiYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function formatSessionTime(value?: number): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function ImportSessionList({ rows, error }: { rows: ImportSessionRow[]; error: string }) {
  if (error) {
    return <div style={{ color: "#f59e0b", fontSize: 12 }}>匯入紀錄讀取失敗：{error}</div>;
  }
  if (rows.length === 0) {
    return <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>尚無匯入 session history。</div>;
  }
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {rows.map((session) => (
        <div key={session.id} style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.fileName}</div>
            <div style={{ color: "var(--muted-foreground)" }}>{formatSessionTime(session.createdAt)} · {session.actorEmail}</div>
          </div>
          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
            <div style={{ fontWeight: 900, color: session.status === "committed" ? "#10b981" : "#ef4444" }}>{session.status.toUpperCase()}</div>
            <div style={{ color: "var(--muted-foreground)" }}>OK {session.acceptedRows} / Reject {session.rejectedRows}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SmartImportModal({ open, onClose, onImported, customerRegionMap = {}, machineModels = [], importConfig = null }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [sourceFileName, setSourceFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<SmartImportCommitResult | null>(null);
  const [showOnlyIssues, setShowOnlyIssues] = useState(true);
  const [sessions, setSessions] = useState<ImportSessionRow[]>([]);
  const [sessionErr, setSessionErr] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");

  function reset() {
    setRows([]);
    setSourceFileName("");
    setLoading(false);
    setImporting(false);
    setError("");
    setDone(null);
    setSessionNotice("");
    setShowOnlyIssues(true);
  }

  useEffect(() => {
    if (!open) return;
    const unsubscribe = listenImportSessions(
      setSessions,
      (sessionError) => setSessionErr(sessionError instanceof Error ? sessionError.message : String(sessionError)),
      5,
    );
    return () => unsubscribe?.();
  }, [open]);

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(file: File) {
    const fileError = getWorkbookFileValidationError(file);
    if (fileError) {
      setError(fileError);
      return;
    }
    setRows([]);
    setSourceFileName(file.name);
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
        const data = event.target?.result;
        if (!(data instanceof ArrayBuffer)) throw new Error("讀取 Excel 檔案失敗");
        const jsonRows = await readWorkbookJsonRows(data);
        const parsed = parseWorkbookJsonRows(jsonRows, machineModels, importConfig);
        if (parsed.length === 0) {
          setError("找不到有效資料列，請確認欄位名稱與範本一致。");
          setLoading(false);
          return;
        }
        setRows(parsed.map((row, idx) => toPreviewRow(row, idx, customerRegionMap)));
        setShowOnlyIssues(true);
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
  const someSelected = rows.some((row) => row._selected) && !allSelected;
  const selectedInstallations = selectedRows.filter((row) => !row._createEquipment).length;
  const selectedEquipments = selectedRows.filter((row) => row._createEquipment).length;
  const unmatchedRegions = selectedRows.filter((row) => !row._regionMatched).length;
  const equipmentWithoutSerial = selectedRows.filter((row) => row._createEquipment && !row.serialNo).length;
  const issueRows = useMemo(() => rows.filter((row) => getPreviewRowIssues(row).length > 0), [rows]);
  const selectedIssueRows = useMemo(() => selectedRows.filter((row) => getPreviewRowIssues(row).length > 0), [selectedRows]);
  const visibleRows = showOnlyIssues && issueRows.length > 0 ? issueRows : rows;
  const importBlockedReason = selectedRows.length === 0
    ? "請至少選取 1 筆資料後再匯入。"
    : selectedIssueRows.length > 0
      ? `已選資料仍有 ${selectedIssueRows.length} 筆需確認；請修正區域、階段或序號，或取消勾選後再匯入。`
      : "";
  const previewTableMinWidth = 1320;

  async function recordImportSession(status: ImportSessionStatus, counts: SmartImportCommitResult | null, errorSample: string[]) {
    if (!user?.email) return;
    try {
      await createImportSession({
        fileName: sourceFileName || "unknown.xlsx",
        status,
        totalRows: rows.length,
        selectedRows: selectedRows.length,
        acceptedRows: Math.max(0, selectedRows.length - selectedIssueRows.length),
        rejectedRows: selectedIssueRows.length,
        createdInstallations: counts?.createdInstallations ?? 0,
        updatedInstallations: counts?.updatedInstallations ?? 0,
        createdEquipments: counts?.createdEquipments ?? 0,
        updatedEquipments: counts?.updatedEquipments ?? 0,
        removedInstallations: counts?.removedInstallations ?? 0,
        skippedDuplicateEquipments: counts?.skippedDuplicateEquipments ?? 0,
        errorSample,
        actorEmail: user.email,
      });
    } catch (sessionError) {
      setSessionErr(sessionError instanceof Error ? sessionError.message : String(sessionError));
    }
  }

  async function handleSaveDryRunSession() {
    if (rows.length === 0) return;
    await recordImportSession("dryRun", null, selectedIssueRows.flatMap((row) => getPreviewRowIssues(row)).slice(0, 20));
    setError("");
    setSessionNotice("已儲存 dry-run session");
  }

  async function handleImport() {
    if (selectedRows.length === 0) return;
    if (selectedIssueRows.length > 0) {
      setShowOnlyIssues(true);
      setError(importBlockedReason);
      return;
    }
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
        await recordImportSession("failed", null, rowErrors);
        setError(`未匯入：${rowErrors.slice(0, 3).join("；")}${rowErrors.length > 3 ? "…" : ""}`);
        setImporting(false);
        return;
      }

      const counts = await commitSmartImportBatch({
        installations: installationPayloads,
        transfers,
      });
      await recordImportSession("committed", counts, selectedIssueRows.flatMap((row) => getPreviewRowIssues(row)).slice(0, 20));
      setDone(counts);
      onImported?.(counts);
    } catch (rowError) {
      const message = rowError instanceof Error ? rowError.message : String(rowError);
      await recordImportSession("failed", null, [message]);
      setError(message);
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
            <input ref={fileRef} type="file" accept=".xlsx" onChange={onFileChange} style={{ display: "none" }} />
            <button className="btn btnAccent" onClick={() => fileRef.current?.click()} disabled={loading}>
              {loading ? "解析中…" : "選擇 Excel"}
            </button>
          </div>

          <div style={{ color: "var(--muted-foreground)", fontSize: 12, lineHeight: 1.7 }}>
            規則：<strong>正式量產（機台序號必填）不保留於裝機案件。</strong> 驗收完成日期不再是轉量產的阻擋條件；該列會直接寫入 / 更新設備台帳；若裝機案件內已有同序號資料，匯入時會同步移除。<br />
            智慧匯入採單批原子寫入；若單次超過 {MAX_ATOMIC_IMPORT_ROWS} 筆，請拆批匯入。
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>最近匯入紀錄</div>
            <ImportSessionList rows={sessions} error={sessionErr} />
          </div>

          {error ? <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div> : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="importReviewSummary">
            <div>
              <span>總列數</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <span>可直接處理</span>
              <strong>{Math.max(0, rows.length - issueRows.length)}</strong>
            </div>
            <div className={issueRows.length ? "importReviewAttention" : ""}>
              <span>需確認</span>
              <strong>{issueRows.length}</strong>
            </div>
            <div>
              <span>目前顯示</span>
              <strong>{visibleRows.length}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--muted-foreground)" }}>
            <span>已選：<strong>{selectedRows.length}</strong> 筆</span>
            <span>裝機：<strong>{selectedInstallations}</strong> 筆</span>
            <span>設備：<strong>{selectedEquipments}</strong> 筆</span>
            <span style={{ color: unmatchedRegions ? "#f59e0b" : undefined }}>未匹配區域：<strong>{unmatchedRegions}</strong> 筆</span>
            <span style={{ color: equipmentWithoutSerial ? "#ef4444" : undefined }}>設備缺序號：<strong>{equipmentWithoutSerial}</strong> 筆</span>
          </div>

          <div className="importReviewToolbar">
            <label>
              <input type="checkbox" checked={showOnlyIssues} onChange={(event) => setShowOnlyIssues(event.target.checked)} disabled={issueRows.length === 0} />
              只顯示需人工確認的列
            </label>
            <span>{issueRows.length === 0 ? "目前沒有異常列，可直接匯入。" : "正常列已預設選取，不需要逐筆檢查。"}</span>
            {issueRows.length > 0 ? (
              <button className="btn btnSmall" type="button" onClick={() => downloadRejectRowsCsv(issueRows, sourceFileName)}>
                下載 reject CSV
              </button>
            ) : null}
            <button className="btn btnSmall" type="button" onClick={handleSaveDryRunSession}>
              儲存 dry-run session
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, fontSize: 12 }}>
            <div className="card" style={{ padding: 10 }}>
              <div style={{ color: "var(--muted-foreground)", fontWeight: 900 }}>Dry-run 結果</div>
              <div style={{ marginTop: 4 }}>Accepted {Math.max(0, selectedRows.length - selectedIssueRows.length)} / Rejected {selectedIssueRows.length}</div>
            </div>
            <div className="card" style={{ padding: 10 }}>
              <div style={{ color: "var(--muted-foreground)", fontWeight: 900 }}>最近匯入</div>
              <div style={{ marginTop: 4 }}>{sessions[0]?.fileName ?? "尚無紀錄"}</div>
            </div>
          </div>

          <div style={{ overflow: "auto", maxHeight: "70vh", maxWidth: "100%", border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
            <table style={{ width: "max-content", minWidth: previewTableMinWidth, tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, left: 0, zIndex: 5, padding: "8px 6px", whiteSpace: "nowrap", background: "var(--muted)", borderBottom: "1px solid var(--border)", width: 40 }}>
                    <input
                      aria-label="選取全部匯入列"
                      type="checkbox"
                      checked={allSelected}
                      ref={(element) => { if (element) element.indeterminate = someSelected; }}
                      onChange={(event) => toggleAll(event.target.checked)}
                    />
                  </th>
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
                {visibleRows.map((row) => {
                  const rowIssues = getPreviewRowIssues(row);
                  return (
                  <tr key={row._idx} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ position: "sticky", left: 0, zIndex: 4, padding: "8px 6px", textAlign: "center", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", background: "var(--card)" }}>
                      <input
                        aria-label={`選取第 ${row._idx + 1} 列`}
                        type="checkbox"
                        checked={row._selected}
                        onChange={() => setRow(row._idx, (current) => ({ ...current, _selected: !current._selected }))}
                      />
                    </td>
                    <td style={{ position: "sticky", left: 40, zIndex: 4, padding: "8px 6px", fontSize: 12, whiteSpace: "nowrap", borderTop: "1px solid var(--border)", background: "var(--card)" }}>{row._idx + 1}</td>
                    <td style={{ position: "sticky", left: 78, zIndex: 4, padding: "8px 6px", whiteSpace: "nowrap", borderTop: "1px solid var(--border)", background: "var(--card)", fontSize: 12, lineHeight: 1.35 }}>
                      <div style={{ fontWeight: 700 }}>{row._createEquipment ? "轉入設備" : "裝機案件"}</div>
                      <div style={{ color: row._createEquipment ? "#16a34a" : "var(--muted-foreground)" }}>{row._createEquipment ? "正式量產後自裝機移除" : "留在裝機"}</div>
                      {rowIssues.length > 0 ? <div className="importIssueList">{rowIssues.slice(0, 2).join("、")}</div> : null}
                    </td>
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
                );})}
              </tbody>
            </table>
          </div>

          {error ? <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div> : null}
          {sessionNotice ? <div style={{ color: "#10b981", fontSize: 12 }}>{sessionNotice}</div> : null}
          {importBlockedReason ? <div className="importReviewBlocker" id="smart-import-blocker">{importBlockedReason}</div> : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn" onClick={handleClose}>取消</button>
            <button
              className="btn btnAccent"
              onClick={handleImport}
              disabled={importing || Boolean(importBlockedReason)}
              aria-describedby={importBlockedReason ? "smart-import-blocker" : undefined}
              title={importBlockedReason || undefined}
            >
              {importing ? "匯入中…" : `匯入 ${selectedRows.length} 筆`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
