"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { useAuth } from "@/features/auth/AuthProvider";

export default function ChangePasswordPage() {
  const { user, signOutNow, refreshProfile, appVersion } = useAuth();
  const router = useRouter();

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [err, setErr]               = useState("");
  const [working, setWorking]       = useState(false);
  const [done, setDone]             = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");

    if (newPwd.length < 6) { setErr("新密碼至少 6 個字元"); return; }
    if (newPwd === "123456") { setErr("請勿使用預設密碼，請設定您專屬的新密碼"); return; }
    if (newPwd !== confirmPwd) { setErr("兩次輸入的密碼不一致"); return; }

    if (!user) { setErr("尚未登入"); return; }

    setWorking(true);
    try {
      // Re-authenticate first (required for sensitive operations)
      const credential = EmailAuthProvider.credential(user.email!, currentPwd);
      await reauthenticateWithCredential(user, credential);

      // Update password in Firebase Auth
      await updatePassword(user, newPwd);

      // Clear mustChangePassword flag in Firestore
      await updateDoc(doc(db, "users", user.uid), {
        mustChangePassword: false,
        updatedAt: Date.now()
      });

      // 重新讀取 profile，讓 context 的 mustChangePassword 變成 false
      // 否則跳到 /dashboard 時 RequireAuth 會看到舊的 true 又踢回來
      await refreshProfile();

      setDone(true);
      setTimeout(() => router.replace("/dashboard"), 1800);
    } catch (e: any) {
      const code = String(e?.code || "");
      setErr(
        code === "auth/wrong-password" || code === "auth/invalid-credential"
          ? "目前密碼錯誤，請重新輸入"
          : code === "auth/too-many-requests"
          ? "嘗試次數過多，請稍後再試"
          : code === "auth/requires-recent-login"
          ? "登入時間過久，請重新登入"
          : (e?.message || "修改密碼失敗")
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <main style={{
      minHeight: "100svh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f0f4f8",
      padding: 16
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
        padding: 32
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(135deg, #38bdf8, #10b981)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 18, color: "#fff"
          }}>P</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>首次登入 — 請修改密碼</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>PREMTEK 裝機進度 · v{appVersion}</div>
          </div>
        </div>

        {done ? (
          <div style={{
            textAlign: "center", padding: "24px 0",
            color: "#10b981", fontWeight: 900, fontSize: 15
          }}>
            ✅ 密碼已成功更新，即將跳轉…
          </div>
        ) : (
          <>
            <div style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: 10, padding: "10px 14px",
              fontSize: 13, color: "#92400e", marginBottom: 20
            }}>
              ⚠️ 您的帳號使用預設密碼，為保護帳號安全，請立即設定專屬密碼。
            </div>

            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>目前密碼（初始：123456）</div>
                <input
                  type="password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  placeholder="請輸入目前使用的密碼"
                  required
                  disabled={working}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "10px 12px", borderRadius: 8,
                    border: "1px solid #e2e8f0", fontSize: 14,
                    background: "#f8fafc", outline: "none"
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>新密碼（至少 6 碼，不可為 123456）</div>
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="請輸入新密碼"
                  required
                  disabled={working}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "10px 12px", borderRadius: 8,
                    border: "1px solid #e2e8f0", fontSize: 14,
                    background: "#f8fafc", outline: "none"
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>確認新密碼</div>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="再次輸入新密碼"
                  required
                  disabled={working}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "10px 12px", borderRadius: 8,
                    border: "1px solid #e2e8f0", fontSize: 14,
                    background: "#f8fafc", outline: "none"
                  }}
                />
              </div>

              {err && (
                <div style={{
                  background: "rgba(239,68,68,0.07)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 8, padding: "9px 12px",
                  color: "#dc2626", fontSize: 13
                }}>
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={working || !currentPwd || !newPwd || !confirmPwd}
                style={{
                  padding: "11px 0", borderRadius: 8,
                  background: working ? "#94a3b8" : "linear-gradient(135deg, #38bdf8, #10b981)",
                  color: "#fff", fontWeight: 900, fontSize: 14,
                  border: "none", cursor: working ? "not-allowed" : "pointer",
                  transition: "opacity 0.2s"
                }}
              >
                {working ? "更新中…" : "確認修改密碼"}
              </button>
            </form>

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button
                onClick={signOutNow}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}
              >
                登出
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
