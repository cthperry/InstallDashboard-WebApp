export type ActiveFilterChip = {
  id: string;
  label: string;
  value: string;
  onClear: () => void;
};

export type DashboardEmptyStateAction = {
  label: string;
  onClick: () => void;
  variant?: "accent" | "ghost";
};

export type DashboardStatusTone = "info" | "error";

export function ActiveFilterSummary({
  filters,
  visibleCount,
  totalCount,
  onClearAll,
}: {
  filters: ActiveFilterChip[];
  visibleCount: number;
  totalCount: number;
  onClearAll: () => void;
}) {
  if (filters.length === 0) return null;

  return (
    <div className="activeFilterSummary" aria-label="目前篩選條件">
      <div className="activeFilterCount">
        {visibleCount}/{totalCount}
      </div>
      <div className="activeFilterChips">
        {filters.map((filter) => (
          <button key={filter.id} type="button" className="activeFilterChip" onClick={filter.onClear} title={`移除 ${filter.label}`}>
            <span>{filter.label}</span>
            <strong>{filter.value}</strong>
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btnSmall btnGhost" onClick={onClearAll}>
        清除全部
      </button>
    </div>
  );
}

export function DashboardStatusBanner({
  tone,
  title,
  detail,
}: {
  tone: DashboardStatusTone;
  title: string;
  detail: string;
}) {
  return (
    <div
      className={`card dashboardStatusBanner ${tone === "error" ? "dashboardStatusBannerError" : "dashboardStatusBannerInfo"}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <div className="dashboardStatusTitle">{title}</div>
      <div className="dashboardStatusDetail">{detail}</div>
    </div>
  );
}

export function DashboardEmptyState({
  title,
  detail,
  primaryAction,
  secondaryAction,
}: {
  title: string;
  detail: string;
  primaryAction?: DashboardEmptyStateAction;
  secondaryAction?: DashboardEmptyStateAction;
}) {
  const actionClassName = (action: DashboardEmptyStateAction) => {
    if (action.variant === "accent") return "btn btnSmall btnAccent";
    if (action.variant === "ghost") return "btn btnSmall btnGhost";
    return "btn btnSmall";
  };

  return (
    <div className="dashboardEmptyState">
      <div>
        <div className="dashboardEmptyTitle">{title}</div>
        <div className="dashboardEmptyDetail">{detail}</div>
      </div>
      {primaryAction || secondaryAction ? (
        <div className="dashboardEmptyActions">
          {primaryAction ? (
            <button type="button" className={actionClassName(primaryAction)} onClick={primaryAction.onClick}>
              {primaryAction.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button type="button" className={actionClassName(secondaryAction)} onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
