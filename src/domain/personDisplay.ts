function sanitizeRaw(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
}

function stripEmail(raw: string): string {
  return raw.includes("@") ? raw.split("@")[0]?.trim() ?? "" : raw;
}

function asciiLeadingToken(raw: string): string {
  const firstToken = raw.split(/\s+/)[0] ?? "";
  return firstToken.trim();
}

function titleCaseToken(token: string): string {
  if (!token) return "";
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function normalizePersonKey(raw: unknown): string {
  const cleaned = sanitizeRaw(raw);
  if (!cleaned) return "";

  const noEmail = stripEmail(cleaned);
  const leading = asciiLeadingToken(noEmail);
  const candidate = (leading.split(/[_.\-]/)[0] ?? "").trim();
  if (candidate) return candidate.toLowerCase();

  return cleaned.toLowerCase();
}

export function toDisplayShortName(raw: unknown): string {
  const cleaned = sanitizeRaw(raw);
  if (!cleaned) return "";

  const noEmail = stripEmail(cleaned);
  const leading = asciiLeadingToken(noEmail);
  const candidate = (leading.split(/[_.\-]/)[0] ?? "").trim();
  if (candidate) return titleCaseToken(candidate);

  const firstWord = (cleaned.split(/\s+/)[0] ?? "").trim();
  return firstWord || cleaned;
}

export function dedupeDisplayNames(rawList: Array<unknown>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of rawList) {
    const key = normalizePersonKey(item);
    const display = toDisplayShortName(item);
    if (!key || !display || seen.has(key)) continue;
    seen.add(key);
    output.push(display);
  }

  return output.sort((a, b) => a.localeCompare(b, "zh-Hant"));
}

export function buildOwnerListFromUserEmails(emails: string[]): string[] {
  return dedupeDisplayNames(
    emails.filter((email) => {
      const key = normalizePersonKey(email);
      return key !== "" && key !== "pii";
    }),
  );
}
