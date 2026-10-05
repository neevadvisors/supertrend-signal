import { useEffect, useRef, useState } from "react";
import { CheckIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { searchInstruments } from "@/lib/api";
import type { Instrument } from "@/lib/schemas";

type StockSearchProps = {
  selected: Instrument[];
  onChange: (next: Instrument[]) => void;
  disabled?: boolean;
};

const SEARCH_LIMIT = 50;
const DEBOUNCE_MS = 200;

export function StockSearch({
  selected,
  onChange,
  disabled,
}: StockSearchProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const trimmed = query.trim();
  const popoverOpen = listOpen && trimmed.length > 0;

  useEffect(() => {
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
  }, [trimmed]);

  function toggle(inst: Instrument) {
    const exists = selected.some((s) => s.security_id === inst.security_id);
    if (exists) {
      onChange(selected.filter((s) => s.security_id !== inst.security_id));
    } else {
      onChange([...selected, inst]);
    }
    setQuery("");
    setListOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  const selectedIds = new Set(selected.map((s) => s.security_id));

  let emptyMessage = "Type to search NSE equities…";
  if (searchError) emptyMessage = searchError;
  else if (searching) emptyMessage = "Searching…";
  else if (trimmed) emptyMessage = "No stocks found.";

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-[var(--ds-text)]">
        Search stocks
      </label>
      <Popover
        open={popoverOpen}
        modal={false}
        onOpenChange={(next) => {
          if (!trimmed && next) return;
          setListOpen(next);
        }}
      >
        <div ref={anchorRef} className="w-full">
          <InputGroup className="h-10">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              disabled={disabled}
              placeholder="e.g. RELIANCE, HDFCBANK, TCS"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setListOpen(true);
              }}
              onFocus={() => {
                if (trimmed) setListOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setListOpen(false);
                }
              }}
            />
          </InputGroup>
        </div>
        <PopoverContent
          anchor={anchorRef}
          initialFocus={false}
          className="w-[var(--anchor-width)] min-w-[min(100vw-2rem,32rem)] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
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
    </div>
  );
}
