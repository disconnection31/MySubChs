'use client'

import { useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, GripVertical, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { useUpdateCategory } from '@/hooks/useCategories'
import { cn } from '@/lib/utils'
import { isApiError, type CategoryResponse } from '@/types/api'

import { CategoryDeleteDialog } from './CategoryDeleteDialog'
import { CategorySettings } from './CategorySettings'

type CategoryRowProps = {
  category: CategoryResponse
  isDndDisabled: boolean
  globalPollingInterval: number
}

export function CategoryRow({ category, isDndDisabled, globalPollingInterval }: CategoryRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(category.name)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const updateCategory = useUpdateCategory()
  const isSubmitting = updateCategory.isPending

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: category.id,
    disabled: isDndDisabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const startEditing = () => {
    setEditName(category.name)
    setInlineError(null)
    setIsEditing(true)
    // Wait for render, then focus
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setInlineError(null)
  }

  const handleSave = async () => {
    const trimmed = editName.trim()
    if (!trimmed) return

    // No change - just close
    if (trimmed === category.name) {
      cancelEditing()
      return
    }

    setInlineError(null)
    try {
      await updateCategory.mutateAsync({ id: category.id, name: trimmed })
      setIsEditing(false)
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setInlineError('同じ名前のカテゴリが既に存在します')
      } else if (isApiError(error) && error.status === 400) {
        setInlineError(error.message)
      } else {
        toast.error('カテゴリ名の更新に失敗しました')
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    }
  }

  const handleBlur = (e: React.FocusEvent) => {
    // Don't cancel if focus moved to save button
    if (saveButtonRef.current?.contains(e.relatedTarget as Node)) {
      return
    }
    cancelEditing()
  }

  return (
    <>
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <div
          ref={setNodeRef}
          style={style}
          className={cn(
            'flex items-center gap-3 rounded-lg border bg-card p-4',
            settingsOpen && 'rounded-b-none',
          )}
        >
          {/* Drag handle - PC only */}
          <button
            className="hidden md:flex cursor-grab touch-none items-center text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
            tabIndex={-1}
            aria-label="並べ替え"
          >
            <GripVertical className="h-5 w-5" />
          </button>

          {/* Name area */}
          {isEditing ? (
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value)
                    setInlineError(null)
                  }}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={inlineError ? 'border-destructive' : ''}
                />
                <Button
                  ref={saveButtonRef}
                  size="sm"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSave}
                  disabled={!editName.trim() || isSubmitting}
                >
                  {isSubmitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  保存
                </Button>
              </div>
              {inlineError && (
                <p className="mt-1 text-sm text-destructive">{inlineError}</p>
              )}
            </div>
          ) : (
            <button
              className="flex-1 cursor-pointer text-left text-sm font-medium hover:text-primary"
              onClick={startEditing}
            >
              {category.name}
            </button>
          )}

          {/* Delete button */}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
            aria-label={`${category.name}を削除`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          {/* Settings toggle button */}
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1 text-muted-foreground"
              aria-label={`${category.name}の設定`}
            >
              設定
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  settingsOpen && 'rotate-180',
                )}
              />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <CategorySettings
            categoryId={category.id}
            settings={category.settings}
            globalPollingInterval={globalPollingInterval}
          />
        </CollapsibleContent>
      </Collapsible>

      {deleteDialogOpen && (
        <CategoryDeleteDialog
          categoryId={category.id}
          categoryName={category.name}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      )}
    </>
  )
}
