export type InstallationImportMetricRow = {
  _selected: boolean;
  _regionMatched: boolean;
};

export type InstallationImportPreviewMetrics<Row extends InstallationImportMetricRow> = {
  selectedRows: Row[];
  allSelected: boolean;
  unmatchedCount: number;
};

export type EquipmentImportMetricRow = InstallationImportMetricRow & {
  serialNo: string;
};

export type EquipmentImportPreviewMetrics<Row extends EquipmentImportMetricRow> = {
  selectedRows: Row[];
  selectedSerials: string[];
  allSelected: boolean;
  someSelected: boolean;
  unmatchedCount: number;
  noSerialCount: number;
};

export function buildInstallationImportPreviewMetrics<Row extends InstallationImportMetricRow>(
  rows: Row[],
): InstallationImportPreviewMetrics<Row> {
  const selectedRows: Row[] = [];
  let unmatchedCount = 0;

  for (const row of rows) {
    if (!row._selected) continue;
    selectedRows.push(row);
    if (!row._regionMatched) unmatchedCount += 1;
  }

  return {
    selectedRows,
    allSelected: rows.length > 0 && selectedRows.length === rows.length,
    unmatchedCount,
  };
}

export function buildEquipmentImportPreviewMetrics<Row extends EquipmentImportMetricRow>(
  rows: Row[],
): EquipmentImportPreviewMetrics<Row> {
  const selectedRows: Row[] = [];
  const selectedSerials: string[] = [];
  let unmatchedCount = 0;
  let noSerialCount = 0;

  for (const row of rows) {
    if (!row._selected) continue;
    selectedRows.push(row);
    const serialNo = row.serialNo.trim();
    if (serialNo) {
      selectedSerials.push(serialNo);
    } else {
      noSerialCount += 1;
    }
    if (!row._regionMatched) unmatchedCount += 1;
  }

  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  return {
    selectedRows,
    selectedSerials,
    allSelected,
    someSelected: selectedRows.length > 0 && !allSelected,
    unmatchedCount,
    noSerialCount,
  };
}
