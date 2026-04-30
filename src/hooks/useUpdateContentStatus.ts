import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api-client'
import type { ContentResponse, PaginatedResponse } from '@/types/api'

type UpdateContentStatusParams = {
  contentId: string
  status: ContentResponse['status']
}

/**
 * コンテンツのステータスを手動変更する mutation。
 * 楽観的更新で UI を即時切り替え、失敗時はロールバック + トーストで通知する。
 */
export function useUpdateContentStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contentId, status }: UpdateContentStatusParams) => {
      return apiFetch<ContentResponse>(`/api/contents/${contentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
    },
    onMutate: async ({ contentId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['contents'] })

      const queriesSnapshot = queryClient.getQueriesData<
        InfiniteData<PaginatedResponse<ContentResponse>>
      >({ queryKey: ['contents'] })

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
                  status,
                  // contentAt は API でも更新しないため optimistic 側でも触らない
                  statusManuallySetAt: new Date().toISOString(),
                }
              }),
            })),
          }
        },
      )

      return { queriesSnapshot }
    },
    onError: (_error, _variables, context) => {
      if (context?.queriesSnapshot) {
        for (const [queryKey, data] of context.queriesSnapshot) {
          queryClient.setQueryData(queryKey, data)
        }
      }
      toast.error('ステータスの変更に失敗しました')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] })
    },
  })
}
