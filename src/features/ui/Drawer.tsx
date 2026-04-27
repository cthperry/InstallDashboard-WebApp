"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <SheetContent side="right" className="w-[min(520px,92vw)] p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-sm">{title}</SheetTitle>
        </SheetHeader>
        <div className="p-4 overflow-auto h-full">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
