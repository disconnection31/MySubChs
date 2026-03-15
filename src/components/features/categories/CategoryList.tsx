'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { toast } from 'sonner'

import { useReorderCategories } from '@/hooks/useCategories'
import type { CategoryResponse } from '@/types/api'

import { CategoryRow } from './CategoryRow'

type CategoryListProps = {
  categories: CategoryResponse[]
}

const MOBILE_QUERY = '(max-width: 767px)'

export function CategoryList({ categories }: CategoryListProps) {
  const [isMobile, setIsMobile] = useState(false)
  const reorderCategories = useReorderCategories()
  const isReordering = reorderCategories.isPending

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    setIsMobile(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = categories.findIndex((c) => c.id === active.id)
      const newIndex = categories.findIndex((c) => c.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      const newOrder = [...categories]
      const [moved] = newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, moved)

      const orderedIds = newOrder.map((c) => c.id)
      reorderCategories.mutate(orderedIds, {
        onError: () => {
          toast.error('並び替えに失敗しました')
        },
      })
    },
    [categories, reorderCategories],
  )

  const isDndDisabled = isMobile || isReordering

  return (
    <div className={isReordering ? 'pointer-events-none opacity-70' : ''}>
      <DndContext
        sensors={isMobile ? undefined : sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {categories.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                isDndDisabled={isDndDisabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
