"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { AUDIT_LOGS_COL } from "@/domain/constants";

export async function writeAuditLog(action: string, target: string, detail: string, actorEmail: string) {
  try {
    await addDoc(collection(db, AUDIT_LOGS_COL), {
      action,
      target,
      detail,
      actorEmail,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("[audit] writeAuditLog 失敗", error);
    // 不阻斷主流程
  }
}
