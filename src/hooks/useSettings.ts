import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { apiFetch } from '@/lib/api-client'
import type { UserSettingsResponse } from '@/types/api'

export function useSettings() {
  return useQuery<UserSettingsResponse>({
    queryKey: ['settings'],
    queryFn: () => apiFetch<UserSettingsResponse>('/api/settings'),
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { pollingIntervalMinutes?: number; contentRetentionDays?: number }) =>
      apiFetch<{ pollingIntervalMinutes: number; contentRetentionDays: number }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['settings'] })
      const previous = queryClient.getQueryData<UserSettingsResponse>(['settings'])

      if (previous) {
        queryClient.setQueryData<UserSettingsResponse>(['settings'], {
          ...previous,
          ...data,
        })
      }

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['settings'], context.previous)
      }
      toast.error('設定の保存に失敗しました')
    },
    onSuccess: () => {
      toast.success('設定を保存しました')
      // Re-fetch to get updated estimatedDailyQuota from server
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

export type SyncChannelsResponse = {
  added: number
  restored: number
  deactivated: number
  updated: number
}

export function useSyncChannels() {
  return useMutation({
    mutationFn: () =>
      apiFetch<SyncChannelsResponse>('/api/settings/sync-channels', {
        method: 'POST',
      }),
    onError: () => {
      toast.error('チャンネルの同期に失敗しました')
    },
  })
}

export function useRegisterPushSubscription() {
  return useMutation({
    mutationFn: (data: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) =>
      apiFetch<{ id: string; endpoint: string }>('/api/notifications/subscriptions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  })
}

export function useSendTestNotification() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ sent: number; failed: number }>('/api/notifications/test', {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('テスト通知を送信しました。デバイスに通知が届いているか確認してください。')
    },
    onError: () => {
      toast.error('通知の送信に失敗しました')
    },
  })
}
