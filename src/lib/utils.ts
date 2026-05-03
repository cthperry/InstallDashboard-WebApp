import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function trimString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

export const normalizeString = trimString;

const UNICODE_DASH_REGEX = /[‐‑‒–—−﹣－]/g;

export function normalizeComparableText(value: unknown): string {
  return trimString(value)
    .replace(UNICODE_DASH_REGEX, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompactKey(value: unknown): string {
  return normalizeComparableText(value)
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function formatDateInTimeZoneYmd(date: Date = new Date(), timeZone = "Asia/Taipei"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return `${year}-${month}-${day}`;
}

export function todayInTaipeiYmd(date: Date = new Date()): string {
  return formatDateInTimeZoneYmd(date, "Asia/Taipei");
}

export function normalizeDateYmd(value: unknown): string {
  if (value == null || value === "") return "";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const raw = trimString(value);
  if (!raw) return "";

  const normalized = raw.replace(/[./]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return raw;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return raw;

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return raw;
  }

  return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isDateYmd(value: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeDateYmd(value));
}
