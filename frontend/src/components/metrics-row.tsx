import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SignalResult } from "@/lib/schemas";

type MetricsRowProps = {
  results: SignalResult[];
};

export function MetricsRow({ results }: MetricsRowProps) {
  const buys = results.filter((s) => s.signal === "BUY").length;
  const sells = results.filter((s) => s.signal === "SELL").length;
  const bulls = results.filter((s) => s.trend === "BULL").length;
  const bears = results.filter((s) => s.trend === "BEAR").length;

  const items = [
    { label: "BUY flips", value: buys },
    { label: "SELL flips", value: sells },
    { label: "BULL trend", value: bulls },
    { label: "BEAR trend", value: bears },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <Card
          key={item.label}
          className="border-[var(--ds-border)] bg-[var(--ds-surface)] py-3"
        >
          <CardHeader className="px-4 py-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-[var(--ds-muted)]">
              {item.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-1 pb-0">
            <div className="text-2xl font-semibold tabular-nums text-[var(--ds-text)]">
              {item.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
