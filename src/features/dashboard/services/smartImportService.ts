"use client";

import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import type { Equipment, Installation } from "@/domain/types";
import { db } from "@/lib/firebase/client";
import {
  buildInstallationImportKey,
  listExistingInstallationDocIdsByImportKey,
  listExistingInstallationDocIdsBySerialName,
} from "@/features/data/installations";
import { listExistingEquipmentDocIdsBySerialKey } from "@/features/data/equipments";
import { normalizeCompactKey, normalizeString } from "@/lib/utils";

const INSTALLATIONS_COL = "installations";
const EQUIPMENTS_COL = "equipments";
const MAX_ATOMIC_IMPORT_ROWS = 450;

export type SmartImportTransferInput = {
  installation: Omit<Installation, "id">;
  equipment: Omit<Equipment, "id">;
};

export type SmartImportCommitInput = {
  installations: Array<Omit<Installation, "id">>;
  transfers: SmartImportTransferInput[];
};

export type SmartImportCommitResult = {
  createdInstallations: number;
  updatedInstallations: number;
  createdEquipments: number;
  updatedEquipments: number;
  skippedDuplicateEquipments: number;
  removedInstallations: number;
};

export { MAX_ATOMIC_IMPORT_ROWS };

function normalizeEquipmentSerial(value: unknown): string {
  return normalizeCompactKey(value);
}

function mergeDocIds(...groups: Array<string[] | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const id of group ?? []) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function resolveInstallationMatchDocIds(
  row: Omit<Installation, "id">,
  idsByImportKey: Map<string, string[]>,
  idsBySerial: Map<string, string[]>,
): string[] {
  const importKey = buildInstallationImportKey(row);
  const serialKey = normalizeEquipmentSerial(row.name);
  return mergeDocIds(idsByImportKey.get(importKey), serialKey ? idsBySerial.get(serialKey) : undefined);
}

export async function commitSmartImportBatch(input: SmartImportCommitInput): Promise<SmartImportCommitResult> {
  const total = input.installations.length + input.transfers.length;
  if (total > MAX_ATOMIC_IMPORT_ROWS) {
    throw new Error(`單次智慧匯入最多支援 ${MAX_ATOMIC_IMPORT_ROWS} 筆，請拆成多次匯入`);
  }

  const transferInstallationRows = input.transfers.map((item) => item.installation);
  const installationRows = input.installations;
  const installationLookupRows = [...installationRows, ...transferInstallationRows];
  const installationImportKeys = installationLookupRows.map((row) => buildInstallationImportKey(row));
  const installationSerialKeys = installationLookupRows
    .map((row) => normalizeEquipmentSerial(row.name))
    .filter(Boolean);

  const [existingInstallationIdsByImportKey, existingInstallationIdsBySerial, existingEquipmentDocIdsBySerial] = await Promise.all([
    listExistingInstallationDocIdsByImportKey(installationImportKeys),
    listExistingInstallationDocIdsBySerialName(installationSerialKeys),
    listExistingEquipmentDocIdsBySerialKey(input.transfers.map((item) => item.equipment.serialNo)),
  ]);

  const now = Date.now();
  const batch = writeBatch(db);
  let createdInstallations = 0;
  let updatedInstallations = 0;
  let createdEquipments = 0;
  let updatedEquipments = 0;
  let skippedDuplicateEquipments = 0;
  let removedInstallations = 0;

  const deletedInstallationDocIds = new Set<string>();
  const seenInstallationImportKeys = new Set<string>();

  for (const row of installationRows) {
    const importKey = buildInstallationImportKey(row);
    if (seenInstallationImportKeys.has(importKey)) continue;
    seenInstallationImportKeys.add(importKey);

    const matchedDocIds = resolveInstallationMatchDocIds(row, existingInstallationIdsByImportKey, existingInstallationIdsBySerial)
      .filter((id) => !deletedInstallationDocIds.has(id));
    const [primaryDocId, ...duplicateDocIds] = matchedDocIds;

    for (const duplicateId of duplicateDocIds) {
      batch.delete(doc(db, INSTALLATIONS_COL, duplicateId));
      deletedInstallationDocIds.add(duplicateId);
      removedInstallations += 1;
    }

    const payload = {
      ...row,
      importKey,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    };

    if (primaryDocId) {
      batch.update(doc(db, INSTALLATIONS_COL, primaryDocId), payload);
      updatedInstallations += 1;
      continue;
    }

    const ref = doc(collection(db, INSTALLATIONS_COL));
    batch.set(ref, {
      ...payload,
      createdAt: now,
      createdAtServer: serverTimestamp(),
    });
    createdInstallations += 1;
  }

  const seenTransferSerials = new Set<string>();
  for (const item of input.transfers) {
    const serialKey = normalizeEquipmentSerial(item.equipment.serialNo);
    if (!serialKey) continue;
    if (seenTransferSerials.has(serialKey)) {
      skippedDuplicateEquipments += 1;
      continue;
    }
    seenTransferSerials.add(serialKey);

    const matchedInstallationDocIds = resolveInstallationMatchDocIds(item.installation, existingInstallationIdsByImportKey, existingInstallationIdsBySerial)
      .filter((id) => !deletedInstallationDocIds.has(id));

    for (const installDocId of matchedInstallationDocIds) {
      batch.delete(doc(db, INSTALLATIONS_COL, installDocId));
      deletedInstallationDocIds.add(installDocId);
      removedInstallations += 1;
    }

    const existingEquipmentDocId = existingEquipmentDocIdsBySerial.get(serialKey);
    const equipmentPayload = {
      ...item.equipment,
      serialNo: normalizeString(item.equipment.serialNo),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    };

    if (existingEquipmentDocId) {
      batch.update(doc(db, EQUIPMENTS_COL, existingEquipmentDocId), equipmentPayload);
      updatedEquipments += 1;
      continue;
    }

    const ref = doc(collection(db, EQUIPMENTS_COL));
    batch.set(ref, {
      ...equipmentPayload,
      createdAt: now,
      createdAtServer: serverTimestamp(),
    });
    createdEquipments += 1;
  }

  await batch.commit();

  return {
    createdInstallations,
    updatedInstallations,
    createdEquipments,
    updatedEquipments,
    skippedDuplicateEquipments,
    removedInstallations,
  };
}
