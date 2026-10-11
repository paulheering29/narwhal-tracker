// Names reduced to something two spellings of the same name agree on: case,
// accents, punctuation and spacing are noise ("O'Brien" = "OBRIEN").
const plain = (text: unknown) =>
  String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Letters only: "Mary-Ann", "mary ann" and "Maryann" all become "maryann". */
export const nameKey = (text: unknown) => plain(text).replace(/[^a-z]/g, '')

/** The words a name is made of: "Smith-Jones" is ["smith", "jones"]. */
export const nameTokens = (text: unknown) => plain(text).split(/[^a-z]+/).filter(Boolean)

const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i

function takeSuffixes(words: string[]) {
  const rest = [...words]
  const suffixes: string[] = []
  while (rest.length > 1 && SUFFIX.test(rest[rest.length - 1])) suffixes.unshift(rest.pop() as string)
  return { rest, suffixes }
}

type Parts = { firstName: string; middleName: string; lastName: string }

/** "LAST, FIRST MIDDLE" (Texas). A suffix is set aside: it is no part of a name to compare. */
export function splitCommaName(text: string): Parts {
  const [lastPart = '', ...after] = String(text ?? '').split(',').map(p => p.trim())
  const last = takeSuffixes(lastPart.split(/\s+/).filter(Boolean))
  const given = takeSuffixes(after.join(' ').split(/\s+/).filter(Boolean))
  return { firstName: given.rest[0] ?? '', middleName: given.rest.slice(1).join(' '), lastName: last.rest.join(' ') }
}

/**
 * "FIRST MIDDLE LAST" with nothing to say where the last name starts (Connecticut).
 * The last word is taken as the last name, so a two-word surname comes out as a
 * possible match for a person to confirm, not a miss.
 */
export function splitPlainName(text: string): Parts {
  const { rest } = takeSuffixes(String(text ?? '').split(/\s+/).filter(Boolean))
  return {
    firstName: rest.length > 1 ? rest[0] : '',
    middleName: rest.length > 2 ? rest.slice(1, -1).join(' ') : '',
    lastName: rest.length > 1 ? rest[rest.length - 1] : (rest[0] ?? ''),
  }
}
