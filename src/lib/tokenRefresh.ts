import { prisma } from '@/lib/db'

// Google OAuth Token Endpoint
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

type TokenRefreshResult =
  | { success: true; accessToken: string }
  | { success: false; error: string }

/**
 * BullMQ Worker 用の OAuth トークンリフレッシュ。
 *
 * youtube-auth.md §3 の仕様に準拠:
 * 1. Account.token_error を確認 → NOT NULL なら即スキップ（早期return）
 * 2. expires_at < now() なら Google Token Endpoint にリフレッシュリクエスト
 * 3. 成功 → access_token / expires_at を更新、token_error を NULL にクリア
 * 4. 失敗 → token_error にエラーコードを書き込み、FAILED を返す
 *
 * @param userId - ユーザーID（Account テーブルの userId）
 * @returns TokenRefreshResult — 成功時は accessToken、失敗時は error メッセージ
 */
export async function ensureValidToken(userId: string): Promise<TokenRefreshResult> {
  // Google OAuth の Account を取得
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'google',
    },
  })

  if (!account) {
    return { success: false, error: 'No Google account found for user' }
  }

  // Step 1: token_error が既にセットされている場合はスキップ
  // （再認証されるまで無意味なリフレッシュ試行を防ぐ）
  if (account.token_error) {
    return {
      success: false,
      error: `Token previously failed: ${account.token_error}`,
    }
  }

  if (!account.refresh_token) {
    return { success: false, error: 'No refresh token available' }
  }

  // Step 2: expires_at が未来なら現在のトークンをそのまま返す
  const now = Math.floor(Date.now() / 1000)
  if (account.expires_at && account.expires_at > now) {
    return { success: true, accessToken: account.access_token ?? '' }
  }

  // Step 3: トークンのリフレッシュ
  const clientId = process.env.GOOGLE_CLIENT_ID ?? ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>
      const errorCode = (body.error as string) ?? `http_${response.status}`

      // Step 5: リフレッシュ失敗 → token_error にエラーコードを書き込む
      await prisma.account.update({
        where: { id: account.id },
        data: { token_error: errorCode },
      })

      console.error(
        `[worker] Token refresh failed: { type: "TOKEN_REFRESH_FAILED", reason: "${errorCode}", userId: "${userId}" }`,
      )

      return { success: false, error: errorCode }
    }

    const data = await response.json() as {
      access_token: string
      expires_in: number
    }

    // Step 4: 成功 → access_token / expires_at を更新、token_error を NULL にクリア
    const newExpiresAt = Math.floor(Date.now() / 1000) + data.expires_in

    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: data.access_token,
        expires_at: newExpiresAt,
        token_error: null,
      },
    })

    return { success: true, accessToken: data.access_token }
  } catch (err) {
    // ネットワークエラー等 — token_error は書き込まない（一時的な障害のため）
    const message = err instanceof Error ? err.message : String(err)

    console.error(
      `[worker] Token refresh failed: { type: "TOKEN_REFRESH_FAILED", reason: "${message}", userId: "${userId}" }`,
    )

    return { success: false, error: message }
  }
}
