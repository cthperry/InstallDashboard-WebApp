"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/AuthProvider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  if (loading) {
    return (
      <main className="container">
        <div className="card" style={{ padding: 18 }}>
          <div style={{ color: "var(--muted-foreground)" }}>載入中…</div>
        </div>
      </main>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}
