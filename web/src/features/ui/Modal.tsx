"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function Modal({
  open,
  onClose,
  title,
  children,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent
        className="max-h-[92vh] overflow-auto"
        style={{ maxWidth: width ? `min(${width}px, 95vw)` : "min(680px, 95vw)" }}
      >
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
