"use client";

import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Installation } from "@/domain/types";
import { normalizeInstallations } from "@/domain/migrations";

const COL = "installations";

export function listenInstallations(onData: (rows: Installation[]) => void, onError?: (e: unknown) => void) {
  const q = query(collection(db, COL), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => {
    const raw: Installation[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Installation, "id">) }));
    // 自動修正舊版資料（如 hookup → installing）
    onData(normalizeInstallations(raw));
  }, (e) => onError?.(e));
}

/** 深層去除所有 undefined，避免 Firestore 拒絕（含 nested objects）*/
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      result[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export async function createInstallation(data: Omit<Installation, "id">) {
  const cleaned = stripUndefined(data as unknown as Record<string, unknown>);
  const progress = typeof cleaned.progress === "number" ? Math.max(0, Math.min(100, cleaned.progress)) : 0;
  await addDoc(collection(db, COL), {
    ...cleaned,
    progress,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp()
  });
}

export async function updateInstallation(id: string, patch: Partial<Omit<Installation, "id">>) {
  const out = stripUndefined(patch as unknown as Record<string, unknown>) as Record<string, unknown>;
  if (typeof out.progress === "number") out.progress = Math.max(0, Math.min(100, out.progress as number));
  await updateDoc(doc(db, COL, id), {
    ...out,
    updatedAt: Date.now(),
    updatedAtServer: serverTimestamp()
  });
}

export async function removeInstallation(id: string) {
  await deleteDoc(doc(db, COL, id));
}
