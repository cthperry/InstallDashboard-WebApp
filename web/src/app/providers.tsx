"use client";

import * as React from "react";

import { AuthProvider } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({
  children,
  appVersion,
}: {
  children: React.ReactNode;
  appVersion: string;
}) {
  return (
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <Toaster />
        <AuthProvider appVersion={appVersion}>{children}</AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
