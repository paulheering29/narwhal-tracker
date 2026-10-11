import { PA_SEARCH_URL, paSearchBody, collectPa, paRow } from '@sysreview/core';

/**
 * Pennsylvania's Behavior Specialists, asked of PALS the way its own search page
 * asks (see core's pennsylvania.js). Around two hundred requests, one at a time
 * with a short pause: a state's public site is not ours to hammer.
 */

const TIMEOUT_MS = 40_000;
const PAUSE_MS = 150;
const MAX_ANSWER_BYTES = 5_000_000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One page of one search. Only the search itself is sent: no cookies, and never anything about the staff. */
async function askPals(prefix, page) {
  let response;
  try {
    response = await fetch(PA_SEARCH_URL, {
      method: 'POST',
      redirect: 'manual',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        Origin: 'https://www.pals.pa.gov',
        Referer: 'https://www.pals.pa.gov/',
      },
      body: JSON.stringify(paSearchBody({ prefix, page })),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Couldn't reach PALS: ${error?.cause?.code ?? error?.message ?? error}`);
  }
  if (!response.ok) throw new Error(`PALS answered ${response.status}.`);

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_ANSWER_BYTES) throw new Error("PALS's answer was far larger than expected, so it was not read.");

  let answer;
  try {
    answer = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new Error("PALS's answer wasn't in the form we expected.");
  }
  // A search that was refused -- a CAPTCHA switched on, say -- comes back as something other than a list.
  if (!Array.isArray(answer)) throw new Error('PALS did not answer the search with a list, which it does when it wants the search made from a web page.');
  await pause(PAUSE_MS);
  return answer;
}

/** @returns {Promise<Object[]>} Rows of PA_CSV_HEADERS. */
export async function sweepPennsylvania() {
  const people = await collectPa(askPals);
  return people.map(paRow);
}
