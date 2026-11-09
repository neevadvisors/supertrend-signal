import { Skeleton } from "@/components/ui/skeleton";

export function StocksHeaderLastRunSkeleton() {
  return (
    <div className="mt-1">
      <Skeleton className="h-4 w-36" />
    </div>
  );
}

export function StocksLtpCellSkeleton() {
  return (
    <div className="flex flex-col items-end gap-1">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-3 w-10" />
    </div>
  );
}

export function StocksSignalsCellSkeleton() {
  return (
    <div className="flex gap-1">
      <Skeleton className="h-6 w-9 rounded-sm" />
      <Skeleton className="h-6 w-9 rounded-sm" />
      <Skeleton className="h-6 w-9 rounded-sm" />
    </div>
  );
}

export function StocksLastRunCellSkeleton() {
  return <Skeleton className="h-4 w-24" />;
}
