import type { Installation } from "@/domain/types";

export type BulkInstallTargets = {
  ids: string[];
  count: number;
};

export function buildBulkInstallTargets(rows: Installation[]): BulkInstallTargets {
  const ids: string[] = [];
  for (const row of rows) {
    if (row.phase !== "released") ids.push(row.id);
  }

  return {
    ids,
    count: ids.length,
  };
}
