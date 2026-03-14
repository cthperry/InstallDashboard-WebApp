"use client";

import { collection, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type AuditLogRow = {
  id: string;
  action: string;
  target: string;
  detail: string;
  actorEmail: string;
  timestamp?: number;    // client ms（顯示用）
  createdAt?: Timestamp; // server timestamp（排序用）
};

export type EventRow = {
  id: string;
  eventName: string;
  payload?: Record<string, unknown>;
  createdAt?: Timestamp;
};

export function listenAuditLogs(onData: (rows: AuditLogRow[]) => void, onError?: (e: unknown) => void, max: number = 80) {
  const q = query(collection(db, "auditLogs"), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    const rows: AuditLogRow[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    onData(rows);
  }, (e) => onError?.(e));
}

export function listenEventsLastDays(days: number, onData: (rows: EventRow[]) => void, onError?: (e: unknown) => void, max: number = 200) {
  const since = Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const q = query(
    collection(db, "events"),
    where("createdAt", ">=", since),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  return onSnapshot(q, (snap) => {
    const rows: EventRow[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    onData(rows);
  }, (e) => onError?.(e));
}
