import { ApiError, type ApiErrorBody } from '@/types/api'

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const { headers, ...rest } = options ?? {}
  const response = await fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })

  // 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  const data: unknown = await response.json()

  if (!response.ok) {
    const body = data as ApiErrorBody
    throw new ApiError(response.status, body.error.code, body.error.message)
  }

  return data as T
}
