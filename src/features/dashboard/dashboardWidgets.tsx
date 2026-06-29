import type { MissionQueueTone } from "@/features/dashboard/dashboardActionQueue";

export type SortDirection = "asc" | "desc";

export function SortableTh({
  label,
  active,
  dir,
  onClick,
  width,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDirection;
  onClick: () => void;
  width?: number | string;
  className?: string;
}) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th className={className} style={width ? { width } : undefined}>
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: 0,
          background: "transparent",
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
          fontWeight: 800,
        }}
      >
        <span>{label}</span>
        <span
          aria-hidden
          style={{
            fontSize: 11,
            color: active ? "var(--primary, #2563eb)" : "var(--muted-foreground, #94a3b8)",
            minWidth: 10,
            textAlign: "center",
          }}
        >
          {arrow}
        </span>
      </button>
    </th>
  );
}

export type MissionQueueItem = {
  id: string;
  label: string;
  meta: string;
  value: string;
  tone: MissionQueueTone;
  onClick?: () => void;
};

export function MissionQueuePanel({
  title,
  subtitle,
  items,
  emptyText,
}: {
  title: string;
  subtitle: string;
  items: MissionQueueItem[];
  emptyText: string;
}) {
  return (
    <section className="missionQueuePanel" aria-label={title}>
      <div className="missionQueueHead">
        <div>
          <div className="missionQueueEyebrow">MISSION QUEUE</div>
          <div className="missionQueueTitle">{title}</div>
        </div>
        <div className="missionQueueSub">{subtitle}</div>
      </div>

      {items.length > 0 ? (
        <div className="missionQueueList">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`missionQueueRow missionQueueRow-${item.tone}`}
              onClick={item.onClick}
            >
              <span className="missionQueueRail" aria-hidden />
              <span className="missionQueueText">
                <strong>{item.label}</strong>
                <small>{item.meta}</small>
              </span>
              <span className="missionQueueValue">{item.value}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="missionQueueEmpty">{emptyText}</div>
      )}
    </section>
  );
}
