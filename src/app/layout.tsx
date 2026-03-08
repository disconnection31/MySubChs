import type { Metadata } from 'next'

import { SessionProviderWrapper } from '@/components/layout/SessionProviderWrapper'

import './globals.css'

export const metadata: Metadata = {
  title: 'MySubChs',
  description: 'YouTube subscription organizer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  )
}
