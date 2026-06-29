"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { EVENTS_COL } from "@/domain/constants";

type Payload = Record<string, unknown>;
type GtagFunction = (command: "event", eventName: string, payload: Payload) => void;

declare global {
  interface Window {
    gtag?: GtagFunction;
  }
}

function gaEnabled(): boolean {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  return !!id;
}

function sendGA(eventName: string, payload: Payload) {
  if (!gaEnabled()) return;
  if (!window.gtag) return;
  window.gtag("event", eventName, payload);
}

export async function trackEvent(eventName: string, payload: Payload = {}) {
  try {
    await addDoc(collection(db, EVENTS_COL), {
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
