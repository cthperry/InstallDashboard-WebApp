import type { Dispatch, SetStateAction } from "react";

import type { CapacityLevel, Equipment, EquipmentMainStatus, RegionKey } from "@/domain/types";
import {
  CAPACITY_COLOR,
  CAPACITY_LEVELS,
  EQUIPMENT_MAIN_STATUSES,
  REGIONS,
  STATUS_COLOR,
} from "@/domain/constants";
import {
  EQUIPMENT_BLOCKING_STATUS_COLOR,
  EQUIPMENT_BLOCKING_STATUS_LABEL,
  normalizeEquipmentBlockingStatus,
} from "@/domain/equipmentBlocking";
import { getLiveUtilization } from "@/domain/capacity";
import { toDisplayShortName } from "@/domain/personDisplay";
import { Badge } from "@/features/ui/Badge";
import { RegionTabs } from "@/features/ui/RegionTabs";
import { getEquipmentSerialLabel, type EquipSortKey } from "@/features/dashboard/dashboardFilters";
import { calcCapacityLevel, calcEquipmentStats } from "@/features/dashboard/dashboardStats";
import { MissionQueuePanel, SortableTh, type MissionQueueItem, type SortDirection } from "@/features/dashboard/dashboardWidgets";
import { ActiveFilterSummary, DashboardEmptyState, DashboardStatusBanner, type ActiveFilterChip } from "@/features/dashboard/DashboardSharedControls";
import {
  fmtDate,
  parseCapacityFilter,
  parseEquipmentStatusFilter,
  pickColorByUtil,
  regionLabel,
} from "@/features/dashboard/dashboardViewUtils";

type EquipmentStats = ReturnType<typeof calcEquipmentStats>;

export type DashboardEquipmentSectionProps = {
  equipmentActionQueue: MissionQueueItem[];
  downloadEquipmentCsvReport: () => void;
  equipmentCsvDisabled: boolean;
  equipmentCsvTitle: string;
  onOpenSmartImport: () => void;
  openAddEquip: () => void;
  eRegion: RegionKey | "";
  setERegion: (value: RegionKey | "") => void;
  eStatus: EquipmentMainStatus | "";
  setEStatus: (value: EquipmentMainStatus | "") => void;
  eCap: CapacityLevel | "";
  setECap: (value: CapacityLevel | "") => void;
  eKeyword: string;
  setEKeyword: (value: string) => void;
  equipSortKey: EquipSortKey;
  setEquipSortKey: (value: EquipSortKey) => void;
  equipSortDir: SortDirection;
  setEquipSortDir: (value: SortDirection) => void;
  clearEquipmentFilters: () => void;
  filteredEquipments: Equipment[];
  equipments: Equipment[];
  equipmentActiveFilters: ActiveFilterChip[];
  equipStats: EquipmentStats;
  equipErr: string;
  equipLoading: boolean;
  visibleEquipments: Equipment[];
  toggleEquipSort: (key: EquipSortKey) => void;
  openDrawer: (row: Equipment) => void;
  openEditEquip: (row: Equipment) => void;
  delEquip: (row: Equipment) => void;
  setEquipVisibleCount: Dispatch<SetStateAction<number>>;
  tablePageSize: number;
};

export function DashboardEquipmentSection({
  equipmentActionQueue,
  downloadEquipmentCsvReport,
  equipmentCsvDisabled,
  equipmentCsvTitle,
  onOpenSmartImport,
  openAddEquip,
  eRegion,
  setERegion,
  eStatus,
  setEStatus,
  eCap,
  setECap,
  eKeyword,
  setEKeyword,
  equipSortKey,
  setEquipSortKey,
  equipSortDir,
  setEquipSortDir,
  clearEquipmentFilters,
  filteredEquipments,
  equipments,
  equipmentActiveFilters,
  equipStats,
  equipErr,
  equipLoading,
  visibleEquipments,
  toggleEquipSort,
  openDrawer,
  openEditEquip,
  delEquip,
  setEquipVisibleCount,
  tablePageSize,
}: DashboardEquipmentSectionProps) {
  return (
    <>
      <MissionQueuePanel
        title="設備異常待辦"
        subtitle={`${equipmentActionQueue.length} 台需要確認`}
        items={equipmentActionQueue}
        emptyText="目前沒有阻塞、紅燈或高稼動設備。"
      />

      <div className="card" style={{ padding: 14, marginTop: 12 }}>
        <div className="panelHeader">
          <div style={{ fontWeight: 900 }}>篩選 / 操作</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="btn btnSmall" onClick={downloadEquipmentCsvReport} disabled={equipmentCsvDisabled} title={equipmentCsvTitle}>匯出 CSV</button>
            <button className="btn btnSmall" onClick={onOpenSmartImport}>⬆ Excel 智慧匯入</button>
            <button className="btn btnAccent" onClick={openAddEquip}>➕ 新增設備</button>
          </div>
        </div>

        <div className="filters" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: "1 1 240px" }}>
            <div className="label">區域</div>
            <RegionTabs value={eRegion} onChange={setERegion} />
          </div>

          <div className="field">
            <div className="label">主狀態</div>
            <select value={eStatus} onChange={(event) => setEStatus(parseEquipmentStatusFilter(event.target.value))}>
              <option value="">全部</option>
              {EQUIPMENT_MAIN_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>

          <div className="field">
            <div className="label">容量</div>
            <select value={eCap} onChange={(event) => setECap(parseCapacityFilter(event.target.value))}>
              <option value="">全部</option>
              {CAPACITY_LEVELS.map((capacity) => <option key={capacity} value={capacity}>{capacity}</option>)}
            </select>
          </div>

          <div className="field" style={{ flex: 1, minWidth: 240 }}>
            <div className="label">關鍵字</div>
            <input value={eKeyword} onChange={(event) => setEKeyword(event.target.value)} placeholder="客戶/站點/序號/Owner/阻塞原因..." />
          </div>

          <div className="field" style={{ minWidth: 180 }}>
            <div className="label">排序欄位</div>
            <select value={equipSortKey} onChange={(event) => setEquipSortKey(event.target.value as EquipSortKey)}>
              <option value="updatedAt">更新時間</option>
              <option value="utilization">稼動率</option>
              <option value="customer">客戶</option>
              <option value="owner">Owner</option>
              <option value="serialNo">序號</option>
              <option value="statusMain">主狀態</option>
            </select>
          </div>

          <div className="field" style={{ minWidth: 120 }}>
            <div className="label">排序方向</div>
            <select value={equipSortDir} onChange={(event) => setEquipSortDir(event.target.value as SortDirection)}>
              <option value="desc">由大到小</option>
              <option value="asc">由小到大</option>
            </select>
          </div>

          {eRegion || eStatus || eCap || eKeyword ? (
            <button className="btn" onClick={clearEquipmentFilters}>
              清除
            </button>
          ) : null}

          <div style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>
            {filteredEquipments.length}/{equipments.length}
          </div>
        </div>

        <ActiveFilterSummary
          filters={equipmentActiveFilters}
          visibleCount={filteredEquipments.length}
          totalCount={equipments.length}
          onClearAll={clearEquipmentFilters}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <Badge text={`裝機 ${equipStats.byStatus["裝機"]}`} color={STATUS_COLOR["裝機"]} subtle />
          <Badge text={`試產 ${equipStats.byStatus["試產"]}`} color={STATUS_COLOR["試產"]} subtle />
          <Badge text={`正式生產中 ${equipStats.byStatus["正式生產中"]}`} color={STATUS_COLOR["正式生產中"]} subtle />
          <span style={{ opacity: 0.35 }}>|</span>
          <Badge text={`綠 ${equipStats.byCap["綠"]}`} color={CAPACITY_COLOR["綠"]} subtle />
          <Badge text={`黃 ${equipStats.byCap["黃"]}`} color={CAPACITY_COLOR["黃"]} subtle />
          <Badge text={`紅 ${equipStats.byCap["紅"]}`} color={CAPACITY_COLOR["紅"]} subtle />
        </div>
      </div>

      {equipErr ? (
        <DashboardStatusBanner
          tone="error"
          title="設備資料讀取失敗"
          detail={equipErr}
        />
      ) : equipLoading ? (
        <DashboardStatusBanner
          tone="info"
          title="正在同步設備資料"
          detail="讀取完成後會自動更新設備清單與異常待辦。"
        />
      ) : null}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="tableWrap">
          <table className="table dataTableDense equipmentLedgerTable">
            <colgroup>
              <col className="equipmentColSerial" />
              <col className="equipmentColCustomer" />
              <col className="equipmentColModel" />
              <col className="equipmentColStatus" />
              <col className="equipmentColOwner" />
              <col className="equipmentColUtil" />
              <col className="equipmentColUpdated" />
              <col className="equipmentColActions" />
            </colgroup>
            <thead>
              <tr>
                <SortableTh className="tableStickyLeft" label="機台序號" active={equipSortKey === "serialNo"} dir={equipSortDir} onClick={() => toggleEquipSort("serialNo")} />
                <SortableTh label="客戶/站點" active={equipSortKey === "customer"} dir={equipSortDir} onClick={() => toggleEquipSort("customer")} />
                <th>機型 / 設備 ID</th>
                <SortableTh label="狀態" active={equipSortKey === "statusMain"} dir={equipSortDir} onClick={() => toggleEquipSort("statusMain")} />
                <SortableTh label="Owner" active={equipSortKey === "owner"} dir={equipSortDir} onClick={() => toggleEquipSort("owner")} />
                <SortableTh label="稼動率" active={equipSortKey === "utilization"} dir={equipSortDir} onClick={() => toggleEquipSort("utilization")} />
                <SortableTh label="更新" active={equipSortKey === "updatedAt"} dir={equipSortDir} onClick={() => toggleEquipSort("updatedAt")} />
                <th className="tableStickyRight">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleEquipments.map((row) => {
                const statusColor = STATUS_COLOR[row.statusMain];
                const liveLevel = calcCapacityLevel(row.capacity.uph, row.capacity.targetUph);
                const capColor = CAPACITY_COLOR[liveLevel];
                const blockingStatus = row.blocking?.reasonCode ? normalizeEquipmentBlockingStatus(row.blocking.status) : null;
                return (
                  <tr key={row.id}>
                    <td className="tableStickyLeft tableSerialCell mono" title={getEquipmentSerialLabel(row) || "-"}>{getEquipmentSerialLabel(row) || "-"}</td>
                    <td className="tableTextClip" title={`${row.customer} ${row.site || ""}`}>
                      <div style={{ fontWeight: 900 }}>{row.customer}</div>
                      <div className="tableSecondaryText">{regionLabel(row.region)} · {row.site}</div>
                    </td>
                    <td>
                      <div><Badge text={row.modelCode} color="#3b82f6" subtle /></div>
                      <div className="mono tableSecondaryText" style={{ marginTop: 4 }}>
                        {row.equipmentId || "-"}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Badge text={row.statusMain} color={statusColor} subtle />
                        <Badge text={liveLevel} color={capColor} subtle />
                        {blockingStatus ? <Badge text={`${EQUIPMENT_BLOCKING_STATUS_LABEL[blockingStatus]}：${row.blocking?.reasonCode}`} color={EQUIPMENT_BLOCKING_STATUS_COLOR[blockingStatus]} subtle /> : null}
                      </div>
                      <div className="tableSecondaryText" style={{ marginTop: 6 }}>{row.statusSub || "-"}</div>
                    </td>
                    <td>{toDisplayShortName(row.owner) || "-"}</td>
                    <td>
                      <div style={{ fontWeight: 900, color: pickColorByUtil(getLiveUtilization(row.capacity)) }}>{getLiveUtilization(row.capacity)}%</div>
                      <div className="tableSecondaryText">{Number(row.capacity.uph).toLocaleString()}/{Number(row.capacity.targetUph).toLocaleString()} UPH</div>
                    </td>
                    <td className="tableDateCell tableSecondaryText">{fmtDate(row.updatedAt)}</td>
                    <td className="tableStickyRight tableActionsCell">
                      <div className="tableActions">
                        <button className="btn btnSmall" onClick={() => openDrawer(row)}>詳情</button>
                        <button className="btn btnSmall" onClick={() => openEditEquip(row)}>編輯</button>
                        <button className="btn btnSmall btnDanger" onClick={() => delEquip(row)}>刪除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredEquipments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="dashboardEmptyCell">
                    {equipLoading ? (
                      <DashboardEmptyState
                        title="正在同步設備資料"
                        detail="讀取完成後會自動更新清單。"
                      />
                    ) : equipErr ? (
                      <DashboardEmptyState
                        title="設備資料讀取失敗"
                        detail="請稍後重新整理，或確認帳號權限。"
                      />
                    ) : equipments.length === 0 ? (
                      <DashboardEmptyState
                        title="尚無設備"
                        detail="先建立第一台設備，或匯入既有設備清單。"
                        primaryAction={{ label: "新增設備", onClick: openAddEquip, variant: "accent" }}
                        secondaryAction={{ label: "Excel 智慧匯入", onClick: onOpenSmartImport }}
                      />
                    ) : (
                      <DashboardEmptyState
                        title="沒有符合的設備"
                        detail="調整條件或清除目前篩選。"
                        primaryAction={{ label: "清除篩選", onClick: clearEquipmentFilters }}
                      />
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filteredEquipments.length > visibleEquipments.length ? (
          <div className="tableLoadMore">
            <span>已顯示 {visibleEquipments.length} / {filteredEquipments.length} 台，詳情與匯出仍以目前篩選結果為準。</span>
            <button className="btn btnSmall" onClick={() => setEquipVisibleCount((value) => value + tablePageSize)}>載入更多</button>
          </div>
        ) : null}
      </div>
    </>
  );
}
