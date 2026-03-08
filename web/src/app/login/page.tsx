"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/AuthProvider";

const REMEMBER_KEY = "premtek_remembered_email";

export default function LoginPage() {
  const { user, signInWithEmail, loading, appVersion } = useAuth();
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [err,      setErr]      = useState("");
  const [working,  setWorking]  = useState(false);

  // 載入記憶的帳號
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) { setEmail(saved); setRemember(true); }
    } catch (_) {}
  }, []);

  // 已登入時直接跳轉（例如重整頁面時）
  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setWorking(true);
    try {
      // 記憶帳號
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email.trim());
        else          localStorage.removeItem(REMEMBER_KEY);
      } catch (_) {}

      await signInWithEmail(email, password);
      // 登入成功後立即跳轉，不等待 useEffect
      router.replace("/dashboard");
      return;
    } catch (e: any) {
      const code = String(e?.code || "");
      setErr(
        code === "auth/invalid-credential" || code === "auth/wrong-password"
          ? "Email 或密碼錯誤"
          : code === "auth/user-not-found"
          ? "找不到此帳號"
          : code === "auth/invalid-email"
          ? "Email 格式不正確"
          : code === "auth/too-many-requests"
          ? "嘗試次數過多，請稍後再試"
          : (e?.message || "登入失敗")
      );
    } finally {
      setWorking(false);
    }
  };

  const busy = loading || working;

  return (
    <main style={{
      minHeight: "100svh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #f0f4f8 0%, #e8f0fe 100%)",
      padding: 16
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, margin: "0 auto 12px",
            background: "linear-gradient(135deg, #38bdf8, #10b981)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, fontSize: 22, color: "#fff",
            boxShadow: "0 8px 24px rgba(56,189,248,0.35)"
          }}>P</div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "#0f172a" }}>裝機狀態 Dashboard</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>PREMTEK 內部系統 · v{appVersion}</div>
        </div>

        {/* Card */}
        <div style={{
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
          padding: "28px 28px 24px"
        }}>
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Email */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@premtek.com.tw"
                required
                autoComplete="email"
                disabled={busy}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "11px 14px", borderRadius: 10,
                  border: "1.5px solid #e2e8f0", fontSize: 14,
                  background: "#f8fafc", color: "#0f172a", outline: "none",
                  transition: "border-color 0.2s"
                }}
                onFocus={(e) => e.target.style.borderColor = "#38bdf8"}
                onBlur={(e)  => e.target.style.borderColor = "#e2e8f0"}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>
                密碼
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                required
                autoComplete="current-password"
                disabled={busy}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "11px 14px", borderRadius: 10,
                  border: "1.5px solid #e2e8f0", fontSize: 14,
                  background: "#f8fafc", color: "#0f172a", outline: "none",
                  transition: "border-color 0.2s"
                }}
                onFocus={(e) => e.target.style.borderColor = "#38bdf8"}
                onBlur={(e)  => e.target.style.borderColor = "#e2e8f0"}
              />
            </div>

            {/* Remember me */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={busy}
                style={{ width: 15, height: 15, accentColor: "#38bdf8", cursor: "pointer" }}
              />
              <span style={{ fontSize: 13, color: "#64748b" }}>記住帳號</span>
            </label>

            {/* Error */}
            {err && (
              <div style={{
                background: "rgba(239,68,68,0.07)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 8, padding: "9px 12px",
                color: "#dc2626", fontSize: 13, fontWeight: 600
              }}>
                {err}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: "12px 0", borderRadius: 10, marginTop: 2,
                background: busy ? "#94a3b8" : "linear-gradient(135deg, #38bdf8, #10b981)",
                color: "#fff", fontWeight: 900, fontSize: 15,
                border: "none", cursor: busy ? "not-allowed" : "pointer",
                boxShadow: busy ? "none" : "0 4px 14px rgba(56,189,248,0.4)",
                transition: "opacity 0.2s"
              }}
            >
              {busy ? "登入中…" : "登入"}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#cbd5e1" }}>
          僅限 @premtek.com.tw 帳號
        </div>
      </div>
    </main>
  );
}
