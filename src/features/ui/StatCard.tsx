import { Card, CardContent } from "@/components/ui/card";

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
    <Card className="statCard relative overflow-hidden border-border/85 bg-card/96 py-0">
      <div aria-hidden className="statCardAccent" style={{ background: `linear-gradient(135deg, ${color}55, ${color}18)` }} />
      <CardContent className="statCardInner">
        <div className="statCardTop">
          <div className="statCardLabel">{label}</div>
          <div className="statCardIcon" style={{ color, borderColor: `${color}44`, background: `${color}16` }}>
            {icon}
          </div>
        </div>
        <div className="statCardValue mono">{value}</div>
        {sub ? <div className="statCardSub">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
