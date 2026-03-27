import type { CategoryResponse } from '@/types/api'

import { CategoryNav } from './CategoryNav'

type SidebarProps = {
  categories: CategoryResponse[]
  selectedCategoryId: string | null
  onSelectCategory: (categoryId: string) => void
}

export function Sidebar({ categories, selectedCategoryId, onSelectCategory }: SidebarProps) {
  return (
    <aside className="hidden w-56 shrink-0 border-r md:block">
      <CategoryNav
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={onSelectCategory}
      />
    </aside>
  )
}
