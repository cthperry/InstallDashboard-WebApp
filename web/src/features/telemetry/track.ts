"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

type Payload = Record<string, unknown>;

function gaEnabled(): boolean {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  return !!id;
}

function sendGA(eventName: string, payload: Payload) {
  if (!gaEnabled()) return;
  const w = window as unknown as { gtag?: (...args: any[]) => void };
  if (!w.gtag) return;
  w.gtag("event", eventName, payload);
}

export async function trackEvent(eventName: string, payload: Payload = {}) {
  try {
    await addDoc(collection(db, "events"), {
      eventName,
      payload,
      createdAt: serverTimestamp()
    });
  } catch {
    // telemetry 不阻斷主流程
  }

  try {
    sendGA(eventName, payload);
  } catch {
    // ignore
  }
}
