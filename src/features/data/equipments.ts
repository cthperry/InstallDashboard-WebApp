"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type FieldValue,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Equipment } from "@/domain/types";
import { EQUIPMENTS_COL } from "@/domain/constants";
import { resolveRealtimeListenLimit, type RealtimeListenOptions } from "@/features/data/listenOptions";
import { normalizeCompactKey, normalizeString } from "@/lib/utils";

const COL = EQUIPMENTS_COL;

type EquipmentDocLike = Partial<Omit<Equipment, "id">> & {
  name?: unknown;
};

export type EquipmentUpdatePatch = Partial<Omit<Equipment, "id" | "blocking">> & {
  blocking?: Equipment["blocking"] | FieldValue;
};

export type EquipmentListenOptions = RealtimeListenOptions;

function normalizeSerialKey(v: unknown): string {
  return normalizeCompactKey(v);
}

function readEquipmentDoc(data: unknown): EquipmentDocLike {
  if (!data || typeof data !== "object") return {};
  return data as EquipmentDocLike;
}

function mapEquipmentRow(id: string, data: unknown): Equipment {
  return { id, ...(readEquipmentDoc(data) as Omit<Equipment, "id">) };
}

export async function listExistingEquipmentSerialKeys(serialNos: string[]): Promise<Set<string>> {
  const normalized = Array.from(new Set(serialNos.map((v) => normalizeSerialKey(v)).filter(Boolean)));
  const found = new Set<string>();
  if (normalized.length === 0) return found;

  for (let i = 0; i < normalized.length; i += 10) {
    const chunk = normalized.slice(i, i + 10);

    const keySnap = await getDocs(query(collection(db, COL), where("serialKey", "in", chunk)));
    for (const d of keySnap.docs) {
      const data = readEquipmentDoc(d.data());
      const serialKey = normalizeSerialKey(data.serialKey || data.serialNo);
      if (serialKey) found.add(serialKey);
    }

    const serialSnap = await getDocs(query(collection(db, COL), where("serialNo", "in", chunk)));
    for (const d of serialSnap.docs) {
      const data = readEquipmentDoc(d.data());
      const serialKey = normalizeSerialKey(data.serialKey || data.serialNo);
      if (serialKey) found.add(serialKey);
    }

    const legacyNameSnap = await getDocs(query(collection(db, COL), where("name", "in", chunk)));
    for (const d of legacyNameSnap.docs) {
      const data = readEquipmentDoc(d.data());
      const serialKey = normalizeSerialKey(data.serialKey || data.name);
      if (serialKey) found.add(serialKey);
    }
  }

  return found;
}

export async function listExistingEquipmentDocIdsBySerialKey(serialNos: string[]): Promise<Map<string, string>> {
  const normalized = Array.from(new Set(serialNos.map((v) => normalizeSerialKey(v)).filter(Boolean)));
  const found = new Map<string, string>();
  if (normalized.length === 0) return found;

  for (let i = 0; i < normalized.length; i += 10) {
    const chunk = normalized.slice(i, i + 10);

    const keySnap = await getDocs(query(collection(db, COL), where("serialKey", "in", chunk)));
    for (const d of keySnap.docs) {
      const data = readEquipmentDoc(d.data());
      const serialKey = normalizeSerialKey(data.serialKey || data.serialNo);
      if (serialKey && !found.has(serialKey)) found.set(serialKey, d.id);
    }

    const serialSnap = await getDocs(query(collection(db, COL), where("serialNo", "in", chunk)));
    for (const d of serialSnap.docs) {
      const data = readEquipmentDoc(d.data());
      const serialKey = normalizeSerialKey(data.serialKey || data.serialNo);
      if (serialKey && !found.has(serialKey)) found.set(serialKey, d.id);
    }

    const legacyNameSnap = await getDocs(query(collection(db, COL), where("name", "in", chunk)));
    for (const d of legacyNameSnap.docs) {
      const data = readEquipmentDoc(d.data());
      const serialKey = normalizeSerialKey(data.serialKey || data.name);
      if (serialKey && !found.has(serialKey)) found.set(serialKey, d.id);
    }
  }

  return found;
}

export async function findEquipmentBySerialKey(serialNo: string): Promise<Equipment | null> {
  const key = normalizeSerialKey(serialNo);
  if (!key) return null;

  const keySnap = await getDocs(query(collection(db, COL), where("serialKey", "==", key), limit(1)));
  if (!keySnap.empty) {
    const d = keySnap.docs[0];
    return mapEquipmentRow(d.id, d.data());
  }

  const serialSnap = await getDocs(query(collection(db, COL), where("serialNo", "==", key), limit(1)));
  if (!serialSnap.empty) {
    const d = serialSnap.docs[0];
    return mapEquipmentRow(d.id, d.data());
  }

  const equipmentIdSnap = await getDocs(query(collection(db, COL), where("equipmentId", "==", key), limit(1)));
  if (!equipmentIdSnap.empty) {
    const d = equipmentIdSnap.docs[0];
    return mapEquipmentRow(d.id, d.data());
  }

  const legacyNameSnap = await getDocs(query(collection(db, COL), where("name", "==", key), limit(1)));
  if (!legacyNameSnap.empty) {
    const d = legacyNameSnap.docs[0];
    return mapEquipmentRow(d.id, d.data());
  }

  return null;
}

export function listenEquipments(
  onData: (rows: Equipment[]) => void,
  onError?: (e: unknown) => void,
  options: EquipmentListenOptions = {},
) {
  const constraints: QueryConstraint[] = [orderBy("updatedAt", "desc")];
  const maxRows = resolveRealtimeListenLimit(options);
  if (maxRows !== null) constraints.push(limit(maxRows));
  const q = query(collection(db, COL), ...constraints);
  return onSnapshot(q, (snap) => {
    const rows: Equipment[] = snap.docs.map((d) => mapEquipmentRow(d.id, d.data()));
    onData(rows);
  }, (e) => onError?.(e));
}

export async function createEquipment(data: Omit<Equipment, "id">) {
  const serialKey = normalizeSerialKey(data.serialNo || data.equipmentId);
  await addDoc(collection(db, COL), {
    ...data,
    serialKey,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  });
}

export async function updateEquipment(id: string, patch: EquipmentUpdatePatch) {
  const serialKey = patch.serialNo !== undefined || patch.equipmentId !== undefined
    ? normalizeSerialKey(patch.serialNo || patch.equipmentId)
    : undefined;
  await updateDoc(doc(db, COL, id), {
    ...patch,
    ...(serialKey !== undefined ? { serialKey } : {}),
    updatedAt: Date.now(),
    updatedAtServer: serverTimestamp(),
  });
}

export async function removeEquipment(id: string) {
  await deleteDoc(doc(db, COL, id));
}

function mapRegionLabelToKey(label: string): Equipment["region"] {
  if (label === "北區") return "north";
  if (label === "中區") return "central";
  return "south";
}

export function getDemoEquipments(): Array<Omit<Equipment, "id">> {
  const raw: Array<{
    equipmentId: string;
    region: string;
    customer: string;
    site: string;
    model: string;
    serialNo: string;
    statusMain: Equipment["statusMain"];
    statusSub: string;
    owner: string;
    milestones: Equipment["milestones"];
    blocking?: Equipment["blocking"];
    capacity: Equipment["capacity"];
    updatedAt: string;
  }> = [
    {
      equipmentId: "EQ-N-001",
      region: "北區",
      customer: "客戶A",
      site: "竹科Fab1",
      model: "FlexTRAK-S",
      serialNo: "P160623",
      statusMain: "裝機",
      statusSub: "配管配線",
      owner: "PM-Allen",
      milestones: { installStart: "2026-02-10" },
      blocking: { reasonCode: "料件未到", detail: "真空閥件缺料，等待到貨", owner: "SCM-Judy", eta: "2026-03-01" },
      capacity: { utilization: 0, uph: 0, targetUph: 0, level: "紅", trend7d: [0, 0, 0, 0, 0, 0, 0] },
      updatedAt: "2026-02-25T02:00:00.000Z",
    },
    {
      equipmentId: "EQ-N-002",
      region: "北區",
      customer: "客戶B",
      site: "桃科Fab2",
      model: "AP-1000",
      serialNo: "AP1000-0021",
      statusMain: "試產",
      statusSub: "Recipe 調整",
      owner: "FA-Stone",
      milestones: { installDone: "2026-02-12", trialStart: "2026-02-18" },
      capacity: { utilization: 62, uph: 120, targetUph: 150, level: "黃", trend7d: [40, 55, 60, 58, 62, 64, 62] },
      updatedAt: "2026-02-25T03:00:00.000Z",
    },
    {
      equipmentId: "EQ-C-001",
      region: "中區",
      customer: "客戶C",
      site: "中科Fab3",
      model: "ExoSPHERE",
      serialNo: "EXO-033",
      statusMain: "正式生產中",
      statusSub: "達產追蹤",
      owner: "PM-Ruby",
      milestones: { prodStart: "2026-02-01", reachTargetDate: "2026-03-10" },
      capacity: { utilization: 88, uph: 210, targetUph: 220, level: "綠", trend7d: [80, 82, 84, 86, 87, 88, 88] },
      updatedAt: "2026-02-25T04:00:00.000Z",
    },
    {
      equipmentId: "EQ-S-001",
      region: "南區",
      customer: "客戶D",
      site: "南科Fab5",
      model: "FlexTRAK-S",
      serialNo: "FTS-0088",
      statusMain: "裝機",
      statusSub: "機台定位/校正",
      owner: "FA-Marco",
      milestones: { installStart: "2026-02-20", reachTargetDate: "2026-03-15" },
      capacity: { utilization: 10, uph: 10, targetUph: 150, level: "紅", trend7d: [0, 0, 5, 8, 10, 10, 10] },
      updatedAt: "2026-02-25T05:00:00.000Z",
    },
  ];

  return raw.map((r) => ({
    equipmentId: r.equipmentId,
    region: mapRegionLabelToKey(r.region),
    customer: r.customer,
    site: r.site,
    modelCode: r.model,
    serialNo: r.serialNo,
    statusMain: r.statusMain,
    statusSub: r.statusSub ?? "",
    owner: r.owner,
    milestones: r.milestones ?? {},
    blocking: r.blocking,
    capacity: {
      utilization: r.capacity.utilization,
      uph: r.capacity.uph,
      targetUph: r.capacity.targetUph,
      level: r.capacity.level,
      trend7d: [...r.capacity.trend7d],
    },
    createdAt: Date.now(),
    updatedAt: new Date(r.updatedAt).getTime(),
  }));
}

export async function seedDemoEquipments() {
  const q = query(collection(db, COL), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) return { seeded: false, reason: "已有資料" as const };

  const batch = writeBatch(db);
  const rows = getDemoEquipments();
  for (const row of rows) {
    const ref = doc(collection(db, COL));
    batch.set(ref, {
      ...row,
      createdAtServer: serverTimestamp(),
      updatedAtServer: serverTimestamp(),
    });
  }
  await batch.commit();
  return { seeded: true, count: rows.length };
}

export type EquipmentNameToSerialPreviewRow = {
  id: string;
  equipmentId?: string;
  customer?: string;
  site?: string;
  name?: string;
  serialNo?: string;
};

export type EquipmentNameToSerialPreview = {
  scanned: number;
  candidates: number;
  alreadyOk: number;
  missingBoth: number;
  sample: EquipmentNameToSerialPreviewRow[];
};

export async function previewMigrateEquipmentNameToSerialNo(maxScan = 200): Promise<EquipmentNameToSerialPreview> {
  const scanLimit = Math.max(1, Math.min(400, maxScan));
  const q = query(collection(db, COL), limit(scanLimit));
  const snap = await getDocs(q);

  let candidates = 0;
  let alreadyOk = 0;
  let missingBoth = 0;
  const sample: EquipmentNameToSerialPreviewRow[] = [];

  for (const d of snap.docs) {
    const data = readEquipmentDoc(d.data());
    const serialNo = normalizeString(data.serialNo);
    const name = normalizeString(data.name);

    if (serialNo) {
      alreadyOk++;
      continue;
    }

    if (name) {
      candidates++;
      if (sample.length < 12) {
        sample.push({
          id: d.id,
          equipmentId: normalizeString(data.equipmentId) || undefined,
          customer: normalizeString(data.customer) || undefined,
          site: normalizeString(data.site) || undefined,
          name,
          serialNo: "",
        });
      }
      continue;
    }

    missingBoth++;
    if (sample.length < 12) {
      sample.push({
        id: d.id,
        equipmentId: normalizeString(data.equipmentId) || undefined,
        customer: normalizeString(data.customer) || undefined,
        site: normalizeString(data.site) || undefined,
        name: name || undefined,
        serialNo: serialNo || undefined,
      });
    }
  }

  return {
    scanned: snap.size,
    candidates,
    alreadyOk,
    missingBoth,
    sample,
  };
}

export async function migrateEquipmentNameToSerialNo(opts?: { maxScan?: number; deleteNameField?: boolean }) {
  const maxScan = Math.max(1, Math.min(2000, Number(opts?.maxScan ?? 800)));
  const deleteNameField = Boolean(opts?.deleteNameField);

  const q = query(collection(db, COL), limit(maxScan));
  const snap = await getDocs(q);

  let updated = 0;
  let skipped = 0;

  const toUpdate: Array<{ id: string; serialNo: string }> = [];

  for (const d of snap.docs) {
    const data = readEquipmentDoc(d.data());
    const serialNo = normalizeString(data.serialNo);
    if (serialNo) {
      skipped++;
      continue;
    }
    const name = normalizeString(data.name);
    if (!name) {
      skipped++;
      continue;
    }
    toUpdate.push({ id: d.id, serialNo: name });
  }

  for (let i = 0; i < toUpdate.length; i += 500) {
    const chunk = toUpdate.slice(i, i + 500);
    const batch = writeBatch(db);
    for (const row of chunk) {
      const ref = doc(db, COL, row.id);
      const patch: Record<string, unknown> = {
        serialNo: row.serialNo,
        updatedAt: Date.now(),
        updatedAtServer: serverTimestamp(),
      };
      if (deleteNameField) patch.name = deleteField();
      batch.update(ref, patch);
      updated++;
    }
    await batch.commit();
  }

  return {
    scanned: snap.size,
    updated,
    skipped,
  };
}
