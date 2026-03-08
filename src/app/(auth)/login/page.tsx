'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

function getErrorMessage(error: string | null): string | null {
  if (!error) return null
  if (error === 'AccessDenied') {
    return 'アクセスが拒否されました。Googleアカウントへのアクセスを許可してください。'
  }
  return 'ログインに失敗しました。もう一度お試しください。'
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const errorMessage = getErrorMessage(error)
  const [isLoading, setIsLoading] = useState(false)

  const handleSignIn = async () => {
    setIsLoading(true)
    try {
      await signIn('google', { callbackUrl: '/' })
    } catch {
      // signIn はリダイレクトで完了するため、例外は発生しないが念のため
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[360px]">
        {/* アプリ名・サブテキスト */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">MySubChs</h1>
          <p className="mt-2 text-sm text-gray-600">YouTubeサブスクリプション管理</p>
        </div>

        {/* Googleでログインボタン */}
        <button
          onClick={handleSignIn}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? (
            // ローディングスピナー
            <svg
              className="h-4 w-4 animate-spin text-gray-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            // Google ロゴ (SVG)
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          {isLoading ? '処理中...' : 'Googleでログイン'}
        </button>

        {/* エラーメッセージ（OAuth 失敗時のみ表示） */}
        {errorMessage && (
          <p className="mt-4 text-center text-sm text-red-600" role="alert">
            ⚠ {errorMessage}
          </p>
        )}
      </div>
    </div>
  )
}
