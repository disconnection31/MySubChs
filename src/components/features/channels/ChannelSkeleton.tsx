import { Skeleton } from '@/components/ui/skeleton'

export function ChannelSkeleton() {
  return (
    <div className="space-y-6">
      {/* Group 1 */}
      <div>
        <Skeleton className="mb-2 h-5 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-9 w-[140px]" />
              <Skeleton className="h-9 w-16" />
            </div>
          ))}
        </div>
      </div>
      {/* Group 2 */}
      <div>
        <Skeleton className="mb-2 h-5 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-9 w-[140px]" />
              <Skeleton className="h-9 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
