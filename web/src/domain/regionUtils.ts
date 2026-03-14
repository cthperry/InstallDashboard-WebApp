/**
 * regionUtils.ts — 地區推斷共用邏輯
 *
 * 此模組為純函式（無 browser API、無 Firebase），
 * 可同時在前端元件與 API Route（server-side）中引用，消除重複邏輯。
 */

import type { RegionKey } from "./types";

// ── 關鍵字清單 ────────────────────────────────────────────────────────────
const SOUTH_KEYWORDS   = ["高雄", "台南", "臺南", "屏東", "嘉義", "南部", "kaohsiung", "tainan", "pingtung", "chiayi"];
const NORTH_KEYWORDS   = ["台北", "臺北", "桃園", "新竹", "基隆", "宜蘭", "北部", "taipei", "taoyuan", "hsinchu", "keelung"];
const CENTRAL_KEYWORDS = ["台中", "臺中", "彰化", "南投", "苗栗", "中部", "taichung", "changhua", "nantou"];

/**
 * 從任意文字中推斷地區。
 * 找不到時回傳 null（讓呼叫方決定預設值）。
 */
export function inferRegionFromText(text: string): RegionKey | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (SOUTH_KEYWORDS.some(k   => t.includes(k))) return "south";
  if (NORTH_KEYWORDS.some(k   => t.includes(k))) return "north";
  if (CENTRAL_KEYWORDS.some(k => t.includes(k))) return "central";
  return null;
}

/**
 * 從客戶名稱推斷地區，先查 customerRegionMap，再看文字關鍵字，
 * 最後 fallback 為 "central"。
 */
export function inferRegionFromCustomer(
  customer: string,
  customerRegionMap?: Record<string, string>,
): RegionKey {
  if (customerRegionMap?.[customer]) return customerRegionMap[customer] as RegionKey;
  return inferRegionFromText(customer) ?? "central";
}

/**
 * 把中文地區標籤或英文 key 轉成 RegionKey。
 * 例："北區" → "north"，"central" → "central"
 */
export function regionLabelToKey(label: string): RegionKey | null {
  const l = (label ?? "").trim();
  if (l === "北區" || l === "north")   return "north";
  if (l === "中區" || l === "central") return "central";
  if (l === "南區" || l === "south")   return "south";
  return null;
}
