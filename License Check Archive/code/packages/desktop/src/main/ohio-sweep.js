import {
  OH_REQUEST_URL,
  readOhioTokens,
  ohioTokensExpire,
  ohioSearchBody,
  ohioSearchResult,
  collectOhio,
  ohioRow,
} from '@sysreview/core';

/**
 * Ohio's certified behavior analysts, asked of eLicense Ohio the way its own
 * search page asks (see core's ohio.js for why that takes tokens from the
 * person's browser, one search per state, and letter-by-letter splitting).
 *
 * One request at a time and a short pause between them: a sweep is a hundred or
 * so searches, and a state's public site is not ours to hammer.
 */

const TIMEOUT_MS = 40_000;
const PAUSE_MS = 300;
const MAX_ANSWER_BYTES = 20_000_000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One search. Nothing is sent but the search itself and the tokens the person
 * copied: no cookies, and never anything about the staff.
 */
async function askOhio(tokens, state, prefix) {
  let response;
  try {
    response = await fetch(OH_REQUEST_URL, {
      method: 'POST',
      redirect: 'manual',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://elicense.ohio.gov',
        Referer: 'https://elicense.ohio.gov/oh_verifylicense',
        'X-User-Agent': 'Visualforce-Remoting',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(ohioSearchBody(tokens, { state, prefix })),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Couldn't reach eLicense Ohio: ${error?.cause?.code ?? error?.message ?? error}`);
  }
  if (!response.ok) throw new Error(`eLicense Ohio answered ${response.status}.`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_ANSWER_BYTES) throw new Error("eLicense Ohio's answer was far larger than expected, so it was not read.");

  let answer;
  try {
    answer = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error("eLicense Ohio's answer wasn't in the form we expected.");
  }
  const people = ohioSearchResult(answer);
  if (people === null) {
    // What a stale token looks like: the call is answered, but not with a list.
    throw new Error('eLicense Ohio refused the search. The copied request has probably expired -- copy a fresh one from the site.');
  }
  await pause(PAUSE_MS);
  return people;
}

/**
 * @param {string} copiedRequest  "Copy as cURL" text (or the bare JSON body) from a search on eLicense Ohio.
 * @param {(done: number, state: string) => void} [onProgress]
 * @returns {Promise<Object[]>} Rows of OH_CSV_HEADERS.
 */
export async function sweepOhio(copiedRequest, onProgress) {
  const tokens = readOhioTokens(copiedRequest);
  if (!tokens) {
    throw new Error("That doesn't look like a request copied from eLicense Ohio's license search. It should contain a call named findLicensesForOwner.");
  }
  const expires = ohioTokensExpire(tokens);
  if (expires && expires < new Date()) throw new Error('That copied request has expired. Search again on eLicense Ohio and copy a fresh one.');

  const people = await collectOhio((state, prefix) => askOhio(tokens, state, prefix), { onProgress });
  return people.map(ohioRow);
}
