import { getServerSession, type Session } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { VALID_POLLING_INTERVALS } from '@/lib/config'

/**
 * 認証済みセッションを取得する。
 * 未認証の場合は null を返す。呼び出し元で早期 return を行うパターンで使用する。
 *
 * @example
 * const auth = await getAuthenticatedSession()
 * if (!auth) return errorResponse(ErrorCode.UNAUTHORIZED, '認証が必要です', 401)
 * // auth.session, auth.userId が使用可能
 */
export async function getAuthenticatedSession(): Promise<{
  session: Session
  userId: string
} | null> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return null
  }

  return { session, userId: session.user.id }
}

/**
 * ポーリング間隔値が有効値（VALID_POLLING_INTERVALS）に含まれるか検証する型ガード
 */
export function isValidPollingInterval(
  value: unknown,
): value is (typeof VALID_POLLING_INTERVALS)[number] {
  return (VALID_POLLING_INTERVALS as readonly unknown[]).includes(value)
}

/**
 * Base64 エンコードされたカーソル文字列をデコードする。
 * デコードまたは JSON 解析に失敗した場合は null を返す。
 * docs/error-handling.md §2.4 INVALID_CURSOR エラー用
 */
export function decodeCursor(cursor: string): { contentAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8')
    const parsed: unknown = JSON.parse(decoded)

    const obj = parsed as Record<string, unknown>
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof obj.contentAt === 'string' &&
      typeof obj.id === 'string'
    ) {
      return { contentAt: obj.contentAt, id: obj.id }
    }

    return null
  } catch {
    return null
  }
}
