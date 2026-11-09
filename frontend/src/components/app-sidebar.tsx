"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Cpu, ListChecks, Radar } from "lucide-react";
import { fetchSignalMatrix } from "@/lib/api";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/stocks", label: "Stocks", icon: ListChecks },
  { href: "/", label: "Signals", icon: Radar },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    fetchSignalMatrix()
      .then((m) => setPendingCount(m.pending_count))
      .catch(() => setPendingCount(null));
  }, []);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--ds-border)] bg-[var(--ds-surface)]">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ds-text)] text-sm font-semibold text-[var(--ds-bg)]">
          N
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-[var(--ds-text)]">
            Neev Research
          </div>
          <div className="text-xs text-[var(--ds-muted)]">Signals</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                active
                  ? "bg-[var(--secondary)] font-medium text-[var(--ds-text)]"
                  : "text-[var(--ds-muted)] hover:bg-[var(--secondary)] hover:text-[var(--ds-text)]"
              )}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.href === "/" && pendingCount != null && pendingCount > 0 ? (
                <span className="rounded-sm bg-[color-mix(in_srgb,var(--ds-hold)_22%,transparent)] px-1.5 py-0.5 font-mono text-xs text-[var(--ds-hold)]">
                  {pendingCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 p-3">
        <div className="rounded-lg border border-[var(--ds-border)] p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ds-text)]">
            <Cpu size={13} strokeWidth={1.75} /> House strategy
          </div>
          <div className="mt-1 text-sm font-medium text-[var(--ds-text)]">
            NEEV Renko ST
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-[var(--ds-muted)]">
            Supertrend · 1h, 4h, 1d
          </div>
        </div>
      </div>
    </aside>
  );
}
