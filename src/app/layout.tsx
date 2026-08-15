import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Moon Courier Crisis',
  description:
    'Лунный курьерский центр: управление доставками на Луне.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <html lang="ru">
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  )
}
