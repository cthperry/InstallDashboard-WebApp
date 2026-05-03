import { createEquipment, findEquipmentBySerialKey, updateEquipment } from "@/features/data/equipments";
import { removeInstallation } from "@/features/data/installations";
import { writeAuditLog } from "@/features/data/audit";
import type { Equipment, Installation } from "@/domain/types";
import { buildEquipmentMilestonesFromInstallationDates } from "@/domain/equipmentMilestones";
import { getInstallationSerial } from "@/domain/installationDisplay";
import { shouldTransferInstallationToEquipment } from "@/domain/installPhase";
import { toDisplayShortName } from "@/domain/personDisplay";

export type EquipmentTransferTrigger = "transition" | "refresh";

export type EquipmentTransferResult = {
  status: "created" | "updated" | "skipped";
  removedInstallation: boolean;
  serialNo: string;
  trigger: EquipmentTransferTrigger;
};

function buildEquipmentPayloadFromInstallation(row: Installation): Omit<Equipment, "id"> {
  const serialNo = getInstallationSerial(row);
  const owner = toDisplayShortName(row.engineer);
  return {
    equipmentId: serialNo,
    region: row.region,
    customer: row.customer,
    site: "",
    modelCode: row.modelCode,
    serialNo,
    statusMain: "正式生產中",
    statusSub: "",
    owner,
    milestones: buildEquipmentMilestonesFromInstallationDates(row),
    capacity: {
      utilization: 0,
      uph: 0,
      targetUph: 0,
      level: "綠",
      trend7d: [0, 0, 0, 0, 0, 0, 0],
    },
    products: [],
  };
}

function mergeEquipmentPayload(existing: Equipment, row: Installation): Partial<Omit<Equipment, "id">> {
  const serialNo = getInstallationSerial(row);
  const currentMilestones = existing.milestones ?? {};
  return {
    equipmentId: existing.equipmentId || serialNo,
    region: row.region,
    customer: row.customer,
    modelCode: row.modelCode,
    serialNo,
    owner: toDisplayShortName(row.engineer),
    statusMain: "正式生產中",
    milestones: buildEquipmentMilestonesFromInstallationDates(row, currentMilestones),
  };
}

export async function transferReleasedInstallationToEquipment(args: {
  installation: Installation;
  installationId?: string | null;
  userEmail: string;
  trigger: EquipmentTransferTrigger;
}): Promise<EquipmentTransferResult> {
  const { installation, installationId, userEmail, trigger } = args;
  const serialNo = getInstallationSerial(installation);

  if (!shouldTransferInstallationToEquipment({ phase: installation.phase, name: serialNo })) {
    return {
      status: "skipped",
      removedInstallation: false,
      serialNo,
      trigger,
    };
  }

  const existing = await findEquipmentBySerialKey(serialNo);

  if (existing) {
    await updateEquipment(existing.id, mergeEquipmentPayload(existing, installation) as Partial<Omit<Equipment, "id">>);
    await writeAuditLog(
      "同步",
      serialNo,
      trigger === "transition"
        ? "裝機進入正式量產，已檢查並同步既有設備台帳"
        : "正式量產裝機再次儲存，已同步既有設備台帳",
      userEmail,
    );
  } else {
    await createEquipment(buildEquipmentPayloadFromInstallation(installation));
    await writeAuditLog(
      "同步",
      serialNo,
      trigger === "transition"
        ? "裝機進入正式量產，已自動轉入設備台帳"
        : "正式量產裝機補建設備台帳記錄",
      userEmail,
    );
  }

  let removedInstallation = false;
  if (installationId) {
    await removeInstallation(installationId);
    removedInstallation = true;
    await writeAuditLog(
      "轉移",
      serialNo,
      "裝機進度已於正式量產後移出，資料保留於設備台帳",
      userEmail,
    );
  }

  return {
    status: existing ? "updated" : "created",
    removedInstallation,
    serialNo,
    trigger,
  };
}

export function getEquipmentTransferToast(result: EquipmentTransferResult): string {
  if (result.status === "skipped") return "已儲存";
  if (result.status === "created" && result.trigger === "transition") {
    return "已轉入設備台帳，並自裝機進度移除（已避免重複序號）";
  }
  if (result.status === "updated" && result.trigger === "transition") {
    return "正式量產資料已同步至既有設備台帳，並自裝機進度移除";
  }
  if (result.status === "created") {
    return "已補建設備台帳記錄，並自裝機進度移除";
  }
  return "已同步既有設備台帳，並自裝機進度移除";
}
