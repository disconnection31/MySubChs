'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import type { CategoryResponse } from '@/types/api'

import { CategoryNav } from './CategoryNav'

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
          <CategoryNav
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={handleSelect}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
