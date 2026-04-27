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
        borderColor: `${color}45`,
        background: subtle ? `${color}14` : `${color}22`,
        color,
      }}
      // 統一標籤尺寸：表格/看板視覺更乾淨（避免標籤撐高列高）
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-4 backdrop-blur-[1px] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
    >
      {text}
    </ShadBadge>
  );
}
