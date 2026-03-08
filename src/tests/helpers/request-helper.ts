import { NextRequest } from 'next/server'

type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  searchParams?: Record<string, string>
}

export function buildRequest(
  url: string,
  options: RequestOptions = {}
): NextRequest {
  const { method = 'GET', body, headers = {}, searchParams } = options

  const requestUrl = new URL(url, 'http://localhost:3000')
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      requestUrl.searchParams.set(key, value)
    })
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  const requestBody = body !== undefined ? JSON.stringify(body) : undefined

  return new NextRequest(requestUrl, {
    method,
    headers: requestHeaders,
    body: requestBody,
  })
}
