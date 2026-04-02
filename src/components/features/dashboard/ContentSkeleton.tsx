import { Skeleton } from '@/components/ui/skeleton'

export function ContentSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 border-b px-4 py-3">
          {/* サムネイルスケルトン: PC のみ表示 */}
          <Skeleton className="hidden md:block w-[120px] h-[67px] shrink-0 rounded" />

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-5 w-5 rounded-full shrink-0" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
