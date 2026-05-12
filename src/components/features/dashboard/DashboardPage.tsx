'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

import { useCategories } from '@/hooks/useCategories'
import { useChannels } from '@/hooks/useChannels'
import { UNCATEGORIZED_CATEGORY_ID } from '@/lib/config'
import {
  STATUS_FILTER_VALUES,
  type ContentStatusFilter,
} from '@/lib/content-utils'

import { ContentHeader } from './ContentHeader'
import { ContentList } from './ContentList'
import { InitialLoadingState } from './InitialLoadingState'
import { MobileSidebar } from './MobileSidebar'
import { QuotaExhaustedBanner } from './QuotaExhaustedBanner'
import { Sidebar } from './Sidebar'

export function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: categories = [], isLoading: isCategoriesLoading } = useCategories()

  // Fetch active channels to detect initial loading state (0 channels = first login)
  const { data: channels, isLoading: isChannelsLoading } = useChannels(true)
  const hasNoChannels = !isChannelsLoading && (channels ?? []).length === 0

  // Sort/filter state from URL search params
  const order = (searchParams.get('order') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
  const watchLaterOnly = searchParams.get('watchLaterOnly') === 'true'
  const includeCancelled = searchParams.get('includeCancelled') === 'true'
  const statusParam = searchParams.get('status')
  const status: ContentStatusFilter[] = useMemo(() => {
    if (!statusParam) return []
    const parsed = statusParam
      .split(',')
      .filter((v): v is ContentStatusFilter =>
        (STATUS_FILTER_VALUES as readonly string[]).includes(v),
      )
    // Stable order based on STATUS_FILTER_VALUES declaration order
    return STATUS_FILTER_VALUES.filter((v) => parsed.includes(v))
  }, [statusParam])

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

  const handleChangeStatus = useCallback(
    (next: ContentStatusFilter[]) => {
      if (next.length === 0) {
        updateSearchParams({ status: null })
        return
      }
      // Stable order + dedup
      const unique = STATUS_FILTER_VALUES.filter((v) => next.includes(v))
      updateSearchParams({ status: unique.join(',') })
    },
    [updateSearchParams],
  )

  const handleClearFilters = useCallback(() => {
    updateSearchParams({
      watchLaterOnly: null,
      includeCancelled: null,
      status: null,
    })
  }, [updateSearchParams])

  const categoryName = useMemo(() => {
    if (selectedCategoryId === UNCATEGORIZED_CATEGORY_ID) return '未分類'
    const found = categories.find((c) => c.id === selectedCategoryId)
    return found?.name ?? ''
  }, [selectedCategoryId, categories])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <QuotaExhaustedBanner />
      {hasNoChannels ? (
        <InitialLoadingState />
      ) : (
        <div className="flex min-h-0 flex-1">
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
              categoryId={selectedCategoryId}
              categoryName={categoryName}
              order={order}
              status={status}
              watchLaterOnly={watchLaterOnly}
              includeCancelled={includeCancelled}
              onToggleOrder={handleToggleOrder}
              onChangeStatus={handleChangeStatus}
              onToggleWatchLaterOnly={handleToggleWatchLaterOnly}
              onToggleIncludeCancelled={handleToggleIncludeCancelled}
              onClearFilters={handleClearFilters}
            />

            {/* Content list with infinite scroll */}
            <div className="flex-1 overflow-y-auto">
              <ContentList
                categoryId={selectedCategoryId}
                order={order}
                status={status}
                watchLaterOnly={watchLaterOnly}
                includeCancelled={includeCancelled}
              />
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
