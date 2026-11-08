"use client";

import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--ds-bg)] text-[var(--ds-text)]">
      <AppSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
