"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { INSTALLATIONS_COL } from "@/domain/constants";
import type { Installation } from "@/domain/types";
import { getInstallationSerial } from "@/domain/installationDisplay";
import { normalizeCompactKey, normalizeDateYmd, normalizeString } from "@/lib/utils";

const COL = INSTALLATIONS_COL;

function normalizeInstallationSerial(value: unknown): string {
  return normalizeCompactKey(value);
}

function normalizeInstallationText(value: unknown): string {
  return normalizeCompactKey(value);
}

export type InstallationImportIdentityInput = Pick<
  Installation,
  "name" | "customer" | "modelCode" | "engineer" | "estArrival" | "estComplete" | "actArrival" | "actComplete" | "importKey"
>;

export function buildInstallationImportKey(input: InstallationImportIdentityInput): string {
  const explicitImportKey = normalizeString(input.importKey);
  if (explicitImportKey) return explicitImportKey;

  const serialKey = normalizeInstallationSerial(input.name);
  if (serialKey) return `serial:${serialKey}`;

  const parts = [
    normalizeInstallationText(input.customer),
    normalizeInstallationText(input.modelCode),
    normalizeDateYmd(input.estArrival),
    normalizeDateYmd(input.estComplete),
    normalizeDateYmd(input.actArrival),
    normalizeDateYmd(input.actComplete),
    normalizeInstallationText(input.engineer),
  ];

  return `row:${parts.join("|")}`;
}

export async function listExistingInstallationDocIdsByImportKey(importKeys: string[]): Promise<Map<string, string[]>> {
  const normalized = Array.from(new Set(importKeys.map((value) => normalizeString(value)).filter(Boolean)));
  const found = new Map<string, string[]>();
  if (normalized.length === 0) return found;

  for (let i = 0; i < normalized.length; i += 10) {
    const chunk = normalized.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, COL), where("importKey", "in", chunk)));
    for (const d of snap.docs) {
      const importKey = normalizeString(d.data()?.importKey);
      if (!importKey) continue;
      const current = found.get(importKey) ?? [];
      current.push(d.id);
      found.set(importKey, current);
    }
  }

  return found;
}

export async function listExistingInstallationDocIdsBySerialName(serialNos: string[]): Promise<Map<string, string[]>> {
  const normalized = Array.from(new Set(serialNos.map((value) => normalizeInstallationSerial(value)).filter(Boolean)));
  const found = new Map<string, string[]>();
  if (normalized.length === 0) return found;

  for (let i = 0; i < normalized.length; i += 10) {
    const chunk = normalized.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, COL), where("name", "in", chunk)));
    for (const d of snap.docs) {
      const serial = normalizeInstallationSerial(d.data()?.name);
      if (!serial) continue;
      const current = found.get(serial) ?? [];
      current.push(d.id);
      found.set(serial, current);
    }
  }

  return found;
}

export function listenInstallations(onData: (rows: Installation[]) => void, onError?: (e: unknown) => void) {
  const q = query(collection(db, COL), orderBy("updatedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const rows: Installation[] = snap.docs.map((d) => {
        const row = { id: d.id, ...(d.data() as Omit<Installation, "id">) };
        return { ...row, name: getInstallationSerial(row) };
      });
      onData(rows);
    },
    (e) => onError?.(e),
  );
}

export async function createInstallation(data: Omit<Installation, "id">) {
  const progress = typeof data.progress === "number" ? Math.max(0, Math.min(100, data.progress)) : 0;
  const ref = await addDoc(collection(db, COL), {
    ...data,
    progress,
    importKey: data.importKey ?? buildInstallationImportKey(data),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  });
  return ref.id;
}

export async function updateInstallation(id: string, patch: Partial<Omit<Installation, "id">>) {
  const out: Partial<Omit<Installation, "id">> & { updatedAt?: number; updatedAtServer?: unknown } = { ...patch };
  if (typeof out.progress === "number") out.progress = Math.max(0, Math.min(100, out.progress));
  out.updatedAt = Date.now();
  out.updatedAtServer = serverTimestamp();
  await updateDoc(doc(db, COL, id), out);
}

export async function removeInstallation(id: string) {
  await deleteDoc(doc(db, COL, id));
}
