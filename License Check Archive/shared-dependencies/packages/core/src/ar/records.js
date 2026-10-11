import { createColumnResolver } from '../csv/columns.js';
import { AR_BASES, AR_SIDES, AR_BUCKETS, bucketColumn, identifyArFile } from './columns.js';

/**
 * AR rows, reduced to what the app looks at.
 *
 * Money is held in whole cents. Adding up thousands of values like 55.28 in
 * floating point drifts by fractions of a cent, and the point of this module is
 * that its totals match CentralReach's to the cent.
 */

/**
 * "55.28" -> 5528. Also takes "$1,234.50" and "(15.33)", in case an export is
 * ever formatted for people rather than machines.
 *
 * @returns {number|null} cents, 0 for a blank cell, null for something that is
 *   not a number at all.
 */
export function toCents(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return 0;
  const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw);
  const digits = raw.replace(/[()$,\s-]/g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(digits)) return null;
  const cents = Math.round(Number(digits) * 100);
  return negative ? -cents : cents;
}

/** "2/12/26 0:00" or "2026-02-12" -> "2026-02-12". Anything else -> null. */
export function toIsoDate(text) {
  const raw = String(text ?? '').trim();
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    return isoFrom(year, Number(us[1]), Number(us[2]));
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return isoFrom(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

function isoFrom(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  // 2/30/26 is not a date, and Date would quietly make it March.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const toWhole = (text) => {
  const raw = String(text ?? '').trim();
  if (raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number) : null;
};

const toNumber = (text) => {
  const number = Number(String(text ?? '').trim());
  return Number.isFinite(number) ? number : 0;
};

/** CentralReach writes "Cleared &amp; Ready To Bill" into the CSV. */
const decode = (text) =>
  String(text ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/**
 * @param {{ headers: string[], rows: Object[] }} parsed
 * @returns {{
 *   isAr: boolean,
 *   missing: string[],
 *   records: Object[],
 *   asOf: string|null,
 *   unreadableAmounts: number,
 * }}
 */
export function toArRecords(parsed) {
  const { isAr, missing } = identifyArFile(parsed.headers);
  if (!isAr || missing.length > 0) {
    return { isAr, missing, records: [], asOf: null, unreadableAmounts: 0 };
  }

  const { resolve } = createColumnResolver(parsed.headers);
  const column = (name) => resolve(name);
  const text = (row, name) => {
    const header = column(name);
    return header ? String(row[header] ?? '').trim() : '';
  };

  const buckets = {};
  for (const basis of AR_BASES) {
    buckets[basis.id] = {};
    for (const side of AR_SIDES) {
      buckets[basis.id][side.id] = AR_BUCKETS.map((bucket) => column(bucketColumn(side.id, basis.id, bucket.id)));
    }
  }

  let unreadableAmounts = 0;
  // The export does not say when it was run, but every row says how many days
  // ago its service was. Service date plus that is the day it was pulled.
  const votes = new Map();

  const records = parsed.rows.map((row, index) => {
    const aged = {};
    for (const basis of AR_BASES) {
      aged[basis.id] = {};
      for (const side of AR_SIDES) {
        aged[basis.id][side.id] = buckets[basis.id][side.id].map((header) => {
          const cents = toCents(row[header]);
          if (cents === null) {
            unreadableAmounts += 1;
            return 0;
          }
          return cents;
        });
      }
    }

    const serviceDate = toIsoDate(text(row, 'ServiceDate'));
    const daysSinceService = toWhole(text(row, 'DaysSinceDateOfService'));
    if (serviceDate && daysSinceService !== null) {
      const day = addDays(serviceDate, daysSinceService);
      votes.set(day, (votes.get(day) ?? 0) + 1);
    }

    const first = text(row, 'ClientFirstName');
    const last = text(row, 'ClientLastName');

    return {
      key: index,
      id: text(row, 'Id'),
      payor: text(row, 'PayorName'),
      plan: text(row, 'PlanName'),
      insuranceType: text(row, 'InsuranceType'),
      clientId: text(row, 'ClientId'),
      client: text(row, 'ClientName') || [first, last].filter(Boolean).join(' '),
      provider: text(row, 'ProviderName'),
      code: text(row, 'ProcedureCode'),
      serviceDate,
      firstBilled: toIsoDate(text(row, 'FirstBilled')),
      lastBilled: toIsoDate(text(row, 'LastBilled')),
      daysSinceService,
      daysSinceFirstBilled: toWhole(text(row, 'DaysSinceFirstBilled')),
      daysSinceLastBilled: toWhole(text(row, 'DaysSinceLastBilled')),
      units: toNumber(text(row, 'Units')),
      labels: decode(text(row, 'BillingEntryLabels')),
      aged,
    };
  });

  let asOf = null;
  let most = 0;
  for (const [day, count] of votes) {
    if (count > most) {
      asOf = day;
      most = count;
    }
  }

  return { isAr, missing, records, asOf, unreadableAmounts };
}
