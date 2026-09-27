'use client'

import { useMemo, useState, useEffect } from 'react'
import { sanitizeHtml } from '@/lib/sanitize-html'

/**
 * Renders admin-authored rich text. Always sanitises at render time rather
 * than trusting what's in the database — a row saved before the allowlist
 * tightened, or written by any path that skipped the editor, still can't
 * inject anything into a learner's browser.
 */
export function RichText({ html, className }: { html: string; className?: string }) {
  // Sanitising needs a DOM, so hold off until after hydration. Rendering
  // empty on both the server and the first client pass keeps the two in
  // agreement (no hydration mismatch) and guarantees nothing unsanitised is
  // ever committed to the page.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const clean = useMemo(() => (mounted ? sanitizeHtml(html) : ''), [html, mounted])
  return (
    <div
      className={`text-sm text-gray-700 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-600 [&_a]:underline [&_p]:mb-2 last:[&_p]:mb-0 ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
