"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export async function writeAuditLog(action: string, target: string, detail: string, actorEmail: string) {
  try {
    await addDoc(collection(db, "auditLogs"), {
      action,
      target,
      detail,
      actorEmail,
      timestamp: Date.now(),          // client ms — WarroomPanel / LogsPanel 用此欄位顯示
      createdAt: serverTimestamp(),   // server timestamp — listenAuditLogs orderBy 用此欄位
    });
  } catch {
    // 不阻斷主流程
  }
}
