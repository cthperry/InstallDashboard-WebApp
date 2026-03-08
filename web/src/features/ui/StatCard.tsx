export function StatCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "16px 18px",
        position: "relative",
        overflow: "hidden",
        borderTop: `3px solid ${color}`,
      }}
    >
      {/* Subtle tinted circle */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: `${color}12`,
          pointerEvents: "none",
        }}
      />

      <div style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        gap: 5
      }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>

      <div style={{
        fontSize: 32,
        fontWeight: 900,
        lineHeight: 1.1,
        color: "#0f172a",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        letterSpacing: "-0.02em",
      }}>
        {value}
      </div>

      {sub ? (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 5 }}>{sub}</div>
      ) : null}
    </div>
  );
}
