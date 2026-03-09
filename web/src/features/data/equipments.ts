"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Equipment } from "@/domain/types";

const COL = "equipments";

export function listenEquipments(onData: (rows: Equipment[]) => void, onError?: (e: unknown) => void) {
  const q = query(collection(db, COL), orderBy("updatedAt", "desc"));
  return onSnapshot(q, (snap) => {
    const rows: Equipment[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Equipment, "id">) }));
    onData(rows);
  }, (e) => onError?.(e));
}

/** Strip top-level undefined values so Firestore doesn't reject them */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}

export async function createEquipment(data: Omit<Equipment, "id">) {
  const cleaned = stripUndefined(data as unknown as Record<string, unknown>);
  await addDoc(collection(db, COL), {
    ...cleaned,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
}

export async function updateEquipment(id: string, patch: Partial<Omit<Equipment, "id">>) {
  const cleaned = stripUndefined(patch as unknown as Record<string, unknown>);
  await updateDoc(doc(db, COL, id), {
    ...cleaned,
    updatedAt: Date.now()
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
  // 來源：EquipDashboard_DEMO_20260225（示範資料）
  const raw = [
    {
      "equipmentId": "EQ-N-001",
      "region": "北區",
      "customer": "客戶A",
      "site": "竹科Fab1",
      "model": "FlexTRAK-S",
      "serialNo": "P160623",
      "statusMain": "裝機",
      "statusSub": "配管配線",
      "owner": "PM-Allen",
      "milestones": { "installStart": "2026-02-10" },
      "blocking": { "reasonCode": "料件未到", "detail": "真空閥件缺料，等待到貨", "owner": "SCM-Judy", "eta": "2026-03-01" },
      "capacity": { "utilization": 0, "uph": 0, "targetUph": 0, "level": "紅", "trend7d": [0,0,0,0,0,0,0] },
      "updatedAt": "2026-02-25T02:00:00.000Z"
    },
    {
      "equipmentId": "EQ-N-002",
      "region": "北區",
      "customer": "客戶B",
      "site": "桃科Fab2",
      "model": "AP-1000",
      "serialNo": "AP1000-0021",
      "statusMain": "試產",
      "statusSub": "Recipe 調整",
      "owner": "FA-Stone",
      "milestones": { "installDone": "2026-02-12", "trialStart": "2026-02-18" },
      "capacity": { "utilization": 62, "uph": 120, "targetUph": 150, "level": "黃", "trend7d": [40,55,60,58,62,64,62] },
      "updatedAt": "2026-02-25T03:00:00.000Z"
    },
    {
      "equipmentId": "EQ-C-001",
      "region": "中區",
      "customer": "客戶C",
      "site": "中科Fab3",
      "model": "ExoSPHERE",
      "serialNo": "EXO-033",
      "statusMain": "正式上產中",
      "statusSub": "達產追蹤",
      "owner": "PM-Ruby",
      "milestones": { "prodStart": "2026-02-01", "reachTargetDate": "2026-03-10" },
      "capacity": { "utilization": 88, "uph": 210, "targetUph": 220, "level": "綠", "trend7d": [80,82,84,86,87,88,88] },
      "updatedAt": "2026-02-25T04:00:00.000Z"
    },
    {
      "equipmentId": "EQ-S-001",
      "region": "南區",
      "customer": "客戶D",
      "site": "南科Fab5",
      "model": "FlexTRAK-S",
      "serialNo": "FTS-0088",
      "statusMain": "裝機",
      "statusSub": "機台定位/校正",
      "owner": "FA-Marco",
      "milestones": { "installStart": "2026-02-20", "reachTargetDate": "2026-03-15" },
      "capacity": { "utilization": 10, "uph": 10, "targetUph": 150, "level": "紅", "trend7d": [0,0,5,8,10,10,10] },
      "updatedAt": "2026-02-25T05:00:00.000Z"
    }
  ];

  return raw.map((r: any) => ({
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
    capacity: r.capacity,
    createdAt: Date.now(),
    updatedAt: new Date(r.updatedAt).getTime()
  }));
}

export async function seedDemoEquipments() {
  // 若已存在資料，避免重複灌入：只要有 1 筆就跳過
  const q = query(collection(db, COL), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) return { seeded: false, reason: "已有資料" as const };

  const batch = writeBatch(db);
  const rows = getDemoEquipments();
  for (const row of rows) {
    const ref = doc(collection(db, COL));
    batch.set(ref, row);
  }
  await batch.commit();
  return { seeded: true, count: rows.length };
}
