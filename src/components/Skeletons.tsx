import { Skeleton } from "@/components/ui/skeleton";

export const StatGridSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-12" />
      </div>
    ))}
  </div>
);

export const StudentRowSkeleton = ({ count = 5 }: { count?: number }) => (
  <ul className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <li key={i} className="rounded-2xl border border-border bg-card p-3 shadow-card flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-8 w-20" />
      </li>
    ))}
  </ul>
);

export const TableRowsSkeleton = ({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) => (
  <>
    {Array.from({ length: rows }).map((_, i) => (
      <tr key={i} className="border-b border-border last:border-0">
        {Array.from({ length: cols }).map((_, j) => (
          <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-full max-w-[140px]" /></td>
        ))}
      </tr>
    ))}
  </>
);

export const FullPageSkeleton = () => (
  <div className="min-h-screen bg-background">
    <div className="mx-auto max-w-6xl px-4 py-5 space-y-4">
      <Skeleton className="h-8 w-40" />
      <StatGridSkeleton />
      <StudentRowSkeleton />
    </div>
  </div>
);