import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'
import type { UserSettingsResponse } from '@/types/api'

export function useSettings() {
  return useQuery<UserSettingsResponse>({
    queryKey: ['settings'],
    queryFn: () => apiFetch<UserSettingsResponse>('/api/settings'),
  })
}
