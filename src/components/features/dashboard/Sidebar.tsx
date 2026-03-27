'use client'

import { cn } from '@/lib/utils'
import { UNCATEGORIZED_CATEGORY_ID } from '@/lib/config'
import { Separator } from '@/components/ui/separator'
import type { CategoryResponse } from '@/types/api'

type SidebarProps = {
  categories: CategoryResponse[]
  selectedCategoryId: string | null
  onSelectCategory: (categoryId: string) => void
}

export function Sidebar({ categories, selectedCategoryId, onSelectCategory }: SidebarProps) {
  return (
    <aside className="hidden w-56 shrink-0 border-r md:block">
      <nav className="flex flex-col py-2">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={cn(
              'truncate px-4 py-2 text-left text-sm transition-colors hover:bg-accent',
              selectedCategoryId === category.id && 'bg-accent font-medium',
            )}
          >
            {category.name}
          </button>
        ))}
        <Separator className="my-1" />
        <button
          onClick={() => onSelectCategory(UNCATEGORIZED_CATEGORY_ID)}
          className={cn(
            'truncate px-4 py-2 text-left text-sm transition-colors hover:bg-accent',
            selectedCategoryId === UNCATEGORIZED_CATEGORY_ID && 'bg-accent font-medium',
          )}
        >
          未分類
        </button>
      </nav>
    </aside>
  )
}
