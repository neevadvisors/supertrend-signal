import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[72px] w-full rounded-lg" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-[300px] w-full rounded-xl md:h-[460px]" />
    </div>
  );
}

export function InstrumentsSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
