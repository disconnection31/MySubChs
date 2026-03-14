import type { Metadata } from 'next'

import { SessionProviderWrapper } from '@/components/layout/SessionProviderWrapper'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from '@/components/ui/sonner'

import './globals.css'

export const metadata: Metadata = {
  title: 'MySubChs',
  description: 'YouTube subscription organizer',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <SessionProviderWrapper>
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
