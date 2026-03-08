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
      className="justify-start"
    >
      <ToggleGroupItem value="__all__">全部</ToggleGroupItem>
      <ToggleGroupItem value="north">{REGIONS.north.label}</ToggleGroupItem>
      <ToggleGroupItem value="central">{REGIONS.central.label}</ToggleGroupItem>
      <ToggleGroupItem value="south">{REGIONS.south.label}</ToggleGroupItem>
    </ToggleGroup>
  );
}
