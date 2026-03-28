'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'
import { UNCATEGORIZED_CATEGORY_ID } from '@/lib/config'
import { ApiError, type PollStatusResponse, type PollTriggerResponse } from '@/types/api'

export type ManualPollingState = 'idle' | 'polling' | 'cooldown' | 'quotaExhausted'

const STATUS_POLL_INTERVAL_MS = 3_000
const STATUS_POLL_MAX_COUNT = 100

export function useManualPolling(categoryId: string | null) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<ManualPollingState>('idle')
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const pollCountRef = useRef(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isValidCategory = categoryId !== null && categoryId !== UNCATEGORIZED_CATEGORY_ID

  // Status polling query — enabled only when in 'polling' state
  const statusQuery = useQuery<PollStatusResponse>({
    queryKey: ['poll-status', categoryId],
    queryFn: () => apiFetch<PollStatusResponse>(`/api/categories/${categoryId}/poll/status`),
    enabled: isValidCategory && state === 'polling',
    refetchInterval: STATUS_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })

  // Start cooldown countdown timer
  const startCooldownTimer = useCallback((seconds: number) => {
    // Clear existing timer
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current)
    }

    setCooldownRemaining(seconds)
    setState('cooldown')

    cooldownTimerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current)
            cooldownTimerRef.current = null
          }
          setState('idle')
          return 0
        }
        return prev - 1
      })
    }, 1_000)
  }, [])

  // Handle status polling result
  useEffect(() => {
    if (state !== 'polling' || !statusQuery.data) return

    pollCountRef.current += 1
    const { status, cooldownRemaining: remaining } = statusQuery.data

    if (status === 'completed' || status === 'failed' || status === 'none') {
      // Job finished — refetch contents
      queryClient.invalidateQueries({ queryKey: ['contents'] })

      if (remaining > 0) {
        startCooldownTimer(remaining)
      } else {
        setState('idle')
      }
      pollCountRef.current = 0
      return
    }

    // Timeout after max poll count
    if (pollCountRef.current >= STATUS_POLL_MAX_COUNT) {
      if (remaining > 0) {
        startCooldownTimer(remaining)
      } else {
        setState('idle')
      }
      pollCountRef.current = 0
    }
  }, [state, statusQuery.data, queryClient, startCooldownTimer])

  // Trigger mutation
  const triggerMutation = useMutation<PollTriggerResponse, ApiError>({
    mutationFn: () =>
      apiFetch<PollTriggerResponse>(`/api/categories/${categoryId}/poll`, {
        method: 'POST',
      }),
    onSuccess: () => {
      setState('polling')
      pollCountRef.current = 0
    },
    onError: (error) => {
      if (error.status === 429 && error.retryAfter) {
        // Cooldown error
        startCooldownTimer(error.retryAfter)
      } else if (error.status === 503) {
        // Quota exhausted
        setState('quotaExhausted')
      }
    },
  })

  const trigger = useCallback(() => {
    if (!isValidCategory || state !== 'idle') return
    triggerMutation.mutate()
  }, [isValidCategory, state, triggerMutation])

  // Check initial cooldown state on mount / category change
  useEffect(() => {
    if (!isValidCategory) {
      setState('idle')
      setCooldownRemaining(0)
      return
    }

    // Fetch initial status to check for existing cooldown
    apiFetch<PollStatusResponse>(`/api/categories/${categoryId}/poll/status`)
      .then((data) => {
        if (data.status === 'active' || data.status === 'waiting') {
          setState('polling')
          pollCountRef.current = 0
        } else if (data.cooldownRemaining > 0) {
          startCooldownTimer(data.cooldownRemaining)
        }
      })
      .catch(() => {
        // Ignore errors on initial check
      })
  }, [categoryId, isValidCategory, startCooldownTimer])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
      }
    }
  }, [])

  return {
    state,
    cooldownRemaining,
    trigger,
    isLoading: triggerMutation.isPending,
  }
}
