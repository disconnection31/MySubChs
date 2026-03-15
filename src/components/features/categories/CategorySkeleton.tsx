'use client'

import { Skeleton } from '@/components/ui/skeleton'

export function CategorySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border bg-card p-4"
        >
          <Skeleton className="hidden md:block h-5 w-5" />
          <Skeleton className="h-5 flex-1 max-w-[200px]" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      ))}
    </div>
  )
}
