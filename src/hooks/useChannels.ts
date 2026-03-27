import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api-client'
import type { ChannelResponse } from '@/types/api'

type UseChannelsOptions = {
  refetchInterval?: number | false
}

export function useChannels(isActive: boolean, options?: UseChannelsOptions) {
  return useQuery<ChannelResponse[]>({
    queryKey: ['channels', { isActive }],
    queryFn: () => apiFetch<ChannelResponse[]>(`/api/channels?isActive=${isActive}`),
    refetchInterval: options?.refetchInterval,
  })
}

export function useUpdateChannel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      channelId,
      data,
    }: {
      channelId: string
      data: { categoryId?: string | null; isActive?: boolean }
    }) =>
      apiFetch<ChannelResponse>(`/api/channels/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onMutate: async ({ channelId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['channels'] })

      // Snapshot all channel queries
      const previousActive = queryClient.getQueryData<ChannelResponse[]>([
        'channels',
        { isActive: true },
      ])
      const previousInactive = queryClient.getQueryData<ChannelResponse[]>([
        'channels',
        { isActive: false },
      ])

      // Optimistically update the active channels list
      if (previousActive && data.categoryId !== undefined) {
        queryClient.setQueryData<ChannelResponse[]>(
          ['channels', { isActive: true }],
          previousActive.map((ch) =>
            ch.id === channelId ? { ...ch, categoryId: data.categoryId ?? null } : ch,
          ),
        )
      }

      return { previousActive, previousInactive }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousActive) {
        queryClient.setQueryData(['channels', { isActive: true }], context.previousActive)
      }
      if (context?.previousInactive) {
        queryClient.setQueryData(['channels', { isActive: false }], context.previousInactive)
      }
      toast.error('チャンネルの更新に失敗しました')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] })
    },
  })
}
