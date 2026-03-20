import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api-client'
import type { CategoryResponse, NotificationSettingResponse } from '@/types/api'

type UpdateSettingParams = {
  categoryId: string
  field: string
  value: boolean | number | null
  affectsQuota: boolean
}

export function useCategorySettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ categoryId, field, value }: UpdateSettingParams) =>
      apiFetch<NotificationSettingResponse>(
        `/api/categories/${categoryId}/settings`,
        {
          method: 'PATCH',
          body: JSON.stringify({ [field]: value }),
        },
      ),
    onMutate: async ({ categoryId, field, value }) => {
      await queryClient.cancelQueries({ queryKey: ['categories'] })

      const previous = queryClient.getQueryData<CategoryResponse[]>(['categories'])

      if (previous) {
        const updated = previous.map((cat) => {
          if (cat.id === categoryId && cat.settings) {
            return {
              ...cat,
              settings: {
                ...cat.settings,
                [field]: value,
              },
            }
          }
          return cat
        })
        queryClient.setQueryData(['categories'], updated)
      }

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['categories'], context.previous)
      }
      toast.error('設定の更新に失敗しました')
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      if (variables?.affectsQuota) {
        queryClient.invalidateQueries({ queryKey: ['settings'] })
      }
    },
  })
}
