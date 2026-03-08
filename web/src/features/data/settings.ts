"use client";

import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { AppVariablesDoc, MachineModelsDoc } from "@/domain/types";

export async function getMachineModelsOnce(): Promise<MachineModelsDoc | null> {
  const snap = await getDoc(doc(db, "settings", "machineModels"));
  return snap.exists() ? (snap.data() as MachineModelsDoc) : null;
}

export function listenMachineModels(onData: (doc: MachineModelsDoc | null) => void, onError?: (e: unknown) => void) {
  return onSnapshot(doc(db, "settings", "machineModels"), (snap) => {
    onData(snap.exists() ? (snap.data() as MachineModelsDoc) : null);
  }, (e) => onError?.(e));
}

export async function saveMachineModels(docData: MachineModelsDoc) {
  await setDoc(doc(db, "settings", "machineModels"), {
    ...docData,
    updatedAtServer: serverTimestamp()
  }, { merge: true });
}

export async function getAppVariablesOnce(): Promise<AppVariablesDoc | null> {
  const snap = await getDoc(doc(db, "settings", "appVariables"));
  return snap.exists() ? (snap.data() as AppVariablesDoc) : null;
}

export function listenAppVariables(onData: (doc: AppVariablesDoc | null) => void, onError?: (e: unknown) => void) {
  return onSnapshot(doc(db, "settings", "appVariables"), (snap) => {
    onData(snap.exists() ? (snap.data() as AppVariablesDoc) : null);
  }, (e) => onError?.(e));
}

export async function saveAppVariables(docData: AppVariablesDoc) {
  await setDoc(doc(db, "settings", "appVariables"), {
    ...docData,
    updatedAtServer: serverTimestamp()
  }, { merge: true });
}
