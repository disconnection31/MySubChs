import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request })
  const { pathname } = request.nextUrl

  const isLoginPage = pathname === '/login'

  if (token && isLoginPage) {
    // 認証済みユーザーが /login にアクセスした場合は / にリダイレクト
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (!token && !isLoginPage) {
    // 未認証ユーザーが /login 以外にアクセスした場合は /login にリダイレクト
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // /api/auth/* と静的ファイルを認証チェック対象外にする
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
}
