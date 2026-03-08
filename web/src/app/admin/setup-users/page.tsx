"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { RequireAuth } from "@/features/auth/RequireAuth";

const FIREBASE_CONFIG = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!
};

const PREDEFINED_USERS: { email: string; displayName: string }[] = [
  { email: "frank_chen@premtek.com.tw",   displayName: "Frank Chen" },
  { email: "perry_chuang@premtek.com.tw", displayName: "Perry Chuang" },
  { email: "stone_shih@premtek.com.tw",   displayName: "Stone Shih" },
  { email: "simon_kuo@premtek.com.tw",    displayName: "Simon Kuo" },
  { email: "wayne_chang@premtek.com.tw",  displayName: "Wayne Chang" },
  { email: "sam_ch_chen@premtek.com.tw",  displayName: "Sam CH Chen" },
  { email: "asher_chang@premtek.com.tw",  displayName: "Asher Chang" },
];

type UserStatus = "idle" | "creating" | "ok" | "exists" | "error";
type Role = "user" | "admin";

interface UserState {
  email: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  detail: string;
}

interface ExistingUser {
  uid: string;
  email: string;
  displayName?: string;
  role: Role;
  mustChangePassword?: boolean;
  updatingRole?: boolean;
  deleting?: boolean;
}

async function createOneUser(email: string, role: Role): Promise<{ uid: string }> {
  const appName = `create-user-${Date.now()}`;
  const app = initializeApp(FIREBASE_CONFIG, appName);
  const auth = getAuth(app);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, "123456");
    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      role,
      mustChangePassword: true,
      updatedAt: Date.now(),
      createdAt: serverTimestamp()
    });
    return { uid: cred.user.uid };
  } finally {
    try { await deleteApp(app); } catch (_) {}
  }
}

export default function SetupUsersPage() {
  return (
    <RequireAuth>
      <SetupUsersContent />
    </RequireAuth>
  );
}

function SetupUsersContent() {
  const { user: currentUser, isAdmin } = useAuth();
  const router = useRouter();

  // ── 現有使用者 ──
  const [existingUsers, setExistingUsers] = useState<ExistingUser[]>([]);
  const [loadingUsers, setLoadingUsers]   = useState(true);

  // ── 內建使用者批次建立狀態 ──
  const [users, setUsers]   = useState<UserState[]>(
    PREDEFINED_USERS.map((u) => ({ ...u, role: "user", status: "idle", detail: "" }))
  );
  const [running, setRunning] = useState(false);
  const [done, setDone]       = useState(false);

  // ── 新增單一使用者 ──
  const [newEmail,   setNewEmail]   = useState("");
  const [newDisplay, setNewDisplay] = useState("");
  const [newRole,    setNewRole]    = useState<Role>("user");
  const [addStatus,  setAddStatus]  = useState<"idle"|"creating"|"ok"|"exists"|"error">("idle");
  const [addDetail,  setAddDetail]  = useState("");

  const statusIcon: Record<UserStatus, string> = { idle: "⬜", creating: "⏳", ok: "✅", exists: "🔁", error: "❌" };
  const statusColor: Record<UserStatus, string> = { idle: "#94a3b8", creating: "#f59e0b", ok: "#10b981", exists: "#3b82f6", error: "#ef4444" };

  // ── 讀取現有使用者 ──
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const list: ExistingUser[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email ?? "",
          displayName: data.displayName,
          role: data.role === "admin" ? "admin" : "user",
          mustChangePassword: data.mustChangePassword === true
        };
      });
      list.sort((a, b) => a.email.localeCompare(b.email));
      setExistingUsers(list);
    } catch (e) {
      console.error("fetch users failed", e);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => { if (isAdmin) fetchUsers(); }, [isAdmin]);

  // ── 更改現有使用者權限 ──
  const handleRoleChange = async (uid: string, newRoleVal: Role) => {
    if (uid === currentUser?.uid && newRoleVal !== "admin") {
      alert("無法降低自己的權限");
      return;
    }
    setExistingUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, updatingRole: true } : u));
    try {
      await updateDoc(doc(db, "users", uid), { role: newRoleVal, updatedAt: Date.now() });
      setExistingUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, role: newRoleVal, updatingRole: false } : u));
    } catch (e) {
      alert("更改失敗：" + String(e));
      setExistingUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, updatingRole: false } : u));
    }
  };

  // ── 刪除使用者 ──
  const handleDelete = async (uid: string, email: string) => {
    if (uid === currentUser?.uid) { alert("無法刪除自己的帳號"); return; }
    if (!confirm(`確定要刪除 ${email} 的 Firestore 資料嗎？\n（Firebase Auth 帳號請另至 Firebase Console 刪除）`)) return;
    setExistingUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, deleting: true } : u));
    try {
      await deleteDoc(doc(db, "users", uid));
      setExistingUsers((prev) => prev.filter((u) => u.uid !== uid));
    } catch (e) {
      alert("刪除失敗：" + String(e));
      setExistingUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, deleting: false } : u));
    }
  };

  // ── 批次建立內建使用者 ──
  const updateUser = (email: string, patch: Partial<UserState>) =>
    setUsers((prev) => prev.map((u) => u.email === email ? { ...u, ...patch } : u));

  const createAllUsers = async () => {
    if (!isAdmin) return;
    setRunning(true); setDone(false);
    const appName = `setup-users-${Date.now()}`;
    const app = initializeApp(FIREBASE_CONFIG, appName);
    const auth = getAuth(app);
    for (const u of users) {
      updateUser(u.email, { status: "creating", detail: "" });
      try {
        const cred = await createUserWithEmailAndPassword(auth, u.email, "123456");
        await setDoc(doc(db, "users", cred.user.uid), {
          email: u.email,
          role: u.role,
          mustChangePassword: true,
          updatedAt: Date.now(),
          createdAt: serverTimestamp()
        });
        updateUser(u.email, { status: "ok", detail: `UID: ${cred.user.uid.slice(0, 8)}…` });
      } catch (e: any) {
        const code = String(e?.code || "");
        updateUser(u.email, code === "auth/email-already-in-use"
          ? { status: "exists", detail: "帳號已存在（跳過）" }
          : { status: "error", detail: e?.message ?? code });
      }
    }
    try { await deleteApp(app); } catch (_) {}
    setRunning(false); setDone(true);
    await fetchUsers();
  };

  // ── 新增單一自訂使用者 ──
  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!/@premtek\.com\.tw$/i.test(email)) {
      setAddStatus("error"); setAddDetail("Email 必須是 @premtek.com.tw"); return;
    }
    setAddStatus("creating"); setAddDetail("");
    try {
      const { uid } = await createOneUser(email, newRole);
      setAddStatus("ok");
      setAddDetail("建立成功！");
      setNewEmail(""); setNewDisplay(""); setNewRole("user");
      setTimeout(() => { setAddStatus("idle"); setAddDetail(""); }, 2500);
      await fetchUsers();
    } catch (e: any) {
      const code = String(e?.code || "");
      setAddStatus(code === "auth/email-already-in-use" ? "exists" : "error");
      setAddDetail(code === "auth/email-already-in-use" ? "此 Email 已有帳號" : (e?.message ?? code));
    }
  };

  if (!isAdmin) return (
    <main style={{ padding: 32, textAlign: "center" }}>
      <div style={{ color: "#ef4444", fontWeight: 900 }}>⛔ 僅限管理員存取</div>
      <button style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, border: "1px solid #e2e8f0", cursor: "pointer" }}
        onClick={() => router.replace("/dashboard")}>返回 Dashboard</button>
    </main>
  );

  const roleSelect = (val: Role, onChange: (r: Role) => void, disabled?: boolean) => (
    <select
      value={val}
      onChange={(e) => onChange(e.target.value as Role)}
      disabled={disabled}
      style={{
        padding: "5px 8px", borderRadius: 6, border: "1px solid #e2e8f0",
        fontSize: 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        background: val === "admin" ? "rgba(239,68,68,0.06)" : "rgba(59,130,246,0.06)",
        color: val === "admin" ? "#dc2626" : "#2563eb", outline: "none"
      }}
    >
      <option value="user">一般使用者</option>
      <option value="admin">管理員</option>
    </select>
  );

  return (
    <main style={{ minHeight: "100svh", background: "#f0f4f8", padding: 24 }}>
      <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.replace("/dashboard")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 22 }}>←</button>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>使用者管理</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>初始密碼 123456 · 首次登入須修改</div>
          </div>
        </div>

        {/* ── 新增使用者 ── */}
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>➕ 新增使用者</div>
          </div>
          <form onSubmit={handleAddUser} style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "2 1 200px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 }}>Email（必填）</div>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@premtek.com.tw" required disabled={addStatus === "creating"}
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, background: "#f8fafc", outline: "none" }} />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 }}>顯示名稱（選填）</div>
                <input type="text" value={newDisplay} onChange={(e) => setNewDisplay(e.target.value)}
                  placeholder="例如：John Wu" disabled={addStatus === "creating"}
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, background: "#f8fafc", outline: "none" }} />
              </div>
              <div style={{ flex: "0 0 auto" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5 }}>權限</div>
                {roleSelect(newRole, setNewRole, addStatus === "creating")}
              </div>
            </div>
            {addDetail && (
              <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: addStatus === "ok" ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.07)",
                color: statusColor[addStatus as UserStatus], border: `1px solid ${addStatus === "ok" ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}` }}>
                {addDetail}
              </div>
            )}
            <button type="submit" disabled={addStatus === "creating" || !newEmail.trim()}
              style={{ padding: "10px 0", borderRadius: 8,
                background: addStatus === "creating" ? "#94a3b8" : "#3b82f6",
                color: "#fff", fontWeight: 900, fontSize: 13, border: "none",
                cursor: addStatus === "creating" ? "not-allowed" : "pointer" }}>
              {addStatus === "creating" ? "建立中…" : "建立帳號"}
            </button>
          </form>
        </div>

        {/* ── 現有使用者 ── */}
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 14 }}>👤 現有使用者（{existingUsers.length} 位）</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>可調整權限或刪除 Firestore 資料</div>
            </div>
            <button onClick={fetchUsers} disabled={loadingUsers}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 12, cursor: "pointer", color: "#64748b" }}>
              {loadingUsers ? "讀取中…" : "🔄 重整"}
            </button>
          </div>

          {loadingUsers ? (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>讀取中…</div>
          ) : existingUsers.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>尚無使用者</div>
          ) : (
            existingUsers.map((u) => (
              <div key={u.uid} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "11px 16px", borderBottom: "1px solid #f8fafc",
                opacity: u.deleting ? 0.4 : 1
              }}>
                {/* Avatar — 固定寬度 */}
                <div style={{
                  width: 34, height: 34, borderRadius: "50%",
                  flexShrink: 0, flexGrow: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 13, color: "#fff",
                  background: u.role === "admin"
                    ? "linear-gradient(135deg,#ef4444,#f97316)"
                    : "linear-gradient(135deg,#3b82f6,#10b981)"
                }}>
                  {(u.displayName || u.email)[0].toUpperCase()}
                </div>

                {/* Info — 佔剩餘空間，設 minWidth:0 讓 ellipsis 生效 */}
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <div style={{
                    fontWeight: 700, fontSize: 13,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    {u.displayName || u.email.split("@")[0]}
                    {u.uid === currentUser?.uid && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: "#f1f5f9", color: "#64748b", padding: "1px 6px", borderRadius: 99 }}>你</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, color: "#94a3b8",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    {u.email}
                  </div>
                  {u.mustChangePassword && (
                    <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 2, whiteSpace: "nowrap" }}>⚠️ 尚未修改初始密碼</div>
                  )}
                </div>

                {/* 右側操作區 — 固定不縮小 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {roleSelect(
                    u.role,
                    (r) => handleRoleChange(u.uid, r),
                    u.updatingRole || u.uid === currentUser?.uid
                  )}
                  {u.updatingRole && (
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>更新中…</span>
                  )}
                  {u.uid !== currentUser?.uid && (
                    <button
                      onClick={() => handleDelete(u.uid, u.email)}
                      disabled={u.deleting}
                      style={{
                        padding: "4px 10px", borderRadius: 6,
                        border: "1px solid rgba(239,68,68,0.3)",
                        background: "rgba(239,68,68,0.06)",
                        color: "#ef4444", fontSize: 12, fontWeight: 700,
                        cursor: "pointer", whiteSpace: "nowrap"
                      }}
                    >
                      {u.deleting ? "…" : "刪除"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── 批次建立內建使用者 ── */}
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>👥 批次建立內建使用者</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>可為每位成員設定權限後一次建立</div>
          </div>

          {users.map((u) => (
            <div key={u.email} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #f8fafc",
              background: u.status === "creating" ? "rgba(245,158,11,0.04)" : "#fff" }}>
              <span style={{ fontSize: 17, width: 24, textAlign: "center", flexShrink: 0 }}>{statusIcon[u.status]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{u.displayName}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{u.email}</div>
              </div>
              {roleSelect(u.role, (r) => setUsers((prev) => prev.map((x) => x.email === u.email ? { ...x, role: r } : x)), running)}
              {u.detail && <div style={{ fontSize: 11, color: statusColor[u.status], fontWeight: 600, maxWidth: 140, textAlign: "right" }}>{u.detail}</div>}
            </div>
          ))}

          <div style={{ padding: "14px 20px", borderTop: "1px solid #f1f5f9" }}>
            {done && (
              <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, color: "#065f46", fontSize: 13, fontWeight: 700 }}>
                ✅ 批次建立完成！初始密碼 <strong>123456</strong>，首次登入須修改。
              </div>
            )}
            <button onClick={createAllUsers} disabled={running}
              style={{ width: "100%", padding: "12px 0", borderRadius: 10,
                background: running ? "#94a3b8" : "linear-gradient(135deg, #3b82f6, #10b981)",
                color: "#fff", fontWeight: 900, fontSize: 14, border: "none",
                cursor: running ? "not-allowed" : "pointer" }}>
              {running ? "建立中，請稍候…" : done ? "重新執行" : "▶ 批次建立所有內建使用者"}
            </button>
          </div>
        </div>

        {/* 說明 */}
        <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "12px 16px", fontSize: 12, color: "#92400e" }}>
          <strong>⚠️ 注意：</strong>點「刪除」只會移除 Firestore 資料（使用者資訊/權限），Firebase Auth 帳號需另至 Firebase Console → Authentication → Users 手動刪除，才能完全封鎖登入。
        </div>

      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
