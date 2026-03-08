import { NextResponse } from 'next/server'

// docs/error-handling.md §2 に列挙されている全エラーコード
export const ErrorCode = {
  // 共通 (§2.1)
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',

  // カテゴリ (§2.2)
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CATEGORY_NAME_DUPLICATE: 'CATEGORY_NAME_DUPLICATE',
  CATEGORY_NAME_TOO_LONG: 'CATEGORY_NAME_TOO_LONG',
  CATEGORY_NAME_EMPTY: 'CATEGORY_NAME_EMPTY',

  // チャンネル (§2.3)
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',

  // コンテンツ (§2.4)
  CONTENT_NOT_FOUND: 'CONTENT_NOT_FOUND',
  INVALID_CURSOR: 'INVALID_CURSOR',

  // 手動ポーリング (§2.6)
  POLLING_COOLDOWN: 'POLLING_COOLDOWN',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',

  // 設定・チャンネル同期 (§2.7)
  INVALID_POLLING_INTERVAL: 'INVALID_POLLING_INTERVAL',
  INVALID_RETENTION_DAYS: 'INVALID_RETENTION_DAYS',
  YOUTUBE_API_ERROR: 'YOUTUBE_API_ERROR',
  OAUTH_TOKEN_INVALID: 'OAUTH_TOKEN_INVALID',

  // 通知 (§2.8)
  PUSH_SUBSCRIPTION_NOT_FOUND: 'PUSH_SUBSCRIPTION_NOT_FOUND',
  PUSH_SEND_FAILED: 'PUSH_SEND_FAILED',
} as const

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode]

export type ValidationDetail = {
  field: string
  message: string
}

// docs/error-handling.md §1.1 準拠のエラーレスポンス形式
export type ErrorResponseBody = {
  error: {
    code: ErrorCodeType
    message: string
    details?: ValidationDetail[]
    retryAfter?: number
  }
}

/**
 * 基本エラーレスポンスを生成する
 * docs/error-handling.md §1.1 準拠
 */
export function errorResponse(
  code: ErrorCodeType,
  message: string,
  status: number,
): NextResponse<ErrorResponseBody> {
  return NextResponse.json({ error: { code, message } }, { status })
}

/**
 * バリデーションエラーレスポンスを生成する（details フィールド付き）
 * docs/error-handling.md §1.1 準拠
 */
export function validationErrorResponse(
  details: ValidationDetail[],
  message = '入力値が不正です',
): NextResponse<ErrorResponseBody> {
  return NextResponse.json(
    { error: { code: ErrorCode.VALIDATION_ERROR, message, details } },
    { status: 400 },
  )
}

/**
 * クールダウンエラーレスポンスを生成する（retryAfter フィールド付き）
 * docs/error-handling.md §2.6 準拠
 */
export function cooldownErrorResponse(
  retryAfterSeconds: number,
  message = '手動ポーリングは5分間隔でのみ実行できます',
): NextResponse<ErrorResponseBody> {
  return NextResponse.json(
    {
      error: {
        code: ErrorCode.POLLING_COOLDOWN,
        message,
        retryAfter: retryAfterSeconds,
      },
    },
    { status: 429 },
  )
}
