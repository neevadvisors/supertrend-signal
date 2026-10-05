import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SignalResult } from "@/lib/schemas";

function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type ResultsTableProps = {
  results: SignalResult[];
};

export function ResultsTable({ results }: ResultsTableProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)]">
      <Button
        type="button"
        variant="ghost"
        className="flex h-auto w-full items-center justify-start gap-2 rounded-xl px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDownIcon className="size-4" />
        ) : (
          <ChevronRightIcon className="size-4" />
        )}
        <span className="font-medium">Table view</span>
        <span className="text-xs text-[var(--ds-muted)]">
          ({results.length} rows)
        </span>
      </Button>

      {open ? (
        <div className="overflow-x-auto border-t border-[var(--ds-border)] px-2 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>Close</TableHead>
                <TableHead>ST</TableHead>
                <TableHead>Bars since flip</TableHead>
                <TableHead className="hidden md:table-cell">Regime</TableHead>
                <TableHead className="hidden md:table-cell">Bar time</TableHead>
                <TableHead className="hidden md:table-cell">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => (
                <TableRow key={`${row.symbol}-${row.bar_time ?? ""}`}>
                  <TableCell className="font-medium">{row.symbol}</TableCell>
                  <TableCell>{row.signal}</TableCell>
                  <TableCell>{row.trend ?? "—"}</TableCell>
                  <TableCell>{fmtNum(row.close)}</TableCell>
                  <TableCell>{fmtNum(row.st_level)}</TableCell>
                  <TableCell>
                    {row.bars_since_flip != null
                      ? String(row.bars_since_flip)
                      : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.regime ?? "—"}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap md:table-cell">
                    {row.bar_time ?? "—"}
                  </TableCell>
                  <TableCell className="hidden max-w-[220px] truncate text-[var(--ds-sell)] md:table-cell">
                    {row.error || ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
