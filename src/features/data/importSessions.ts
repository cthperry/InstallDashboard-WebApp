"use client";

import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { IMPORT_SESSIONS_COL } from "@/domain/constants";
import type { ImportSessionDoc } from "@/domain/types";
import { db } from "@/lib/firebase/client";

export type ImportSessionRow = ImportSessionDoc & {
  id: string;
};

export function listenImportSessions(onData: (rows: ImportSessionRow[]) => void, onError?: (e: unknown) => void, max = 10) {
  const q = query(collection(db, IMPORT_SESSIONS_COL), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((row) => ({ id: row.id, ...(row.data() as ImportSessionDoc) })));
    },
    (error) => onError?.(error),
  );
}

export async function createImportSession(input: Omit<ImportSessionDoc, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(collection(db, IMPORT_SESSIONS_COL), {
    ...input,
    errorSample: input.errorSample.slice(0, 20),
    createdAt: now,
    updatedAt: now,
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  });
  return ref.id;
}
