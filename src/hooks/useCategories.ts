import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'
import type { CategoryResponse } from '@/types/api'

export function useCategories() {
  return useQuery<CategoryResponse[]>({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryResponse[]>('/api/categories'),
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<CategoryResponse>('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch<CategoryResponse>(`/api/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/categories/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

export function useReorderCategories() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      apiFetch<CategoryResponse[]>('/api/categories/reorder', {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      }),
    onMutate: async (orderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['categories'] })

      const previous = queryClient.getQueryData<CategoryResponse[]>(['categories'])

      if (previous) {
        const reordered = orderedIds
          .map((id, index) => {
            const cat = previous.find((c) => c.id === id)
            return cat ? { ...cat, sortOrder: index } : undefined
          })
          .filter((c): c is CategoryResponse => c !== undefined)

        queryClient.setQueryData(['categories'], reordered)
      }

      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['categories'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
