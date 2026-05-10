import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/oxanium'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'YouTube to MP4 & MP3',
  description: 'YouTube to MP4 & MP3 downloader',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-[#050505] text-white min-h-screen">
        {children}
      </body>
    </html>
  )
}
