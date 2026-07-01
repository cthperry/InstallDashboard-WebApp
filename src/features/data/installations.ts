"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { INSTALLATIONS_COL } from "@/domain/constants";
import type { Installation } from "@/domain/types";
import { getInstallationSerial, getInstallationSerialKey, normalizeInstallationSerialCandidate } from "@/domain/installationDisplay";
import { resolveRealtimeListenLimit, type RealtimeListenOptions } from "@/features/data/listenOptions";
import { normalizeCompactKey, normalizeDateYmd, normalizeString } from "@/lib/utils";

const COL = INSTALLATIONS_COL;

export type InstallationListenOptions = RealtimeListenOptions;

function normalizeInstallationSerial(value: unknown): string {
  return normalizeCompactKey(value);
}

function buildInstallationSerial(row: Pick<Installation, "name" | "modelCode">): string {
  return normalizeInstallationSerialCandidate(row.name, row.modelCode);
}

function buildInstallationSerialKey(row: Pick<Installation, "name" | "modelCode">): string {
  return normalizeCompactKey(buildInstallationSerial(row));
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

  const serialKey = buildInstallationSerialKey(input);
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
  const rawCandidates = Array.from(new Set(serialNos.map((value) => normalizeString(value)).filter(Boolean)));
  const found = new Map<string, string[]>();
  if (normalized.length === 0) return found;

  for (let i = 0; i < normalized.length; i += 10) {
    const chunk = normalized.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, COL), where("serialKey", "in", chunk)));
    for (const d of snap.docs) {
      const data = d.data();
      const serial = normalizeInstallationSerial(data?.serialKey || buildInstallationSerial(data as Pick<Installation, "name" | "modelCode">));
      if (!serial) continue;
      const current = found.get(serial) ?? [];
      current.push(d.id);
      found.set(serial, current);
    }
  }

  const exactCandidates = Array.from(new Set([...rawCandidates, ...normalized]));
  for (let i = 0; i < exactCandidates.length; i += 10) {
    const chunk = exactCandidates.slice(i, i + 10);
    const snap = await getDocs(query(collection(db, COL), where("name", "in", chunk)));
    for (const d of snap.docs) {
      const data = d.data();
      const serial = normalizeInstallationSerial(data?.serialKey || buildInstallationSerial(data as Pick<Installation, "name" | "modelCode">));
      if (!serial) continue;
      const current = found.get(serial) ?? [];
      if (!current.includes(d.id)) current.push(d.id);
      found.set(serial, current);
    }
  }

  return found;
}

export function listenInstallations(
  onData: (rows: Installation[]) => void,
  onError?: (e: unknown) => void,
  options: InstallationListenOptions = {},
) {
  const constraints: QueryConstraint[] = [orderBy("updatedAt", "desc")];
  const maxRows = resolveRealtimeListenLimit(options);
  if (maxRows !== null) constraints.push(limit(maxRows));
  const q = query(collection(db, COL), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const rows: Installation[] = snap.docs.map((d) => {
        const row = { id: d.id, ...(d.data() as Omit<Installation, "id">) };
        return { ...row, name: getInstallationSerial(row), serialKey: getInstallationSerialKey(row) };
      });
      onData(rows);
    },
    (e) => onError?.(e),
  );
}

export async function createInstallation(data: Omit<Installation, "id">) {
  const progress = typeof data.progress === "number" ? Math.max(0, Math.min(100, data.progress)) : 0;
  const serialNo = buildInstallationSerial(data);
  const serialKey = buildInstallationSerialKey(data);
  const payload = {
    ...data,
    name: serialNo,
    serialKey,
    progress,
    importKey: data.importKey ?? buildInstallationImportKey({ ...data, name: serialNo }),
  };
  const ref = await addDoc(collection(db, COL), {
    ...payload,
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
  if (out.name !== undefined) {
    const serialNo = normalizeInstallationSerialCandidate(out.name, out.modelCode);
    out.name = serialNo;
    out.serialKey = normalizeCompactKey(serialNo);
  }
  out.updatedAt = Date.now();
  out.updatedAtServer = serverTimestamp();
  await updateDoc(doc(db, COL, id), out);
}

export async function updateInstallationsBulk(
  ids: string[],
  patch: Partial<Pick<Installation, "engineer" | "estComplete" | "nextAction" | "nextOwner" | "nextDueDate" | "overdueReason">>,
) {
  const uniqueIds = Array.from(new Set(ids.map((id) => normalizeString(id)).filter(Boolean)));
  if (uniqueIds.length === 0) return 0;
  if (uniqueIds.length > 450) {
    throw new Error("批次更新最多支援 450 筆，請縮小篩選範圍後再執行");
  }

  const batch = writeBatch(db);
  const updatedAt = Date.now();
  const normalizedPatch: Partial<Omit<Installation, "id">> & { updatedAt: number; updatedAtServer: unknown } = {
    ...patch,
    ...(patch.engineer !== undefined ? { engineer: normalizeString(patch.engineer) } : {}),
    ...(patch.nextOwner !== undefined ? { nextOwner: normalizeString(patch.nextOwner) } : {}),
    ...(patch.nextAction !== undefined ? { nextAction: normalizeString(patch.nextAction) } : {}),
    ...(patch.estComplete !== undefined ? { estComplete: normalizeDateYmd(patch.estComplete) } : {}),
    ...(patch.nextDueDate !== undefined ? { nextDueDate: normalizeDateYmd(patch.nextDueDate) } : {}),
    ...(patch.overdueReason !== undefined ? { overdueReason: normalizeString(patch.overdueReason) } : {}),
    updatedAt,
    updatedAtServer: serverTimestamp(),
  };

  for (const id of uniqueIds) {
    batch.update(doc(db, COL, id), normalizedPatch);
  }
  await batch.commit();
  return uniqueIds.length;
}

export async function removeInstallation(id: string) {
  await deleteDoc(doc(db, COL, id));
}
