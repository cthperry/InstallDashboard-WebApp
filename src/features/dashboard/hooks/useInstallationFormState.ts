import { useCallback, useRef, useState } from "react";
import type { PhaseKey, RegionKey } from "@/domain/types";
import type { InstallationDraft } from "@/domain/installationContract";
import { getInstallationProgressByPhase } from "@/features/dashboard/services/installationLifecycleService";
import { collectFieldErrors, type FieldErrorMap } from "@/features/dashboard/dashboardViewUtils";

type ValidationIssue = {
  path?: Array<string | number>;
  message: string;
};

export function useInstallationFormState(initialDraft: InstallationDraft) {
  const [installForm, setInstallForm] = useState<InstallationDraft>(initialDraft);
  const [installErrors, setInstallErrors] = useState<FieldErrorMap>({});
  const [installErrorSummary, setInstallErrorSummary] = useState<string[]>([]);
  const installFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const clearInstallErrors = useCallback(() => {
    setInstallErrors({});
    setInstallErrorSummary([]);
  }, []);

  const updateInstallField = useCallback(<K extends keyof InstallationDraft>(field: K, value: InstallationDraft[K]) => {
    setInstallForm((prev) => ({ ...prev, [field]: value }));
    setInstallErrors((prev) => {
      const fieldName = String(field);
      if (!prev[fieldName]) return prev;
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
    setInstallErrorSummary([]);
  }, []);

  const updateInstallCustomer = useCallback((value: string, inferredRegion: RegionKey | null) => {
    setInstallForm((prev) => ({
      ...prev,
      customer: value,
      ...(inferredRegion ? { region: inferredRegion } : {}),
    }));
    setInstallErrors((prev) => {
      if (!prev.customer && !prev.region) return prev;
      const next = { ...prev };
      delete next.customer;
      if (inferredRegion) delete next.region;
      return next;
    });
    setInstallErrorSummary([]);
  }, []);

  const updateInstallPhase = useCallback((phase: PhaseKey) => {
    setInstallForm((prev) => ({
      ...prev,
      phase,
      progress: getInstallationProgressByPhase(phase),
    }));
    setInstallErrors((prev) => {
      if (!prev.phase) return prev;
      const next = { ...prev };
      delete next.phase;
      return next;
    });
    setInstallErrorSummary([]);
  }, []);

  const focusInstallErrorField = useCallback((field: string) => {
    const container = installFieldRefs.current[field];
    if (!container) return;
    container.scrollIntoView({ behavior: "smooth", block: "center" });
    const target = container.querySelector("input, select, textarea, button") as HTMLElement | null;
    target?.focus();
  }, []);

  const showInstallValidationErrors = useCallback((issues: ReadonlyArray<ValidationIssue>) => {
    const { fieldErrors, summary } = collectFieldErrors(issues);
    setInstallErrors(fieldErrors);
    setInstallErrorSummary(summary);
    const firstField = Object.keys(fieldErrors)[0];
    if (firstField) {
      window.setTimeout(() => focusInstallErrorField(firstField), 0);
    }
    return summary[0] ?? "表單驗證失敗";
  }, [focusInstallErrorField]);

  return {
    installForm,
    setInstallForm,
    installErrors,
    installErrorSummary,
    installFieldRefs,
    clearInstallErrors,
    updateInstallField,
    updateInstallCustomer,
    updateInstallPhase,
    showInstallValidationErrors,
  };
}
