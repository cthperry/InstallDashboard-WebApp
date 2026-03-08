"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/AuthProvider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (mustChangePassword) { router.replace("/change-password"); return; }
  }, [loading, user, mustChangePassword, router]);

  if (loading) {
    return (
      <main className="container">
        <div className="card" style={{ padding: 18 }}>
          <div style={{ color: "var(--muted-foreground)" }}>載入中…</div>
        </div>
      </main>
    );
  }

  if (!user || mustChangePassword) return null;
  return <>{children}</>;
}
