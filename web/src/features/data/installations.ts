"use client";

import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Installation } from "@/domain/types";

const COL = "installations";

export function listenInstallations(onData: (rows: Installation[]) => void, onError?: (e: unknown) => void) {
  const q = query(collection(db, COL), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => {
    const rows: Installation[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Installation, "id">) }));
    onData(rows);
  }, (e) => onError?.(e));
}

export async function createInstallation(data: Omit<Installation, "id">) {
  // Firestore rejects `undefined` field values — strip them before writing
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(data as Record<string, any>)) {
    if (v !== undefined) cleaned[k] = v;
  }
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
  // Firestore rejects `undefined` field values — strip them before writing
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch as Record<string, any>)) {
    if (v !== undefined) out[k] = v;
  }
  if (typeof out.progress === "number") out.progress = Math.max(0, Math.min(100, out.progress));
  await updateDoc(doc(db, COL, id), {
    ...out,
    updatedAt: Date.now(),
    updatedAtServer: serverTimestamp()
  });
}

export async function removeInstallation(id: string) {
  await deleteDoc(doc(db, COL, id));
}
