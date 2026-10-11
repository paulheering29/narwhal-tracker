import { formFields } from '@sysreview/core';

const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 6;

/**
 * A browser's side of a state site that only hands out a file after several
 * pages of forms -- what pressing its buttons one after another would do, and
 * nothing more.
 *
 * It keeps the site's own session cookie and gives every page back the fields
 * that page's form asked to be sent back (see formFields). It stays on the one
 * host it was opened for -- a redirect anywhere else is refused, as is anything
 * that is not https -- and never sends anything but those fields and the
 * buttons it is told to press. Nothing about anybody on the staff list is in
 * reach of this file.
 *
 * @param {string} host  The only host it may talk to.
 * @param {{ maxBytes: number }} limits
 */
export function openFormSession(host, { maxBytes }) {
  const cookies = new Map();

  const remember = (response) => {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(';');
      const at = pair.indexOf('=');
      if (at > 0) cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1));
    }
  };

  async function request(url, form, extraHeaders = {}) {
    let target = url;
    let body = form;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const parsed = new URL(target);
      if (parsed.protocol !== 'https:' || parsed.host !== host) throw new Error(`Refusing to leave ${host}.`);

      let response;
      try {
        response = await fetch(parsed, {
          method: body ? 'POST' : 'GET',
          body: body ? (typeof body === 'string' ? body : new URLSearchParams(body)) : undefined,
          redirect: 'manual',
          headers: {
            'User-Agent': 'SystemReview (license list download)',
            // An empty Cookie header is not the same as none: some sites answer it with an error.
            ...(cookies.size > 0 ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') } : {}),
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...extraHeaders,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new Error(`Couldn't reach the state's site: ${error?.cause?.code ?? error?.message ?? error}`);
      }
      remember(response);

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        target = new URL(location, parsed).href;
        body = undefined; // a redirect is followed with a plain GET, as a browser does
        continue;
      }
      if (!response.ok) throw new Error(`The state's site answered ${response.status}.`);
      if (Number(response.headers.get('content-length')) > maxBytes) throw new Error("The state's file is far larger than expected, so it was not downloaded.");

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) throw new Error("The state's file is far larger than expected, so it was not downloaded.");
      const type = response.headers.get('content-type') ?? '';
      return {
        url: parsed.href,
        buffer,
        headers: response.headers,
        isPage: /html/i.test(type),
        html: /html/i.test(type) ? buffer.toString('utf8') : '',
      };
    }
    throw new Error("The state's site kept redirecting.");
  }

  return {
    /** Open a page. */
    get: (url) => request(url),
    /**
     * Press a button on a page: send back its form's fields, with these changed
     * or added, and follow wherever it leads.
     */
    submit: (page, changes) => request(page.url, { ...formFields(page.html), ...changes }),
    /** Send a body exactly as it is, for a site whose page scripts build their own requests. */
    post: (url, body, headers) => request(url, body, headers),
  };
}
