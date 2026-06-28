import { useCallback, useState } from "react";

import type { PhaseKey, RegionKey } from "@/domain/types";

const SAVED_FILTERS_KEY = "premtek_saved_filters";

export type SavedFilter = {
  id: string;
  name: string;
  region: "" | RegionKey;
  model: string;
  phase: "" | PhaseKey;
  customer: string;
  engineer: string;
  keyword: string;
  savedAt: number;
};

export type SavedFilterDraft = Omit<SavedFilter, "id" | "savedAt">;

const REGION_VALUES = new Set<RegionKey>(["north", "central", "south"]);
const PHASE_VALUES = new Set<PhaseKey>(["ordered", "shipping", "arrived", "installing", "trial", "qual", "released"]);

function normalizeRegion(value: unknown): "" | RegionKey {
  return typeof value === "string" && REGION_VALUES.has(value as RegionKey) ? (value as RegionKey) : "";
}

function normalizePhase(value: unknown): "" | PhaseKey {
  return typeof value === "string" && PHASE_VALUES.has(value as PhaseKey) ? (value as PhaseKey) : "";
}

function normalizeSavedFilter(value: unknown): SavedFilter | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name) return null;

  return {
    id: typeof row.id === "string" && row.id ? row.id : `${Date.now().toString(36)}-${name}`,
    name,
    region: normalizeRegion(row.region),
    model: typeof row.model === "string" ? row.model : "",
    phase: normalizePhase(row.phase),
    customer: typeof row.customer === "string" ? row.customer : "",
    engineer: typeof row.engineer === "string" ? row.engineer : "",
    keyword: typeof row.keyword === "string" ? row.keyword : "",
    savedAt: typeof row.savedAt === "number" && Number.isFinite(row.savedAt) ? row.savedAt : 0,
  };
}

function loadSavedFilters(): SavedFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_FILTERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeSavedFilter).filter((row): row is SavedFilter => row !== null);
  } catch {
    return [];
  }
}

function persistSavedFilters(filters: SavedFilter[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Saved filters are a convenience feature; storage failures should not break the dashboard.
  }
}

export function useSavedFilters() {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => loadSavedFilters());

  const addSavedFilter = useCallback((draft: SavedFilterDraft) => {
    const filter: SavedFilter = {
      ...draft,
      id: Date.now().toString(36),
      savedAt: Date.now(),
    };
    setSavedFilters((prev) => {
      const next = [...prev, filter];
      persistSavedFilters(next);
      return next;
    });
  }, []);

  const deleteSavedFilter = useCallback((id: string) => {
    setSavedFilters((prev) => {
      const next = prev.filter((filter) => filter.id !== id);
      persistSavedFilters(next);
      return next;
    });
  }, []);

  return {
    savedFilters,
    addSavedFilter,
    deleteSavedFilter,
  };
}
