import Link from 'next/link'

import { Button } from '@/components/ui/button'

type ChannelEmptyStateProps = {
  isActive: boolean
}

export function ChannelEmptyState({ isActive }: ChannelEmptyStateProps) {
  if (isActive) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-12 text-center">
        <p className="text-sm text-muted-foreground">
          チャンネルがまだ登録されていません。
          <br />
          設定画面からチャンネルを同期してください。
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">設定画面へ</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center rounded-lg border py-12 text-center">
      <p className="text-sm text-muted-foreground">解除済みのチャンネルはありません。</p>
    </div>
  )
}
