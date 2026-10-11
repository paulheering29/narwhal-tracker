// Names reduced to something two spellings of the same name agree on: case,
// accents, punctuation and spacing are noise ("O'Brien" = "OBRIEN").
const plain = (text: unknown) =>
  String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Letters only: "Mary-Ann", "mary ann" and "Maryann" all become "maryann". */
export const nameKey = (text: unknown) => plain(text).replace(/[^a-z]/g, '')

/** The words a name is made of: "Smith-Jones" is ["smith", "jones"]. */
export const nameTokens = (text: unknown) => plain(text).split(/[^a-z]+/).filter(Boolean)
