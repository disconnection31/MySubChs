'use client'

import { useState } from 'react'
import { List } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type CategoryGroup = {
  categoryId: string | null
  categoryName: string
}

type CategoryNavProps = {
  groups: CategoryGroup[]
  onSelectCategory: (categoryId: string | null) => void
}

function CategoryList({
  groups,
  onSelectCategory,
}: {
  groups: CategoryGroup[]
  onSelectCategory: (categoryId: string | null) => void
}) {
  return (
    <nav className="space-y-1">
      {groups.map((group) => (
        <button
          key={group.categoryId ?? 'uncategorized'}
          className="block w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={() => onSelectCategory(group.categoryId)}
        >
          {group.categoryName}
        </button>
      ))}
    </nav>
  )
}

export function CategoryNavSidebar({ groups, onSelectCategory }: CategoryNavProps) {
  return (
    <aside className="hidden md:block sticky top-20 h-fit w-48 shrink-0">
      <h2 className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
        カテゴリ
      </h2>
      <CategoryList groups={groups} onSelectCategory={onSelectCategory} />
    </aside>
  )
}

export function CategoryNavMobile({ groups, onSelectCategory }: CategoryNavProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (categoryId: string | null) => {
    setOpen(false)
    onSelectCategory(categoryId)
  }

  return (
    <div className="md:hidden">
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="カテゴリナビゲーション"
      >
        <List className="h-5 w-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>カテゴリ</SheetTitle>
            <SheetDescription>カテゴリを選択してスクロール</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <CategoryList groups={groups} onSelectCategory={handleSelect} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
