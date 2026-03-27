'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'

import { cn } from '@/lib/utils'
import { UNCATEGORIZED_CATEGORY_ID } from '@/lib/config'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import type { CategoryResponse } from '@/types/api'

type MobileSidebarProps = {
  categories: CategoryResponse[]
  selectedCategoryId: string | null
  onSelectCategory: (categoryId: string) => void
}

export function MobileSidebar({
  categories,
  selectedCategoryId,
  onSelectCategory,
}: MobileSidebarProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (categoryId: string) => {
    onSelectCategory(categoryId)
    setOpen(false)
  }

  return (
    <div className="md:hidden">
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="カテゴリ選択">
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>カテゴリ</SheetTitle>
            <SheetDescription className="sr-only">カテゴリを選択してください</SheetDescription>
          </SheetHeader>
          <nav className="flex flex-col py-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => handleSelect(category.id)}
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
              onClick={() => handleSelect(UNCATEGORIZED_CATEGORY_ID)}
              className={cn(
                'truncate px-4 py-2 text-left text-sm transition-colors hover:bg-accent',
                selectedCategoryId === UNCATEGORIZED_CATEGORY_ID && 'bg-accent font-medium',
              )}
            >
              未分類
            </button>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  )
}
