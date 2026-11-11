import { Skeleton } from "@/components/ui/skeleton";

export function PostsSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-8 pt-7 pb-5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        <div className="mt-5 flex gap-8">
          <Skeleton className="h-12 w-20" />
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-12 w-20" />
        </div>
      </div>
      <div
        className="grid gap-6 px-8 py-6"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
