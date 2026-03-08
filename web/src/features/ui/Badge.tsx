import { Badge as ShadBadge } from "@/components/ui/badge";

export function Badge({
  text,
  color,
  subtle = false,
}: {
  text: string;
  color: string;
  subtle?: boolean;
}) {
  // 使用 inline style 保留既有 color 參數（不改原本呼叫端邏輯）
  return (
    <ShadBadge
      style={{
        borderColor: `${color}55`,
        background: subtle ? `${color}18` : `${color}26`,
        color,
      }}
      className="font-semibold"
    >
      {text}
    </ShadBadge>
  );
}
