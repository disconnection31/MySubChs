'use client'

import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeleteCategory } from '@/hooks/useCategories'

type CategoryDeleteDialogProps = {
  categoryId: string
  categoryName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CategoryDeleteDialog({
  categoryId,
  categoryName,
  open,
  onOpenChange,
}: CategoryDeleteDialogProps) {
  const deleteCategory = useDeleteCategory()
  const isDeleting = deleteCategory.isPending

  const handleDelete = async () => {
    try {
      await deleteCategory.mutateAsync(categoryId)
      onOpenChange(false)
    } catch {
      toast.error('カテゴリの削除に失敗しました')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>カテゴリを削除</DialogTitle>
          <DialogDescription>
            カテゴリ「{categoryName}」を削除します。
            所属するチャンネルは未分類になります。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
