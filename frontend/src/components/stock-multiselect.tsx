import { useEffect, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { searchInstruments } from "@/lib/api";
import type { Instrument } from "@/lib/schemas";

type StockMultiselectProps = {
  selected: Instrument[];
  onChange: (next: Instrument[]) => void;
  disabled?: boolean;
};

const SEARCH_LIMIT = 50;
const DEBOUNCE_MS = 200;

export function StockMultiselect({
  selected,
  onChange,
  disabled,
}: StockMultiselectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void searchInstruments(trimmed, { limit: SEARCH_LIMIT })
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
        })
        .catch((err) => {
          if (cancelled) return;
          setResults([]);
          setSearchError(
            err instanceof Error ? err.message : "Search failed"
          );
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  function toggle(inst: Instrument) {
    const exists = selected.some((s) => s.security_id === inst.security_id);
    if (exists) {
      onChange(selected.filter((s) => s.security_id !== inst.security_id));
    } else {
      onChange([...selected, inst]);
    }
  }

  function remove(securityId: string) {
    onChange(selected.filter((s) => s.security_id !== securityId));
  }

  const selectedIds = new Set(selected.map((s) => s.security_id));

  let emptyMessage = "Type to search NSE equities…";
  if (searchError) emptyMessage = searchError;
  else if (searching) emptyMessage = "Searching…";
  else if (query.trim()) emptyMessage = "No stocks found.";

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--ds-text)]">
        Search and select stocks
      </label>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            setResults([]);
            setSearchError(null);
          }
        }}
      >
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            "flex h-auto min-h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
          )}
        >
          <span className="truncate text-left text-[var(--ds-muted)]">
            {selected.length === 0
              ? "e.g. RELIANCE, HDFCBANK, TCS"
              : `${selected.length} selected`}
          </span>
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,32rem)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type to search NSE equities…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {results.map((inst) => {
                  const checked = selectedIds.has(inst.security_id);
                  return (
                    <CommandItem
                      key={inst.security_id}
                      value={inst.label}
                      data-checked={checked || undefined}
                      onSelect={() => toggle(inst)}
                    >
                      <CheckIcon
                        className={cn(
                          "size-4",
                          checked ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{inst.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((inst) => (
            <Badge
              key={inst.security_id}
              variant="secondary"
              className="max-w-full gap-1 pr-1"
            >
              <span className="truncate">{inst.label}</span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted"
                aria-label={`Remove ${inst.label}`}
                onClick={() => remove(inst.security_id)}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
