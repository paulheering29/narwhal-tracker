import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

export type LegalSection = { heading: string; body: ReactNode }

// Shared shell for the Terms and Privacy pages: plain reading layout, wordmark linking home.
export function LegalPage({ title, updated, intro, sections }: {
  title: string
  updated: string
  intro: ReactNode
  sections: LegalSection[]
}) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 px-4 sm:px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <Link href="/" aria-label="Training Loop home">
            <Image src="/training-loop-wordmark.png" alt="Training Loop" width={2195} height={340} className="h-6 w-auto" />
          </Link>
        </div>
      </header>

      <main className="px-4 sm:px-8 py-12 sm:py-16">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated {updated}</p>
          <div className="mt-8 space-y-4 text-gray-700 leading-relaxed">{intro}</div>

          {sections.map((s, i) => (
            <section key={s.heading} className="mt-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-3">{i + 1}. {s.heading}</h2>
              <div className="space-y-3 text-gray-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5">{s.body}</div>
            </section>
          ))}
        </article>
      </main>

      <footer className="border-t border-gray-200 px-4 sm:px-8 py-8">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Training Loop</p>
          <div className="flex gap-5">
            <Link href="/terms" className="hover:text-gray-900">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-gray-900">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
