'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

import { useCategories } from '@/hooks/useCategories'
import { UNCATEGORIZED_CATEGORY_ID } from '@/lib/config'

import { ContentHeader } from './ContentHeader'
import { ContentList } from './ContentList'
import { MobileSidebar } from './MobileSidebar'
import { Sidebar } from './Sidebar'

export function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: categories = [], isLoading: isCategoriesLoading } = useCategories()

  // Sort/filter state from URL search params
  const order = (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
  const watchLaterOnly = searchParams.get('watchLaterOnly') === 'true'
  const includeCancelled = searchParams.get('includeCancelled') === 'true'

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  )

  // Selected category (state-only, not in URL)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  // Set initial selected category once categories are loaded
  useEffect(() => {
    if (selectedCategoryId !== null) return
    if (isCategoriesLoading) return

    if (sortedCategories.length > 0) {
      setSelectedCategoryId(sortedCategories[0].id)
    } else {
      setSelectedCategoryId(UNCATEGORIZED_CATEGORY_ID)
    }
  }, [sortedCategories, isCategoriesLoading, selectedCategoryId])

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      const qs = params.toString()
      router.replace(qs ? `/?${qs}` : '/', { scroll: false })
    },
    [searchParams, router],
  )

  const handleToggleOrder = useCallback(() => {
    updateSearchParams({ order: order === 'desc' ? 'asc' : 'desc' })
  }, [order, updateSearchParams])

  const handleToggleWatchLaterOnly = useCallback(() => {
    updateSearchParams({ watchLaterOnly: watchLaterOnly ? null : 'true' })
  }, [watchLaterOnly, updateSearchParams])

  const handleToggleIncludeCancelled = useCallback(() => {
    updateSearchParams({ includeCancelled: includeCancelled ? null : 'true' })
  }, [includeCancelled, updateSearchParams])

  const categoryName = useMemo(() => {
    if (selectedCategoryId === UNCATEGORIZED_CATEGORY_ID) return '未分類'
    const found = categories.find((c) => c.id === selectedCategoryId)
    return found?.name ?? ''
  }, [selectedCategoryId, categories])

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* PC sidebar */}
      <Sidebar
        categories={sortedCategories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={setSelectedCategoryId}
      />

      {/* Main area */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header with hamburger */}
        <div className="flex items-center gap-2 border-b px-2 py-2 md:hidden">
          <MobileSidebar
            categories={sortedCategories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
          />
          <span className="truncate text-sm font-medium">{categoryName}</span>
        </div>

        {/* Content header (PC: full, mobile: sort/filter only) */}
        <ContentHeader
          categoryName={categoryName}
          order={order}
          watchLaterOnly={watchLaterOnly}
          includeCancelled={includeCancelled}
          onToggleOrder={handleToggleOrder}
          onToggleWatchLaterOnly={handleToggleWatchLaterOnly}
          onToggleIncludeCancelled={handleToggleIncludeCancelled}
        />

        {/* Content list with infinite scroll */}
        <div className="flex-1 overflow-y-auto">
          <ContentList
            categoryId={selectedCategoryId}
            order={order}
            watchLaterOnly={watchLaterOnly}
            includeCancelled={includeCancelled}
          />
        </div>
      </main>
    </div>
  )
}
