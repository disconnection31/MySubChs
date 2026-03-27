import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api-client'
import type { ContentResponse, PaginatedResponse, WatchLaterResponse } from '@/types/api'

type WatchLaterToggleParams = {
  contentId: string
  isCurrentlyWatchLater: boolean
}

export function useWatchLater() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contentId, isCurrentlyWatchLater }: WatchLaterToggleParams) => {
      if (isCurrentlyWatchLater) {
        await apiFetch<void>(`/api/watch-later/${contentId}`, { method: 'DELETE' })
      } else {
        await apiFetch<WatchLaterResponse>(`/api/watch-later/${contentId}`, { method: 'PUT' })
      }
    },
    onMutate: async ({ contentId, isCurrentlyWatchLater }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['contents'] })

      // Snapshot all contents queries
      const queriesSnapshot = queryClient.getQueriesData<
        InfiniteData<PaginatedResponse<ContentResponse>>
      >({ queryKey: ['contents'] })

      // Optimistically update all matching queries
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ContentResponse>>>(
        { queryKey: ['contents'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((content) => {
                if (content.id !== contentId) return content
                return {
                  ...content,
                  watchLater: isCurrentlyWatchLater
                    ? null
                    : {
                        addedVia: 'MANUAL' as const,
                        expiresAt: null,
                        addedAt: new Date().toISOString(),
                      },
                }
              }),
            })),
          }
        },
      )

      return { queriesSnapshot }
    },
    onError: (_error, _variables, context) => {
      // Rollback
      if (context?.queriesSnapshot) {
        for (const [queryKey, data] of context.queriesSnapshot) {
          queryClient.setQueryData(queryKey, data)
        }
      }
      toast.error('操作に失敗しました。もう一度お試しください。')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
    },
  })
}
