// Personal / free mail providers. A match on one of these says nothing about
// whether two people work at the same company, so they're ignored when looking
// for an existing organization.
const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net',
  'earthlink.net', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com', 'hey.com', 'fastmail.com',
])

/** The domain of a well-formed email, lower-cased, or null. */
export function emailDomain(email: string): string | null {
  const m = /^[^\s@]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i.exec(email.trim())
  return m ? m[1].toLowerCase() : null
}

export function isFreeEmailDomain(domain: string) {
  return FREE_PROVIDERS.has(domain)
}
