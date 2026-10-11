/**
 * Names, reduced to something two spellings of the same name agree on.
 *
 * Case, accents, punctuation and spacing are all noise here: "O'Brien",
 * "OBRIEN" and "O Brien" are one surname, and "Smith-Jones", "Smith Jones" and
 * "SmithJones" are one too.
 */
const plain = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Letters only: "Mary-Ann", "mary ann" and "Maryann" all become "maryann". */
export const nameKey = (text) => plain(text).replace(/[^a-z]/g, '');

/** The words a name is made of: "Smith-Jones" is ["smith", "jones"]. */
export const nameTokens = (text) => plain(text).split(/[^a-z]+/).filter(Boolean);

const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;

/** Suffixes off the end of some words ("SMITH JR" -> ["SMITH"], ["JR"]). */
function takeSuffixes(words) {
  const rest = [...words];
  const suffixes = [];
  while (rest.length > 1 && SUFFIX.test(rest[rest.length - 1])) suffixes.unshift(rest.pop());
  return { rest, suffixes };
}

/**
 * A name written "LAST, FIRST MIDDLE" -- Texas's single name column -- taken
 * apart. The last name is everything before the first comma, so "DE LA CRUZ,
 * ANA" and "SMITH-JONES, PAT" keep theirs whole; whatever follows is the first
 * name and then the middle name. A suffix ("JR", "III") may sit after a comma or
 * on the end of either half, and is set aside: it is no part of a name to compare.
 */
export function splitCommaName(text) {
  const [lastPart = '', ...after] = String(text ?? '').split(',').map((part) => part.trim());
  const last = takeSuffixes(lastPart.split(/\s+/).filter(Boolean));
  const given = takeSuffixes(after.join(' ').split(/\s+/).filter(Boolean));
  return {
    firstName: given.rest[0] ?? '',
    middleName: given.rest.slice(1).join(' '),
    lastName: last.rest.join(' '),
    suffix: [...last.suffixes, ...given.suffixes].join(' '),
  };
}

/**
 * A name written "FIRST MIDDLE LAST" with nothing to say where the last name
 * starts -- Connecticut's -- taken apart. The last name is taken to be the last
 * word: a two-word last name ("DE LA CRUZ") will come out as "CRUZ", which the
 * matcher still finds, as a possible match to be confirmed and not as a miss.
 */
export function splitPlainName(text) {
  const { rest, suffixes } = takeSuffixes(String(text ?? '').split(/\s+/).filter(Boolean));
  return {
    firstName: rest.length > 1 ? rest[0] : '',
    middleName: rest.length > 2 ? rest.slice(1, -1).join(' ') : '',
    lastName: rest.length > 1 ? rest[rest.length - 1] : (rest[0] ?? ''),
    suffix: suffixes.join(' '),
  };
}
