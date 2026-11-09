import { Skeleton } from "@/components/ui/skeleton";

export function SignalsReviewSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--ds-border)] px-8 py-6">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 space-y-4 px-8 py-5">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-40" />
          </div>
          <Skeleton className="h-[400px] w-full rounded-lg" />
        </div>
        <div className="w-[400px] shrink-0 border-l border-[var(--ds-border)] p-6">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-4 h-32 w-full" />
          <Skeleton className="mt-4 h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
