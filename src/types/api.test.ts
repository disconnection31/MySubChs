import { describe, it, expect } from 'vitest'

import { ApiError, isApiError, isUnauthorized } from './api'

describe('ApiError', () => {
  it('should create an ApiError with the correct properties', () => {
    const error = new ApiError(401, 'UNAUTHORIZED', '認証が必要です')
    expect(error.status).toBe(401)
    expect(error.code).toBe('UNAUTHORIZED')
    expect(error.message).toBe('認証が必要です')
    expect(error.name).toBe('ApiError')
  })

  it('should be an instance of Error', () => {
    const error = new ApiError(404, 'NOT_FOUND', 'リソースが見つかりません')
    expect(error).toBeInstanceOf(Error)
  })
})

describe('isApiError', () => {
  it('should return true for ApiError instances', () => {
    const error = new ApiError(500, 'INTERNAL_ERROR', 'サーバーエラー')
    expect(isApiError(error)).toBe(true)
  })

  it('should return false for standard Error instances', () => {
    const error = new Error('standard error')
    expect(isApiError(error)).toBe(false)
  })

  it('should return false for non-error values', () => {
    expect(isApiError(null)).toBe(false)
    expect(isApiError(undefined)).toBe(false)
    expect(isApiError('string')).toBe(false)
    expect(isApiError(42)).toBe(false)
    expect(isApiError({})).toBe(false)
  })
})

describe('isUnauthorized', () => {
  it('should return true for 401 ApiError', () => {
    const error = new ApiError(401, 'UNAUTHORIZED', '認証が必要です')
    expect(isUnauthorized(error)).toBe(true)
  })

  it('should return false for non-401 ApiError', () => {
    const error = new ApiError(404, 'NOT_FOUND', 'リソースが見つかりません')
    expect(isUnauthorized(error)).toBe(false)
  })

  it('should return false for standard Error instances', () => {
    const error = new Error('standard error')
    expect(isUnauthorized(error)).toBe(false)
  })

  it('should return false for non-error values', () => {
    expect(isUnauthorized(null)).toBe(false)
    expect(isUnauthorized(undefined)).toBe(false)
  })
})
