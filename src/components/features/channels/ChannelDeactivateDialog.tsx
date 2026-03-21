'use client'

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUpdateChannel } from '@/hooks/useChannels'

type ChannelDeactivateDialogProps = {
  channelId: string
  channelName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChannelDeactivateDialog({
  channelId,
  channelName,
  open,
  onOpenChange,
}: ChannelDeactivateDialogProps) {
  const updateChannel = useUpdateChannel()
  const isPending = updateChannel.isPending

  const handleDeactivate = async () => {
    try {
      await updateChannel.mutateAsync({
        channelId,
        data: { isActive: false },
      })
      onOpenChange(false)
    } catch {
      // Error is handled by the mutation's onError callback (toast)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>チャンネルを解除</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              「{channelName}」をアプリから解除します。
            </span>
            <span className="block text-xs text-muted-foreground">
              ※ YouTubeの登録状態は変更されません。
            </span>
            <span className="block text-xs text-muted-foreground">
              ※ 再度表示するには設定画面から再同期してください。
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            キャンセル
          </Button>
          <Button variant="destructive" onClick={handleDeactivate} disabled={isPending}>
            {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            解除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
