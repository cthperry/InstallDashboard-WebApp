"use client";

import { useCallback, useState } from "react";
import type { Installation, InstallFormData, MachineModel, PhaseKey, RegionKey } from "@/domain/types";
import { INSTALL_FORM_DEFAULTS } from "@/domain/types";
import { installationSchema } from "@/domain/schemas";
import { createInstallation, updateInstallation, removeInstallation } from "@/features/data/installations";
import { writeAuditLog } from "@/features/data/audit";
import { trackEvent } from "@/features/telemetry/track";

type UseInstallActionsOpts = {
  userEmail: string;
  showToast: (msg: string, duration?: number) => void;
};

/**
 * 裝機案 CRUD 操作 hook — 從 page.tsx 抽出的業務邏輯
 */
export function useInstallActions({ userEmail, showToast }: UseInstallActionsOpts) {
  const [installModal, setInstallModal] = useState(false);
  const [installEditId, setInstallEditId] = useState<string | null>(null);
  const [installForm, setInstallForm] = useState<InstallFormData>({ ...INSTALL_FORM_DEFAULTS });
  const [installSaving, setInstallSaving] = useState(false);

  const openAdd = useCallback(() => {
    setInstallEditId(null);
    setInstallForm({ ...INSTALL_FORM_DEFAULTS });
    setInstallModal(true);
  }, []);

  const openEdit = useCallback((r: Installation) => {
    setInstallEditId(r.id);
    const { id, createdAt, updatedAt, orderDate, ...formFields } = r;
    setInstallForm({
      ...INSTALL_FORM_DEFAULTS,
      ...formFields,
      engineer: formFields.engineer ?? "",
      serialNo: formFields.serialNo ?? "",
      custContact: formFields.custContact ?? "",
      custPhone: formFields.custPhone ?? "",
      estArrival: formFields.estArrival ?? "",
      actArrival: formFields.actArrival ?? "",
      estComplete: formFields.estComplete ?? "",
      actComplete: formFields.actComplete ?? "",
      notes: formFields.notes ?? "",
    });
    setInstallModal(true);
  }, []);

  const save = useCallback(async () => {
    try {
      const installPhases: PhaseKey[] = ["installing", "trial", "qual", "released"];
      const isInstalling = installPhases.includes(installForm.phase);
      const errors: string[] = [];
      if (!installForm.name?.trim())              errors.push("案件名稱");
      if (!installForm.customer)                  errors.push("客戶");
      if (!installForm.modelCode)                 errors.push("機型");
      if (isInstalling && !installForm.engineer)  errors.push("工程師（安裝中以後必填）");
      const needsSerial = installForm.phase !== "ordered";
      if (needsSerial && !installForm.serialNo?.trim()) errors.push("機器序號（備貨出貨後必填）");
      if (errors.length > 0) {
        showToast(`⚠️ 請填寫：${errors.join("、")}`);
        return;
      }
      const result = installationSchema.safeParse(installForm);
      if (!result.success) {
        const fieldLabels: Record<string, string> = {
          name: "案件名稱", customer: "客戶", engineer: "工程師",
          region: "地區", phase: "階段", modelCode: "機型",
          estComplete: "預計完工日期", progress: "施工進度",
        };
        const msgs = result.error.errors.map(e => {
          const field = e.path[0] as string;
          return fieldLabels[field] ? `${fieldLabels[field]}：${e.message}` : e.message;
        });
        showToast(`⚠️ 格式錯誤：${msgs.join("；")}`);
        return;
      }
      setInstallSaving(true);
      const parsed = result.data;
      if (installEditId) {
        await updateInstallation(installEditId, parsed);
        writeAuditLog("UPDATE_INSTALLATION", "Installation", parsed.name, userEmail);
        showToast("已更新");
      } else {
        await createInstallation(parsed);
        writeAuditLog("CREATE_INSTALLATION", "", parsed.name, userEmail);
        showToast("已新增");
      }
      trackEvent("install_saved", { id: installEditId || "new" });
      setInstallModal(false);
    } catch (err: unknown) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setInstallSaving(false);
    }
  }, [installForm, installEditId, userEmail, showToast]);

  const del = useCallback(
    async (r: Installation) => {
      if (!confirm(`確認刪除「${r.name}」？`)) return;
      try {
        await removeInstallation(r.id);
        writeAuditLog("DELETE_INSTALLATION", r.id, r.name, userEmail);
        showToast("已刪除");
        trackEvent("install_deleted", { id: r.id });
      } catch (err) {
        console.error(err);
        showToast("刪除失敗");
      }
    },
    [userEmail, showToast]
  );

  return {
    installModal, setInstallModal,
    installEditId,
    installForm, setInstallForm,
    installSaving,
    openAddInstall: openAdd,
    openEditInstall: openEdit,
    saveInstall: save,
    delInstall: del,
  };
}
