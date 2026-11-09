"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/app/components/ui/toast";
import { useApplyStoredTheme } from "@/app/components/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  useApplyStoredTheme();
  return (
    <SessionProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
