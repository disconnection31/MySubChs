import { useInfiniteQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'
import { DEFAULT_CONTENTS_LIMIT } from '@/lib/config'
import type { ContentResponse, PaginatedResponse } from '@/types/api'

type UseContentsOptions = {
  categoryId: string | null
  order?: 'asc' | 'desc'
  watchLaterOnly?: boolean
  includeCancelled?: boolean
}

export function useContents({
  categoryId,
  order = 'desc',
  watchLaterOnly = false,
  includeCancelled = false,
}: UseContentsOptions) {
  return useInfiniteQuery<PaginatedResponse<ContentResponse>>({
    queryKey: ['contents', { categoryId, order, watchLaterOnly, includeCancelled }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (categoryId) params.set('categoryId', categoryId)
      params.set('order', order)
      params.set('limit', String(DEFAULT_CONTENTS_LIMIT))
      if (watchLaterOnly) params.set('watchLaterOnly', 'true')
      if (includeCancelled) params.set('includeCancelled', 'true')
      if (pageParam) params.set('cursor', pageParam as string)

      return apiFetch<PaginatedResponse<ContentResponse>>(
        `/api/contents?${params.toString()}`,
      )
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNext ? (lastPage.meta.nextCursor ?? undefined) : undefined,
    enabled: !!categoryId,
  })
}
