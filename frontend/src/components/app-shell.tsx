"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { JobStatusProvider } from "@/components/job-status-provider";
import { Toaster } from "sonner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--ds-bg)] text-[var(--ds-text)]">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <JobStatusProvider>
          {children}
          <Toaster theme="dark" richColors position="bottom-right" />
        </JobStatusProvider>
      </div>
    </div>
  );
}
