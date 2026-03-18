'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { UserSettingsResponse } from '@/types/api'

type Props = {
  settings: UserSettingsResponse
}

export function AccountSection({ settings }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const isValid = settings.tokenStatus === 'valid'

  const handleReauth = async () => {
    setIsLoading(true)
    await signIn('google', { callbackUrl: '/settings' })
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">アカウント</h2>
      <div className="border-t pt-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">認証状態</span>
          <span className="ml-auto flex items-center gap-1.5">
            {isValid ? (
              <>
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">認証済み</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium text-orange-500">要再認証</span>
              </>
            )}
          </span>
        </div>

        {!isValid && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Google アカウントとの連携が切れています。
              <br />
              再認証しないとポーリングが動作しません。
            </p>
            <Button onClick={handleReauth} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              再認証する
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
