import { Skeleton } from '@/components/ui/skeleton'

const SKELETON_GROUPS = [
  { count: 3, headerWidth: 'w-32' },
  { count: 2, headerWidth: 'w-24' },
]

export function ChannelSkeleton() {
  return (
    <div className="space-y-6">
      {SKELETON_GROUPS.map(({ count, headerWidth }, groupIdx) => (
        <div key={groupIdx}>
          <Skeleton className={`mb-2 h-5 ${headerWidth}`} />
          <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-9 w-[140px]" />
                <Skeleton className="h-9 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
