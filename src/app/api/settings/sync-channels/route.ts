import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { ErrorCode, errorResponse } from '@/lib/errors'

// T19 で実装に差し替え
export async function POST() {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  // スタブレスポンス（T19 で YouTube API を使った実装に差し替え）
  return NextResponse.json({
    added: 0,
    restored: 0,
    deactivated: 0,
    updated: 0,
  })
}
