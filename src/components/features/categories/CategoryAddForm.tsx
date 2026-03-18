'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateCategory } from '@/hooks/useCategories'
import { isApiError } from '@/types/api'

type CategoryAddFormProps = {
  onClose: () => void
}

export function CategoryAddForm({ onClose }: CategoryAddFormProps) {
  const [name, setName] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const createCategory = useCreateCategory()
  const isSubmitting = createCategory.isPending

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) return

    setInlineError(null)
    try {
      await createCategory.mutateAsync(trimmed)
      onClose()
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setInlineError('同じ名前のカテゴリが既に存在します')
      } else if (isApiError(error) && error.status === 400) {
        setInlineError(error.message)
      } else {
        toast.error('カテゴリの作成に失敗しました')
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        {/* Spacer for drag handle alignment on PC */}
        <div className="hidden md:block w-5" />
        <div className="flex-1">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setInlineError(null)
            }}
            onKeyDown={handleKeyDown}
            placeholder="カテゴリ名を入力…"
            disabled={isSubmitting}
            className={inlineError ? 'border-destructive' : ''}
          />
          {inlineError && (
            <p className="mt-1 text-sm text-destructive">{inlineError}</p>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!name.trim() || isSubmitting}
        >
          {isSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          追加
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
        >
          キャンセル
        </Button>
      </div>
    </div>
  )
}
