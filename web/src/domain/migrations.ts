/**
 * 資料遷移工具
 *
 * 處理 Firestore 中因版本升級而產生的舊格式資料。
 * 在 listenInstallations 回傳後或表單打開時呼叫。
 */

import type { Installation, PhaseKey, PhaseKeyLegacy } from "./types";

/**
 * 已移除的 phase 對應新 phase
 * hookup → installing（管線連接已併入裝機中）
 */
const LEGACY_PHASE_MAP: Record<string, PhaseKey> = {
  hookup: "installing",
};

/**
 * 將舊版 phase 映射為有效 PhaseKey。
 * 若已是有效值則原樣返回。
 */
export function normalizePhase(phase: PhaseKeyLegacy | string): PhaseKey {
  if (phase in LEGACY_PHASE_MAP) return LEGACY_PHASE_MAP[phase];
  return phase as PhaseKey;
}

/**
 * 正規化單筆 Installation 資料
 * - 修正舊 phase（hookup → installing）
 * - 未來可擴展其他欄位遷移
 */
export function normalizeInstallation(row: Installation): Installation {
  return {
    ...row,
    phase: normalizePhase(row.phase),
  };
}

/**
 * 批次正規化 Installation 陣列
 */
export function normalizeInstallations(rows: Installation[]): Installation[] {
  return rows.map(normalizeInstallation);
}

/**
 * Checklist key 正規化
 * 將 index-based key (e.g. "installing_0") 保留向後相容，
 * 同時支援 slug-based key (e.g. "installing_機台定位")。
 */
export function normalizeChecklistKey(phaseKey: string, index: number, itemLabel: string): string {
  // 新格式：phase + slug（穩定，不受順序影響）
  const slug = itemLabel.replace(/[\s\/]/g, "_").slice(0, 30);
  return `${phaseKey}_${slug}`;
}
