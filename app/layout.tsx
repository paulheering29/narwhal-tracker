import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Training Loop',
  description: 'Where RBTs earn PDUs, BCBAs earn CEUs, and everyone tracks their certification.',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
}

// Runs before first paint so a dark-mode visitor never sees a white flash. Same rule as
// components/theme-toggle.tsx: a saved choice wins, otherwise follow the system setting.
const THEME_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
