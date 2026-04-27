"use client";

import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { SETTINGS_COL } from "@/domain/constants";
import type { AppVariablesDoc, MachineModelsDoc, RetentionSettingsDoc } from "@/domain/types";

export async function getMachineModelsOnce(): Promise<MachineModelsDoc | null> {
  const snap = await getDoc(doc(db, SETTINGS_COL, "machineModels"));
  return snap.exists() ? (snap.data() as MachineModelsDoc) : null;
}

export function listenMachineModels(onData: (doc: MachineModelsDoc | null) => void, onError?: (e: unknown) => void) {
  return onSnapshot(doc(db, SETTINGS_COL, "machineModels"), (snap) => {
    onData(snap.exists() ? (snap.data() as MachineModelsDoc) : null);
  }, (e) => onError?.(e));
}

export async function saveMachineModels(docData: MachineModelsDoc) {
  await setDoc(doc(db, SETTINGS_COL, "machineModels"), {
    ...docData,
    updatedAtServer: serverTimestamp()
  }, { merge: true });
}

export async function getAppVariablesOnce(): Promise<AppVariablesDoc | null> {
  const snap = await getDoc(doc(db, SETTINGS_COL, "appVariables"));
  return snap.exists() ? (snap.data() as AppVariablesDoc) : null;
}

export function listenAppVariables(onData: (doc: AppVariablesDoc | null) => void, onError?: (e: unknown) => void) {
  return onSnapshot(doc(db, SETTINGS_COL, "appVariables"), (snap) => {
    onData(snap.exists() ? (snap.data() as AppVariablesDoc) : null);
  }, (e) => onError?.(e));
}

export async function saveAppVariables(docData: AppVariablesDoc) {
  await setDoc(doc(db, SETTINGS_COL, "appVariables"), {
    ...docData,
    updatedAtServer: serverTimestamp()
  }, { merge: true });
}

export async function getRetentionSettingsOnce(): Promise<RetentionSettingsDoc | null> {
  const snap = await getDoc(doc(db, SETTINGS_COL, "retention"));
  return snap.exists() ? (snap.data() as RetentionSettingsDoc) : null;
}

export function listenRetentionSettings(onData: (doc: RetentionSettingsDoc | null) => void, onError?: (e: unknown) => void) {
  return onSnapshot(doc(db, SETTINGS_COL, "retention"), (snap) => {
    onData(snap.exists() ? (snap.data() as RetentionSettingsDoc) : null);
  }, (e) => onError?.(e));
}

export async function saveRetentionSettings(docData: RetentionSettingsDoc) {
  await setDoc(doc(db, SETTINGS_COL, "retention"), {
    ...docData,
    updatedAtServer: serverTimestamp()
  }, { merge: true });
}
