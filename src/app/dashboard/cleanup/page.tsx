"use client";
// ⚠️  一次性清理工具 — 用完請刪除此檔案與資料夾
// 路徑: /dashboard/cleanup

import { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { INSTALLATIONS_COL } from "@/domain/constants";
import type { Installation } from "@/domain/types";
import { toDisplayShortName } from "@/domain/personDisplay";

type Row = Installation & { _checked: boolean };

/** 判斷是否為「錯誤格式」的 name — 含底線且符合 {客戶}_{型號} 組合模式 */
function isBadName(name: string): boolean {
  // 自動組合格式：包含全形括號或常見客戶關鍵字 + 底線 + 型號關鍵字
  return (
    /[（(（）)）]/.test(name) ||                    // 含括號（客戶名格式）
    /_(?:FlexTRAK|AP-\d|ExoSPHERE)/i.test(name) || // 含 _ 接型號
    /^[^\s].*_[^\s].*$/.test(name) && name.includes("廠") // 含「廠」又有底線
  );
}

export default function CleanupPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, INSTALLATIONS_COL));
      const all = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Installation, "id">),
        _checked: true,
      })) as Row[];
      // 只顯示有問題的記錄
      setRows(all.filter((r) => isBadName(r.name ?? "")));
      setLoading(false);
    })();
  }, []);

  function toggle(id: string) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, _checked: !r._checked } : r));
  }

  function toggleAll(v: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, _checked: v })));
  }

  async function handleDelete() {
    const targets = rows.filter((r) => r._checked);
    if (!confirm(`確定要刪除 ${targets.length} 筆資料？此操作無法復原。`)) return;
    setDeleting(true);
    for (const r of targets) {
      await deleteDoc(doc(db, "installations", r.id));
    }
    setDeleting(false);
    setDone(true);
  }

  const selected = rows.filter((r) => r._checked);

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: "0 auto", fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        🗑️ 批次清理 — 錯誤匯入資料
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: 24, fontSize: 13 }}>
        ⚠️ 清理完成後請刪除 <code>src/app/dashboard/cleanup/</code> 資料夾
      </p>

      {loading && <div>載入中…</div>}

      {!loading && rows.length === 0 && (
        <div style={{ color: "#10b981", fontSize: 16 }}>✅ 沒有偵測到錯誤格式的資料，無需清理。</div>
      )}

      {!loading && rows.length > 0 && !done && (
        <>
          <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>
              偵測到 <strong style={{ color: "#f43f5e" }}>{rows.length}</strong> 筆錯誤資料，已選 <strong>{selected.length}</strong> 筆
            </span>
            <button onClick={() => toggleAll(true)}  style={btnStyle}>全選</button>
            <button onClick={() => toggleAll(false)} style={btnStyle}>取消全選</button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 20 }}>
            <thead>
              <tr style={{ background: "#1e1b4b", textAlign: "left" }}>
                <th style={th}><input type="checkbox" checked={selected.length === rows.length}
                  onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th style={th}>機台序號 (name)</th>
                <th style={th}>機型</th>
                <th style={th}>客戶</th>
                <th style={th}>工程師</th>
                <th style={th}>建立時間</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #334155", opacity: r._checked ? 1 : 0.4 }}>
                  <td style={td}><input type="checkbox" checked={r._checked} onChange={() => toggle(r.id)} /></td>
                  <td style={{ ...td, color: "#f43f5e", fontWeight: 700 }}>{r.name}</td>
                  <td style={td}>{r.modelCode}</td>
                  <td style={td}>{r.customer}</td>
                  <td style={td}>{toDisplayShortName(r.engineer) || "-"}</td>
                  <td style={{ ...td, color: "#94a3b8" }}>
                    {r.createdAt ? new Date(r.createdAt).toLocaleString("zh-TW") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={handleDelete}
            disabled={deleting || selected.length === 0}
            style={{
              background: selected.length > 0 ? "#f43f5e" : "#475569",
              color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 28px", fontSize: 14, fontWeight: 700,
              cursor: selected.length > 0 ? "pointer" : "not-allowed",
            }}
          >
            {deleting ? `刪除中…` : `🗑️ 刪除 ${selected.length} 筆`}
          </button>
        </>
      )}

      {done && (
        <div style={{ color: "#10b981", fontSize: 18, fontWeight: 700 }}>
          ✅ 已刪除完成！請重新匯入正確資料，並刪除 <code>src/app/dashboard/cleanup/</code> 資料夾。
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 12, padding: "3px 10px", borderRadius: 5,
  background: "#334155", color: "#fff", border: "none", cursor: "pointer",
};
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "6px 10px" };
