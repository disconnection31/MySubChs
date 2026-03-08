'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { QueryClient, QueryCache, MutationCache, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'

import { isUnauthorized } from '@/types/api'

function makeQueryClient(router: ReturnType<typeof useRouter>) {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isUnauthorized(error)) {
          toast('セッションが切れました。再ログインしてください。')
          router.replace('/login')
          return
        }
        // その他のエラーは各クエリの onError で処理
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isUnauthorized(error)) {
          toast('セッションが切れました。再ログインしてください。')
          router.replace('/login')
        }
        // その他のエラーは各 useMutation の onError で処理
      },
    }),
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [queryClient] = useState(() => makeQueryClient(router))

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
