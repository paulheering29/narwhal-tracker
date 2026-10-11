const TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 6

const decode = (text: string) =>
  text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const attribute = (tag: string, name: string) => {
  const found = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return found ? (found[1] ?? found[2]) : null
}

/**
 * Every field of a page's form as a browser would send it back: hidden fields a
 * server uses to keep its place, each text box's value, each list's chosen
 * option. Buttons are left out -- which one was pressed is the caller's to say.
 * Reading them off each page, rather than remembering any, keeps the download
 * from breaking when the site reshuffles them.
 */
export function formFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {}

  for (const [tag] of Array.from(html.matchAll(/<input\b[^>]*>/gi))) {
    const name = attribute(tag, 'name')
    const type = (attribute(tag, 'type') ?? 'text').toLowerCase()
    if (!name || ['submit', 'button', 'reset', 'image', 'file'].includes(type)) continue
    if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(tag)) continue
    fields[name] = decode(attribute(tag, 'value') ?? '')
  }

  for (const [, name, body] of Array.from(html.matchAll(/<select\b[^>]*\bname\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi))) {
    const options = Array.from(body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi))
    const chosen = options.find(([, attrs]) => /\bselected\b/i.test(attrs)) ?? options[0]
    if (chosen) fields[name] = decode(attribute(chosen[1], 'value') ?? chosen[2].trim())
  }
  return fields
}

export type FormPage = { url: string; buffer: Buffer; headers: Headers; isPage: boolean; html: string }

/**
 * A browser's side of a state site that hands out a file only after several
 * pages of forms: what pressing its buttons in turn would do, and nothing more.
 * It keeps the site's session cookie, stays on the one host it was opened for
 * (a redirect anywhere else, or anything not https, is refused) and sends
 * nothing but the page's own fields and the buttons it is told to press.
 */
export function openFormSession(host: string, { maxBytes }: { maxBytes: number }) {
  const cookies = new Map<string, string>()

  const remember = (response: Response) => {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(';')
      const at = pair.indexOf('=')
      if (at > 0) cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1))
    }
  }

  async function request(url: string, form?: Record<string, string> | string, extraHeaders: Record<string, string> = {}): Promise<FormPage> {
    let target = url
    let body = form
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const parsed = new URL(target)
      if (parsed.protocol !== 'https:' || parsed.host !== host) throw new Error(`Refusing to leave ${host}.`)

      let response: Response
      try {
        response = await fetch(parsed, {
          method: body ? 'POST' : 'GET',
          body: body ? (typeof body === 'string' ? body : new URLSearchParams(body)) : undefined,
          redirect: 'manual',
          headers: {
            'User-Agent': 'TrainingLoop (license list download)',
            // An empty Cookie header is not the same as none: some sites answer it with a 500.
            ...(cookies.size > 0 ? { Cookie: Array.from(cookies).map(([n, v]) => `${n}=${v}`).join('; ') } : {}),
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...extraHeaders,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        const e = error as { cause?: { code?: string }; message?: string }
        throw new Error(`Couldn't reach the state's site: ${e?.cause?.code ?? e?.message ?? error}`)
      }
      remember(response)

      const location = response.headers.get('location')
      if (response.status >= 300 && response.status < 400 && location) {
        target = new URL(location, parsed).href
        body = undefined // a redirect is followed with a plain GET, as a browser does
        continue
      }
      if (!response.ok) throw new Error(`The state's site answered ${response.status}.`)

      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > maxBytes) throw new Error("The state's file is far larger than expected, so it was not downloaded.")
      const isPage = /html/i.test(response.headers.get('content-type') ?? '')
      return { url: parsed.href, buffer, headers: response.headers, isPage, html: isPage ? buffer.toString('utf8') : '' }
    }
    throw new Error("The state's site kept redirecting.")
  }

  return {
    get: (url: string) => request(url),
    /** Press a button: send back the page's form fields, with these changed or added. */
    submit: (page: FormPage, changes: Record<string, string>) => request(page.url, { ...formFields(page.html), ...changes }),
    /** Send a body exactly as given, for a site whose page scripts build their own requests. */
    post: (url: string, body: string, headers?: Record<string, string>) => request(url, body, headers),
  }
}
