import { describe, expect, it } from 'vitest'

import { ErrorCode, cooldownErrorResponse, errorResponse, validationErrorResponse } from '@/lib/errors'

describe('errors', () => {
  describe('ErrorCode', () => {
    it('UNAUTHORIZED が定義されている', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED')
    })

    it('VALIDATION_ERROR が定義されている', () => {
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
    })

    it('INTERNAL_SERVER_ERROR が定義されている', () => {
      expect(ErrorCode.INTERNAL_SERVER_ERROR).toBe('INTERNAL_SERVER_ERROR')
    })

    it('POLLING_COOLDOWN が定義されている', () => {
      expect(ErrorCode.POLLING_COOLDOWN).toBe('POLLING_COOLDOWN')
    })

    it('QUOTA_EXHAUSTED が定義されている', () => {
      expect(ErrorCode.QUOTA_EXHAUSTED).toBe('QUOTA_EXHAUSTED')
    })
  })

  describe('errorResponse()', () => {
    it('{ error: { code, message } } の形式で返す', async () => {
      const res = errorResponse('UNAUTHORIZED', '認証が必要です', 401)
      const body = await res.json()

      expect(body).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: '認証が必要です',
        },
      })
    })

    it('HTTP ステータスコードが正しく設定される', () => {
      const res401 = errorResponse('UNAUTHORIZED', '認証が必要です', 401)
      expect(res401.status).toBe(401)

      const res404 = errorResponse('CATEGORY_NOT_FOUND', 'カテゴリが見つかりません', 404)
      expect(res404.status).toBe(404)

      const res500 = errorResponse('INTERNAL_SERVER_ERROR', 'サーバーエラー', 500)
      expect(res500.status).toBe(500)
    })

    it('details フィールドを含まない', async () => {
      const res = errorResponse('CATEGORY_NOT_FOUND', 'カテゴリが見つかりません', 404)
      const body = await res.json()

      expect(body.error.details).toBeUndefined()
    })
  })

  describe('validationErrorResponse()', () => {
    it('{ error: { code, message, details } } の形式で返す', async () => {
      const details = [{ field: 'name', message: 'カテゴリ名は50文字以内で入力してください' }]
      const res = validationErrorResponse(details)
      const body = await res.json()

      expect(body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: '入力値が不正です',
          details,
        },
      })
    })

    it('details フィールドが含まれる', async () => {
      const details = [
        { field: 'name', message: 'nameは必須です' },
        { field: 'email', message: 'emailの形式が不正です' },
      ]
      const res = validationErrorResponse(details)
      const body = await res.json()

      expect(body.error.details).toHaveLength(2)
      expect(body.error.details).toEqual(details)
    })

    it('HTTP ステータスコードが 400 である', () => {
      const res = validationErrorResponse([{ field: 'name', message: '必須です' }])
      expect(res.status).toBe(400)
    })

    it('カスタムメッセージを指定できる', async () => {
      const res = validationErrorResponse([], 'カスタムエラーメッセージ')
      const body = await res.json()

      expect(body.error.message).toBe('カスタムエラーメッセージ')
    })
  })

  describe('cooldownErrorResponse()', () => {
    it('{ error: { code, message, retryAfter } } の形式で返す', async () => {
      const res = cooldownErrorResponse(180)
      const body = await res.json()

      expect(body).toEqual({
        error: {
          code: 'POLLING_COOLDOWN',
          message: '手動ポーリングは5分間隔でのみ実行できます',
          retryAfter: 180,
        },
      })
    })

    it('retryAfter フィールドが含まれる', async () => {
      const res = cooldownErrorResponse(120)
      const body = await res.json()

      expect(body.error.retryAfter).toBe(120)
    })

    it('HTTP ステータスコードが 429 である', () => {
      const res = cooldownErrorResponse(300)
      expect(res.status).toBe(429)
    })

    it('カスタムメッセージを指定できる', async () => {
      const res = cooldownErrorResponse(60, 'カスタムクールダウンメッセージ')
      const body = await res.json()

      expect(body.error.message).toBe('カスタムクールダウンメッセージ')
    })
  })
})
