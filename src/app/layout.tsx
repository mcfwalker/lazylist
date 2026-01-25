import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'LazyList',
  description: 'Personal knowledge capture',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Architects+Daughter&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
