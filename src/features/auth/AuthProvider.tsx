"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase/client";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { USERS_COL } from "@/domain/constants";
import type { UserProfile } from "@/domain/types";
import { trackEvent } from "@/features/telemetry/track";

type AuthCtx = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOutNow: () => Promise<void>;
  appVersion: string;
  isAdmin: boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

function isPremtekEmail(email?: string | null): boolean {
  if (!email) return false;
  return /@premtek\.com\.tw$/i.test(email);
}

async function ensureUserProfile(u: User): Promise<UserProfile> {
  const ref = doc(db, USERS_COL, u.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as UserProfile;

  const p: UserProfile = {
    email: u.email ?? "",
    role: "engineer",
    updatedAt: Date.now()
  };
  await setDoc(ref, { ...p, updatedAt: Date.now(), updatedAtServer: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  return p;
}

export function AuthProvider({ children, appVersion }: { children: React.ReactNode; appVersion: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      try {
        if (!u) {
          setUser(null);
          setProfile(null);
          return;
        }
        if (!isPremtekEmail(u.email)) {
          await signOut(auth);
          setUser(null);
          setProfile(null);
          return;
        }
        setUser(u);
        const p = await ensureUserProfile(u);
        setProfile(p);
        trackEvent("auth_login", { email: u.email ?? "", role: p.role, appVersion });
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [appVersion]);

  const signInFn = useCallback(async (email: string, password: string) => {
    const e = (email ?? "").trim();
    if (!e) throw new Error("請輸入 Email");
    if (!password) throw new Error("請輸入密碼");

    const res = await signInWithEmailAndPassword(auth, e, password);
    if (!isPremtekEmail(res.user.email)) {
      await signOut(auth);
      throw new Error("僅允許 @premtek.com.tw 帳號登入");
    }
  }, []);

  const signInGoogleFn = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      const res = await signInWithPopup(auth, provider);
      if (!isPremtekEmail(res.user.email)) {
        await signOut(auth);
        throw new Error("僅允許 @premtek.com.tw 帳號登入");
      }
    } catch (e: unknown) {
      const code = typeof e === "object" && e && "code" in e ? String((e as { code?: unknown }).code ?? "") : "";

      // 行動裝置/瀏覽器常見：popup 被阻擋 → 改用 redirect
      if (
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw e;
    }
  }, []);

  const signOutFn = useCallback(async () => {
    const email = auth.currentUser?.email ?? "";
    await signOut(auth);
    trackEvent("auth_logout", { email, appVersion });
  }, [appVersion]);

  const value = useMemo<AuthCtx>(() => ({
    user,
    profile,
    loading,
    signInWithEmail: signInFn,
    signInWithGoogle: signInGoogleFn,
    signOutNow: signOutFn,
    appVersion,
    isAdmin: profile?.role === "admin"
  }), [user, profile, loading, appVersion, signInFn, signInGoogleFn, signOutFn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider 未初始化");
  return v;
}
