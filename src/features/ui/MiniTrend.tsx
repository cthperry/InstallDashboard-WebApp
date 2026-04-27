export function MiniTrend({ values, color }: { values: number[]; color: string }) {
  const w = 72;
  const h = 20;
  const pad = 2;
  const max = 100;
  const min = 0;

  if (!values || values.length === 0) {
    return <div style={{ width: w, height: h, opacity: 0.5 }}>—</div>;
  }

  const step = (w - pad * 2) / Math.max(values.length - 1, 1);
  const pts = values
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (h - pad * 2) * (1 - (v - min) / (max - min));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="trend">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
