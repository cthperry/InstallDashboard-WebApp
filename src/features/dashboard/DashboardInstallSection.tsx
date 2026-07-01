import type { Dispatch, SetStateAction } from "react";

import type { MachineModel, PhaseKey, RegionKey } from "@/domain/types";
import { PHASES } from "@/domain/constants";
import { DateInput } from "@/features/ui/DateInput";
import { RegionTabs } from "@/features/ui/RegionTabs";
import type { InstallSortKey } from "@/features/dashboard/dashboardFilters";
import { MissionQueuePanel, type MissionQueueItem, type SortDirection } from "@/features/dashboard/dashboardWidgets";
import type { SavedFilter } from "@/features/dashboard/hooks/useSavedFilters";
import { ActiveFilterSummary, DashboardStatusBanner, type ActiveFilterChip } from "@/features/dashboard/DashboardSharedControls";
import { parsePhaseFilter, type InstallView } from "@/features/dashboard/dashboardViewUtils";

export type DashboardInstallSectionProps = {
  isAdmin: boolean;
  installActionQueue: MissionQueueItem[];
  installView: InstallView;
  switchInstallView: (view: InstallView) => void;
  downloadInstallationsCsvReport: () => void;
  installCsvDisabled: boolean;
  installCsvTitle: string;
  onOpenSmartImport: () => void;
  openAddInstall: () => void;
  fRegion: RegionKey | "";
  setFRegion: (value: RegionKey | "") => void;
  fPhase: PhaseKey | "";
  setFPhase: (value: PhaseKey | "") => void;
  keyword: string;
  setKeyword: (value: string) => void;
  installSortKey: InstallSortKey;
  setInstallSortKey: (value: InstallSortKey) => void;
  installSortDir: SortDirection;
  setInstallSortDir: (value: SortDirection) => void;
  showInstallAdvancedFilters: boolean;
  setShowInstallAdvancedFilters: Dispatch<SetStateAction<boolean>>;
  fModel: string;
  setFModel: (value: string) => void;
  fCustomer: string;
  setFCustomer: (value: string) => void;
  fEngineer: string;
  setFEngineer: (value: string) => void;
  clearInstallFilters: () => void;
  machineModels: MachineModel[];
  customers: string[];
  engineers: string[];
  filteredInstallationsLength: number;
  installationsLength: number;
  installActiveFilters: ActiveFilterChip[];
  bulkInstallOwner: string;
  setBulkInstallOwner: (value: string) => void;
  bulkInstallBusy: boolean;
  bulkInstallEta: string;
  setBulkInstallEta: (value: string) => void;
  bulkInstallAction: string;
  setBulkInstallAction: (value: string) => void;
  bulkInstallDisabled: boolean;
  applyBulkInstallGovernance: () => void;
  bulkInstallTitle: string;
  bulkInstallTargetCount: number;
  savedFilters: SavedFilter[];
  showSaveFilterInput: boolean;
  setShowSaveFilterInput: Dispatch<SetStateAction<boolean>>;
  saveFilterName: string;
  setSaveFilterName: (value: string) => void;
  saveFilterDisabled: boolean;
  saveCurrentFilter: () => void;
  saveFilterTitle: string;
  hasSavableInstallFilter: boolean;
  applyFilter: (filter: SavedFilter) => void;
  deleteSavedFilterWithConfirm: (filter: SavedFilter) => void;
  installErr: string;
  installLoading: boolean;
};

export function DashboardInstallSection({
  isAdmin,
  installActionQueue,
  installView,
  switchInstallView,
  downloadInstallationsCsvReport,
  installCsvDisabled,
  installCsvTitle,
  onOpenSmartImport,
  openAddInstall,
  fRegion,
  setFRegion,
  fPhase,
  setFPhase,
  keyword,
  setKeyword,
  installSortKey,
  setInstallSortKey,
  installSortDir,
  setInstallSortDir,
  showInstallAdvancedFilters,
  setShowInstallAdvancedFilters,
  fModel,
  setFModel,
  fCustomer,
  setFCustomer,
  fEngineer,
  setFEngineer,
  clearInstallFilters,
  machineModels,
  customers,
  engineers,
  filteredInstallationsLength,
  installationsLength,
  installActiveFilters,
  bulkInstallOwner,
  setBulkInstallOwner,
  bulkInstallBusy,
  bulkInstallEta,
  setBulkInstallEta,
  bulkInstallAction,
  setBulkInstallAction,
  bulkInstallDisabled,
  applyBulkInstallGovernance,
  bulkInstallTitle,
  bulkInstallTargetCount,
  savedFilters,
  showSaveFilterInput,
  setShowSaveFilterInput,
  saveFilterName,
  setSaveFilterName,
  saveFilterDisabled,
  saveCurrentFilter,
  saveFilterTitle,
  hasSavableInstallFilter,
  applyFilter,
  deleteSavedFilterWithConfirm,
  installErr,
  installLoading,
}: DashboardInstallSectionProps) {
  return (
    <>
      <MissionQueuePanel
        title="裝機資料品質"
        subtitle={`${installActionQueue.length} 筆需補資料`}
        items={installActionQueue}
        emptyText="目前沒有缺序號、缺工程師、缺預計日、SLA 警戒或久未更新的裝機案。"
      />

      <div className="card auroraControlPanel" style={{ padding: 14, marginTop: 12 }}>
        <div className="panelHeader auroraPanelHeader">
          <div style={{ fontWeight: 900 }}>篩選 / 操作</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div className="segTabs">
              <button className={installView === "table" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("table")}>表格</button>
              <button className={installView === "pipeline" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("pipeline")}>Pipeline</button>
              <button className={installView === "gantt" ? "segTab segTabActive" : "segTab"} onClick={() => switchInstallView("gantt")}>甘特圖</button>
            </div>
            <button className="btn btnSmall" onClick={downloadInstallationsCsvReport} disabled={installCsvDisabled} title={installCsvTitle}>匯出 CSV</button>
            <button className="btn btnSmall" onClick={onOpenSmartImport}>⬆ Excel 智慧匯入</button>
            <button className="btn btnAccent" onClick={openAddInstall}>新增裝機案</button>
          </div>
        </div>

        <div className="filters" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: "1 1 240px" }}>
            <div className="label">區域</div>
            <RegionTabs value={fRegion} onChange={setFRegion} />
          </div>
          <div className="field">
            <div className="label">階段</div>
            <select value={fPhase} onChange={(event) => setFPhase(parsePhaseFilter(event.target.value))}>
              <option value="">全部</option>
              {PHASES.map((phase) => <option key={phase.key} value={phase.key}>{phase.icon} {phase.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 220 }}>
            <div className="label">關鍵字</div>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="設備/客戶/工程師/備註..." />
          </div>

          <div className="field" style={{ minWidth: 180 }}>
            <div className="label">排序欄位</div>
            <select value={installSortKey} onChange={(event) => setInstallSortKey(event.target.value as InstallSortKey)}>
              <option value="updatedAt">更新時間</option>
              <option value="estComplete">預計安裝日</option>
              <option value="phase">階段</option>
              <option value="customer">客戶</option>
              <option value="engineer">工程師</option>
              <option value="name">機台序號</option>
            </select>
          </div>

          <div className="field" style={{ minWidth: 120 }}>
            <div className="label">排序方向</div>
            <select value={installSortDir} onChange={(event) => setInstallSortDir(event.target.value as SortDirection)}>
              <option value="desc">由大到小</option>
              <option value="asc">由小到大</option>
            </select>
          </div>

          <button className="btn btnSmall btnGhost" onClick={() => setShowInstallAdvancedFilters((value) => !value)}>
            {showInstallAdvancedFilters ? "收合進階篩選" : "展開進階篩選"}
          </button>

          {fRegion || fModel || fPhase || fCustomer || fEngineer || keyword ? (
            <button className="btn" onClick={clearInstallFilters}>
              清除
            </button>
          ) : null}

          <div style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>
            {filteredInstallationsLength}/{installationsLength}
          </div>
        </div>

        <ActiveFilterSummary
          filters={installActiveFilters}
          visibleCount={filteredInstallationsLength}
          totalCount={installationsLength}
          onClearAll={clearInstallFilters}
        />

        {showInstallAdvancedFilters ? (
          <div className="filters" style={{ marginTop: 10 }}>
            <div className="field">
              <div className="label">機型</div>
              <select value={fModel} onChange={(event) => setFModel(event.target.value)}>
                <option value="">全部</option>
                {machineModels.map((model) => <option key={model.code} value={model.code}>{model.displayName}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="label">客戶</div>
              <select value={fCustomer} onChange={(event) => setFCustomer(event.target.value)}>
                <option value="">全部</option>
                {customers.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
              </select>
            </div>
            <div className="field">
              <div className="label">工程師</div>
              <select value={fEngineer} onChange={(event) => setFEngineer(event.target.value)}>
                <option value="">全部</option>
                {engineers.map((engineer) => <option key={engineer} value={engineer}>{engineer}</option>)}
              </select>
            </div>
          </div>
        ) : null}

        {isAdmin ? (
          <div className="filters" style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div className="field" style={{ minWidth: 170 }}>
              <div className="label">批次 Owner</div>
              <select value={bulkInstallOwner} onChange={(event) => setBulkInstallOwner(event.target.value)} disabled={bulkInstallBusy}>
                <option value="">不變更</option>
                {engineers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 170 }}>
              <div className="label">批次 ETA</div>
              <DateInput value={bulkInstallEta} onChange={setBulkInstallEta} disabled={bulkInstallBusy} />
            </div>
            <div className="field" style={{ flex: "1 1 260px" }}>
              <div className="label">批次下一步</div>
              <input
                value={bulkInstallAction}
                onChange={(event) => setBulkInstallAction(event.target.value)}
                disabled={bulkInstallBusy}
                placeholder="例如：補齊客戶驗收時程"
              />
            </div>
            <button className="btn btnSmall" disabled={bulkInstallDisabled} onClick={applyBulkInstallGovernance} title={bulkInstallTitle}>
              {bulkInstallBusy ? "更新中..." : `套用至目前篩選 ${bulkInstallTargetCount} 筆`}
            </button>
          </div>
        ) : null}

        {savedFilters.length > 0 || showSaveFilterInput ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground, #64748b)", whiteSpace: "nowrap" }}>書籤:</span>
            {savedFilters.map((filter) => (
              <div key={filter.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <button className="btn btnSmall" style={{ paddingLeft: 8, paddingRight: 8, fontSize: 11 }} onClick={() => applyFilter(filter)} title={filter.savedAt ? new Date(filter.savedAt).toLocaleString("zh-TW") : ""}>{filter.name}</button>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "0 2px", lineHeight: 1, fontSize: 14 }} onClick={() => deleteSavedFilterWithConfirm(filter)} title={`刪除書籤：${filter.name}`}>×</button>
              </div>
            ))}
          </div>
        ) : null}

        {showSaveFilterInput ? (
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ flex: 1, maxWidth: 240 }} value={saveFilterName} onChange={(event) => setSaveFilterName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !saveFilterDisabled && saveCurrentFilter()} placeholder="書籤名稱..." autoFocus />
            <button className="btn btnSmall btnAccent" onClick={saveCurrentFilter} disabled={saveFilterDisabled} title={saveFilterTitle}>儲存</button>
            <button className="btn btnSmall btnGhost" onClick={() => { setShowSaveFilterInput(false); setSaveFilterName(""); }}>取消</button>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            <button className="btn btnSmall btnGhost" style={{ fontSize: 11 }} onClick={() => setShowSaveFilterInput(true)} disabled={!hasSavableInstallFilter} title={saveFilterTitle}>+ 儲存目前篩選</button>
          </div>
        )}
      </div>

      {installErr ? (
        <DashboardStatusBanner
          tone="error"
          title="裝機資料讀取失敗"
          detail={installErr}
        />
      ) : installLoading ? (
        <DashboardStatusBanner
          tone="info"
          title="正在同步裝機資料"
          detail="讀取完成後會自動更新表格、Pipeline 與甘特圖。"
        />
      ) : null}
    </>
  );
}
