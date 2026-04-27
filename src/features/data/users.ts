import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase/client";
import { USERS_COL } from "@/domain/constants";
import type { UserProfile } from "@/domain/types";

export type ManagedUser = UserProfile & {
  id: string;
  updatedBy?: string;
};

type UserDocLike = Partial<UserProfile> & {
  updatedBy?: unknown;
};

function readUserDoc(data: unknown): UserDocLike {
  if (!data || typeof data !== "object") return {};
  return data as UserDocLike;
}

function mapRow(d: QueryDocumentSnapshot): ManagedUser {
  const data = readUserDoc(d.data());
  return {
    id: d.id,
    email: String(data.email ?? ""),
    role: data.role === "admin" ? "admin" : "engineer",
    updatedAt: Number(data.updatedAt ?? 0),
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
  };
}

export function listenUsers(
  onData: (rows: ManagedUser[]) => void,
  onError?: (e: unknown) => void,
  max: number = 200,
) {
  const q = query(collection(db, USERS_COL), orderBy("updatedAt", "desc"), limit(max));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map(mapRow));
    },
    (e) => onError?.(e),
  );
}

export async function upsertUserRoleByUid(params: {
  uid: string;
  email: string;
  role: "admin" | "engineer";
  updatedBy: string;
}) {
  const uid = params.uid.trim();
  if (!uid) throw new Error("UID 不可空白");

  await setDoc(
    doc(db, USERS_COL, uid),
    {
      email: params.email.trim(),
      role: params.role,
      updatedAt: Date.now(),
      updatedBy: params.updatedBy,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteUserByUid(uid: string) {
  const cleaned = uid.trim();
  if (!cleaned) throw new Error("UID 不可空白");
  await deleteDoc(doc(db, USERS_COL, cleaned));
}
