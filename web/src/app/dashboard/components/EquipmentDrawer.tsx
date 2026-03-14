"use client";

import { CAPACITY_COLOR, REGIONS } from "@/domain/constants";
import type { Equipment, RegionKey } from "@/domain/types";
import { Drawer } from "@/features/ui/Drawer";
import { MiniTrend } from "@/features/ui/MiniTrend";
import { C } from "../utils";

export type EquipmentDrawerProps = {
  C: typeof C;
  open: boolean;
  onClose: () => void;
  equipment: Equipment | null;
  onEdit: (eq: Equipment) => void;
};

export function EquipmentDrawer({
  C: colors,
  open,
  onClose,
  equipment,
  onEdit,
}: EquipmentDrawerProps) {
  if (!open || !equipment) return null;

  return (
    <Drawer title={equipment.equipmentId || equipment.id} open={open} onClose={onClose}>
      <div style={{ fontSize: 13, color: colors.text1 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>客戶</div>
          <div style={{ fontWeight: 600 }}>{equipment.customer}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>地區</div>
          <div>{REGIONS[equipment.region as RegionKey]?.label || equipment.region}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>狀態</div>
          <div>
            {equipment.statusMain}
            {equipment.statusSub && ` - ${equipment.statusSub}`}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>產能等級</div>
          <div
            style={{
              display: "inline-block",
              padding: "4px 10px",
              borderRadius: 3,
              background: CAPACITY_COLOR[equipment.capacity?.level || "綠"],
              color: "#000",
              fontWeight: 600,
            }}
          >
            {equipment.capacity?.level || "綠"}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: colors.text3, marginBottom: 4 }}>使用率</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: colors.accent }}>
            {equipment.capacity?.utilization || 0}%
          </div>
        </div>
        {equipment.capacity?.trend7d && equipment.capacity.trend7d.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: colors.text3, marginBottom: 8 }}>7日趨勢</div>
            <MiniTrend values={equipment.capacity.trend7d} color={colors.accent} />
          </div>
        )}
        <button
          onClick={() => {
            onEdit(equipment);
            onClose();
          }}
          style={{
            background: colors.accent,
            border: "none",
            color: "#0d1200",
            padding: "6px 12px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            width: "100%",
          }}
        >
          編輯
        </button>
      </div>
    </Drawer>
  );
}
