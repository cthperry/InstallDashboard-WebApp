"use client";

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { AUDIT_LOGS_COL, EVENTS_COL } from "@/domain/constants";

export type AuditLogRow = {
  id: string;
  action: string;
  target: string;
  detail: string;
  actorEmail: string;
  createdAt?: Timestamp;
};

export type EventRow = {
  id: string;
  eventName: string;
  payload?: Record<string, unknown>;
  createdAt?: Timestamp;
};

export function listenAuditLogs(onData: (rows: AuditLogRow[]) => void, onError?: (e: unknown) => void, max: number = 80) {
  const q = query(collection(db, AUDIT_LOGS_COL), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    const rows: AuditLogRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogRow, "id">) }));
    onData(rows);
  }, (e) => onError?.(e));
}

export function listenEventsLastDays(days: number, onData: (rows: EventRow[]) => void, onError?: (e: unknown) => void, max: number = 200) {
  const since = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const q = query(
    collection(db, EVENTS_COL),
    where("createdAt", ">=", since),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  return onSnapshot(q, (snap) => {
    const rows: EventRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventRow, "id">) }));
    onData(rows);
  }, (e) => onError?.(e));
}

async function deleteByQuery(collectionName: typeof AUDIT_LOGS_COL | typeof EVENTS_COL, q: Query<DocumentData>, maxDeletes: number = 800): Promise<number> {
  const snap = await getDocs(q);
  const rows = snap.docs.slice(0, maxDeletes);
  let deleted = 0;

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const batch = writeBatch(db);
    for (const row of chunk) {
      batch.delete(doc(db, collectionName, row.id));
      deleted += 1;
    }
    await batch.commit();
  }

  return deleted;
}

export async function purgeAuditLogsOlderThan(cutoff: Date, maxDeletes: number = 800): Promise<number> {
  const ts = Timestamp.fromDate(cutoff);
  const q = query(
    collection(db, AUDIT_LOGS_COL),
    where("createdAt", "<", ts),
    orderBy("createdAt", "asc"),
    limit(maxDeletes)
  );
  return deleteByQuery(AUDIT_LOGS_COL, q, maxDeletes);
}

export async function purgeEventsOlderThan(cutoff: Date, maxDeletes: number = 800): Promise<number> {
  const ts = Timestamp.fromDate(cutoff);
  const q = query(
    collection(db, EVENTS_COL),
    where("createdAt", "<", ts),
    orderBy("createdAt", "asc"),
    limit(maxDeletes)
  );
  return deleteByQuery(EVENTS_COL, q, maxDeletes);
}

export async function clearAllAuditLogs(maxDeletes: number = 800): Promise<number> {
  const q = query(collection(db, AUDIT_LOGS_COL), orderBy("createdAt", "asc"), limit(maxDeletes));
  return deleteByQuery(AUDIT_LOGS_COL, q, maxDeletes);
}

export async function clearAllEvents(maxDeletes: number = 800): Promise<number> {
  const q = query(collection(db, EVENTS_COL), orderBy("createdAt", "asc"), limit(maxDeletes));
  return deleteByQuery(EVENTS_COL, q, maxDeletes);
}
