/**
 * Checklist Key 工具
 *
 * 舊格式：`${phase}_${index}` (e.g. "installing_0")
 * 新格式：`${phase}_${slug}`  (e.g. "installing_機台定位_水平調整")
 *
 * 新格式不受 checklist 項目順序變動影響（穩定）。
 * 讀取時同時檢查新舊 key，確保向後相容。
 */

/**
 * 產生穩定的 checklist key（slug-based）
 */
export function checklistKey(phase: string, itemLabel: string): string {
  const slug = itemLabel
    .replace(/[\s\/]+/g, "_")   // 空白、斜線 → _
    .replace(/[()（）]/g, "")    // 括號去除
    .slice(0, 30);
  return `${phase}_${slug}`;
}

/**
 * 讀取 checklist 值，優先讀新 slug key，fallback 舊 index key
 */
export function getCheckValue(
  checklist: Record<string, boolean> | undefined,
  phase: string,
  index: number,
  itemLabel: string,
): boolean {
  if (!checklist) return false;
  const newKey = checklistKey(phase, itemLabel);
  if (newKey in checklist) return checklist[newKey];
  // fallback: 舊 index key
  const oldKey = `${phase}_${index}`;
  return checklist[oldKey] ?? false;
}

/**
 * 設定 checklist 值，寫入新 slug key（保留舊 key 不刪，避免回退問題）
 */
export function setCheckValue(
  checklist: Record<string, boolean> | undefined,
  phase: string,
  index: number,
  itemLabel: string,
  checked: boolean,
): Record<string, boolean> {
  const newKey = checklistKey(phase, itemLabel);
  return {
    ...checklist,
    [newKey]: checked,
  };
}
