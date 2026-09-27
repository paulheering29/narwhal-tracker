import DOMPurify from 'dompurify'

/**
 * The only markup section descriptions are allowed to contain. Anything the
 * editor can produce is in here; anything else (scripts, styles, iframes,
 * event handlers, images) is stripped.
 *
 * Descriptions are authored by admins but read by every assigned learner, so
 * this runs on save *and* again on render — saved rows predate any future
 * change to this list, and render is the point where it actually matters.
 */
const ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'p', 'br', 'div', 'span']
const ALLOWED_ATTR = ['href', 'target', 'rel']

// Links in a description shouldn't navigate the learner out of the course
// they're partway through.
if (typeof window !== 'undefined') {
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return ''
  // DOMPurify needs a real DOM; without one it returns its input untouched,
  // which would hand back unsanitised HTML during SSR. Fail closed instead —
  // callers render on the client, where this does the actual work.
  if (typeof window === 'undefined') return ''
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Belt and braces alongside the attribute allowlist: no javascript:,
    // data:, or vbscript: URLs sneaking through an <a href>.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
  })
}

/** True if the value has no visible content (used to skip empty descriptions). */
export function isHtmlEmpty(html: string | null | undefined): boolean {
  if (!html) return true
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === ''
}
