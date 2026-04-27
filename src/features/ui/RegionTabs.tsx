"use client";

import type { RegionKey } from "@/domain/types";
import { REGIONS } from "@/domain/constants";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function RegionTabs({
  value,
  onChange,
}: {
  value: "" | RegionKey;
  onChange: (v: "" | RegionKey) => void;
}) {
  const current = value || "__all__";

  return (
    <ToggleGroup
      type="single"
      value={current}
      onValueChange={(v) => {
        if (!v) return;
        onChange(v === "__all__" ? "" : (v as RegionKey));
      }}
      variant="outline"
      size="sm"
      className="justify-start rounded-xl border border-border/80 bg-secondary/40 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
    >
      <ToggleGroupItem value="__all__" className="rounded-lg text-xs font-semibold data-[state=on]:border data-[state=on]:border-primary/35 data-[state=on]:bg-primary/15 data-[state=on]:text-foreground data-[state=on]:shadow-sm">
        全部
      </ToggleGroupItem>
      <ToggleGroupItem value="north" className="rounded-lg text-xs font-semibold data-[state=on]:border data-[state=on]:border-primary/35 data-[state=on]:bg-primary/15 data-[state=on]:text-foreground data-[state=on]:shadow-sm">
        {REGIONS.north.label}
      </ToggleGroupItem>
      <ToggleGroupItem value="central" className="rounded-lg text-xs font-semibold data-[state=on]:border data-[state=on]:border-primary/35 data-[state=on]:bg-primary/15 data-[state=on]:text-foreground data-[state=on]:shadow-sm">
        {REGIONS.central.label}
      </ToggleGroupItem>
      <ToggleGroupItem value="south" className="rounded-lg text-xs font-semibold data-[state=on]:border data-[state=on]:border-primary/35 data-[state=on]:bg-primary/15 data-[state=on]:text-foreground data-[state=on]:shadow-sm">
        {REGIONS.south.label}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
