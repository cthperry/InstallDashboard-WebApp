"use client";

import { useCallback, useState } from "react";
import type { Equipment, EquipmentFormData } from "@/domain/types";
import { EQUIPMENT_FORM_DEFAULTS } from "@/domain/types";
import { equipmentSchema } from "@/domain/schemas";
import { createEquipment, updateEquipment, removeEquipment } from "@/features/data/equipments";
import { writeAuditLog } from "@/features/data/audit";

type UseEquipmentActionsOpts = {
  userEmail: string;
  showToast: (msg: string, duration?: number) => void;
};

/**
 * 設備 CRUD 操作 hook — 從 page.tsx 抽出的業務邏輯
 */
export function useEquipmentActions({ userEmail, showToast }: UseEquipmentActionsOpts) {
  const [eqDrawerOpen, setEqDrawerOpen] = useState(false);
  const [eqSelected, setEqSelected] = useState<Equipment | null>(null);
  const [eqModal, setEqModal] = useState(false);
  const [eqEditId, setEqEditId] = useState<string | null>(null);
  const [eqForm, setEqForm] = useState<EquipmentFormData>({ ...EQUIPMENT_FORM_DEFAULTS });

  const openAdd = useCallback(() => {
    setEqEditId(null);
    setEqForm({ ...EQUIPMENT_FORM_DEFAULTS });
    setEqModal(true);
  }, []);

  const openEdit = useCallback((r: Equipment) => {
    setEqEditId(r.id);
    const blocking = r.blocking && typeof r.blocking === "object" ? r.blocking : undefined;
    const { id, createdAt, updatedAt, ...formFields } = r;
    setEqForm({ ...EQUIPMENT_FORM_DEFAULTS, ...formFields, blocking });
    setEqDrawerOpen(false);
    setEqModal(true);
  }, []);

  const save = useCallback(async () => {
    try {
      const errors: string[] = [];
      if (!eqForm.serialNo?.trim())  errors.push("序號");
      if (!eqForm.customer)          errors.push("客戶");
      if (!eqForm.site?.trim())      errors.push("工廠/裝機地點");
      if (!eqForm.owner?.trim())     errors.push("設備所有人");
      if (errors.length > 0) {
        showToast(`⚠️ 請填寫：${errors.join("、")}`);
        return;
      }
      const safedEqForm: Omit<Equipment, "id"> = {
        ...eqForm,
        statusSub: eqForm.statusSub || "",
        blocking: (eqForm.blocking && typeof eqForm.blocking === "object") ? eqForm.blocking : undefined,
      };
      const parsed = equipmentSchema.parse(safedEqForm) as Omit<Equipment, "id">;
      if (eqEditId) {
        await updateEquipment(eqEditId, parsed);
        writeAuditLog("UPDATE_EQUIPMENT", eqEditId, parsed.equipmentId || "", userEmail);
        showToast("已更新");
      } else {
        await createEquipment(parsed);
        writeAuditLog("CREATE_EQUIPMENT", "", parsed.equipmentId || "", userEmail);
        showToast("已新增");
      }
      setEqModal(false);
    } catch (err: unknown) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "儲存失敗");
    }
  }, [eqForm, eqEditId, userEmail, showToast]);

  const del = useCallback(
    async (r: Equipment) => {
      if (!confirm(`確認刪除「${r.equipmentId || r.id}」？`)) return;
      try {
        await removeEquipment(r.id);
        writeAuditLog("DELETE_EQUIPMENT", r.id, r.equipmentId || "", userEmail);
        showToast("已刪除");
      } catch (err) {
        console.error(err);
        showToast("刪除失敗");
      }
    },
    [userEmail, showToast]
  );

  return {
    eqDrawerOpen, setEqDrawerOpen,
    eqSelected, setEqSelected,
    eqModal, setEqModal,
    eqEditId,
    eqForm, setEqForm,
    openAddEq: openAdd,
    openEditEq: openEdit,
    saveEq: save,
    delEq: del,
  };
}
