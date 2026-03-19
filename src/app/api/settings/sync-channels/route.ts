import { NextResponse } from 'next/server'

import { getAuthenticatedSession } from '@/lib/api-helpers'
import { prisma } from '@/lib/db'
import { ErrorCode, errorResponse } from '@/lib/errors'
import { YouTubeAuthError, YouTubeQuotaExceededError } from '@/lib/platforms/youtube'
import { syncChannels } from '@/lib/sync-channels'

export async function POST() {
  const auth = await getAuthenticatedSession()
  if (!auth) {
    return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
  }

  try {
    // DB から access_token を取得
    const account = await prisma.account.findFirst({
      where: { userId: auth.userId, provider: 'google' },
      select: { access_token: true, token_error: true },
    })

    if (!account?.access_token) {
      return errorResponse(
        ErrorCode.OAUTH_TOKEN_INVALID,
        'OAuthトークンが無効です。再認証してください',
        503,
      )
    }

    if (account.token_error) {
      return errorResponse(
        ErrorCode.OAUTH_TOKEN_INVALID,
        'OAuthトークンが失効しています。再認証してください',
        503,
      )
    }

    const result = await syncChannels(auth.userId, account.access_token)

    console.info(
      `[sync-channels] Sync completed for userId=${auth.userId}:`,
      `added=${result.added}, restored=${result.restored},`,
      `deactivated=${result.deactivated}, updated=${result.updated}`,
    )

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof YouTubeAuthError) {
      console.error('[sync-channels] YouTube auth error:', error.message)
      return errorResponse(
        ErrorCode.OAUTH_TOKEN_INVALID,
        'OAuthトークンが無効です。再認証してください',
        503,
      )
    }

    if (error instanceof YouTubeQuotaExceededError) {
      console.error('[sync-channels] YouTube quota exceeded')
      return errorResponse(
        ErrorCode.YOUTUBE_API_ERROR,
        'YouTube APIのクォータが超過しました。明日以降に再度お試しください',
        503,
      )
    }

    console.error('[sync-channels] Unexpected error:', error)
    return errorResponse(ErrorCode.INTERNAL_SERVER_ERROR, 'サーバー内部エラーが発生しました', 500)
  }
}
