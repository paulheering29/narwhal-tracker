import { useMemo, useState } from 'react';
import {
  IconCircleCheck,
  IconClockExclamation,
  IconCircleX,
  IconAlertTriangle,
  IconUsers,
  IconHelpCircle,
  IconUserSearch,
  IconDownload,
  IconSearch,
  IconX,
  IconChevronUp,
  IconChevronDown,
  IconCertificate,
} from '@tabler/icons-react';
import { OUTCOMES, JURISDICTIONS, jurisdictionName, daysUntil, getFileType } from '@sysreview/core';
import { useTerms } from '../../terms.jsx';
import { formatIsoDate, describeDays } from './format.js';

/** Colour is never the only signal: every outcome has its own icon and its own words. */
const LOOK = {
  expired: { Icon: IconCircleX, tone: 'bad' },
  review: { Icon: IconAlertTriangle, tone: 'warn' },
  none: { Icon: IconUserSearch, tone: 'bad' },
  multiple: { Icon: IconUsers, tone: 'info' },
  possible: { Icon: IconHelpCircle, tone: 'info' },
  expiring: { Icon: IconClockExclamation, tone: 'warn' },
  current: { Icon: IconCircleCheck, tone: 'good' },
};
const LABEL = Object.fromEntries(OUTCOMES.map((outcome) => [outcome.id, outcome.label]));
const RANK = Object.fromEntries(OUTCOMES.map((outcome, index) => [outcome.id, index]));

/** Past this many days the state's file may no longer say what is true. */
const STALE_DAYS = 7;

const first = (person) => person.matches[0];

const COLUMNS = [
  { key: 'name', label: '{StaffMember}', value: (p) => p.staffName },
  { key: 'credentials', label: 'Credentials', value: (p) => p.credentials },
  { key: 'result', label: 'Result', value: (p) => RANK[p.outcome] },
  { key: 'state', label: 'State', value: (p) => first(p)?.jurisdiction ?? '' },
  { key: 'license', label: 'License', value: (p) => first(p)?.number ?? '' },
  { key: 'licensee', label: 'Name on license', value: (p) => (first(p) ? `${first(p).firstName} ${first(p).lastName}` : '') },
  { key: 'status', label: 'State says', value: (p) => first(p)?.status ?? '' },
  { key: 'expires', label: 'Expires', value: (p) => first(p)?.expires ?? '' },
];

const compareValues = (a, b) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

const fullName = (match) => [match.firstName, match.middleName, match.lastName, match.suffix].filter(Boolean).join(' ');

function staffLink(id) {
  return id ? getFileType('staff').recordUrl.replace('{id}', encodeURIComponent(id)) : null;
}

/**
 * Everyone in the {staff} download, and what the state's list says about them.
 *
 * The tiles count each outcome and are also the filter: pressing one shows only
 * those people. The table is one row a person; when several licenses share
 * their name they are listed together in the row, and the CSV gives each its
 * own line.
 */
export default function LicenseCheckReport({ ready, report, onGoToUpload, onExport }) {
  const t = useTerms();
  const [outcome, setOutcome] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'result', dir: 'asc' });

  const counts = useMemo(() => {
    const tally = Object.fromEntries(OUTCOMES.map((o) => [o.id, 0]));
    for (const person of report.people) tally[person.outcome] += 1;
    return tally;
  }, [report.people]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const column = COLUMNS.find((c) => c.key === sort.key);
    const direction = sort.dir === 'asc' ? 1 : -1;

    return report.people
      .filter((person) => !outcome || person.outcome === outcome)
      .filter(
        (person) =>
          !needle ||
          [person.staffName, person.credentials, ...person.matches.flatMap((m) => [m.number, fullName(m)])]
            .join(' ')
            .toLowerCase()
            .includes(needle),
      )
      // Stable, so people the sort cannot tell apart stay in name order.
      .sort((a, b) => a.staffName.localeCompare(b.staffName))
      .sort((a, b) => direction * compareValues(column.value(a), column.value(b)));
  }, [report.people, outcome, search, sort]);

  if (!ready) {
    return (
      <div className="empty">
        <IconCertificate size={40} stroke={1.3} aria-hidden="true" className="empty-icon" />
        <h2>{t('Upload a {staff} download and a license download to see the report.')}</h2>
        <button className="primary" onClick={onGoToUpload}>
          Go to Upload
        </button>
      </div>
    );
  }

  const age = report.dataDate ? daysUntil(report.checkedOn, report.dataDate) : null;
  const loaded = Object.entries(report.licenseCounts);
  // What is worth knowing about how each loaded state's list differs from the others.
  const notes = loaded.map(([code]) => JURISDICTIONS[code]).filter((state) => state?.note);

  function exportCsv() {
    const rows = [];
    for (const person of shown) {
      const lines = person.matches.length > 0 ? person.matches : [null];
      for (const match of lines) {
        rows.push([
          person.staffName,
          person.staffId,
          person.credentials,
          person.active === null ? '' : person.active ? 'Yes' : 'No',
          LABEL[person.outcome],
          match ? jurisdictionName(match.jurisdiction) : '',
          match?.number ?? '',
          match?.type ?? '',
          match ? fullName(match) : '',
          match?.status ?? '',
          match?.expires ? formatIsoDate(match.expires) : '',
          match?.city ?? '',
          match?.state ?? '',
          person.outcome === 'multiple' ? 'Shares a name with another license holder' : (match?.why ?? ''),
        ]);
      }
    }
    onExport({
      headers: [
        t('{StaffMember} Name'), 'CentralReach ID', 'Credentials', 'Active', 'Result', 'License State', 'License Number', 'License Type',
        'Name on License', 'License Status', 'Expires', 'Address City', 'Address State', 'Note',
      ],
      rows,
    });
  }

  function toggleSort(key) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  return (
    <div className="view wide">
      {age !== null && age >= STALE_DAYS && (
        <div className="banner warning" role="status">
          The license list is {age.toLocaleString()} days old (downloaded {formatIsoDate(report.dataDate)}). A license that lapsed or
          was suspended since then will not show. Download it again for a current answer.
        </div>
      )}

      <p className="muted lc-summary">
        {report.people.length.toLocaleString()} {report.people.length === 1 ? t('{staffMember}') : t('{staff}')} checked against{' '}
        {loaded.map(([code, n]) => `${n.toLocaleString()} ${jurisdictionName(code)}`).join(' and ')} behavior analyst licenses
        {report.dataDate && ` · oldest license data from ${formatIsoDate(report.dataDate)}`}
        {' · matched by name only'}
      </p>
      {notes.map((state) => (
        <p key={state.code} className="muted lc-summary">
          {state.name} {state.note}
        </p>
      ))}

      <div className="lc-tiles" role="group" aria-label="Filter by result">
        {OUTCOMES.map(({ id, label }) => {
          const { Icon, tone } = LOOK[id];
          const on = outcome === id;
          return (
            <button
              key={id}
              className={`lc-tile ${tone}${on ? ' on' : ''}${counts[id] === 0 ? ' none-here' : ''}`}
              aria-pressed={on}
              onClick={() => setOutcome(on ? null : id)}
            >
              <Icon size={18} stroke={1.8} aria-hidden="true" className="lc-tile-icon" />
              <span className="lc-tile-count">{counts[id].toLocaleString()}</span>
              <span className="lc-tile-label">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="ar-controls">
        <div className="search">
          <IconSearch size={16} stroke={1.7} aria-hidden="true" />
          <input
            type="text"
            value={search}
            placeholder="Search name or license number"
            aria-label="Search the report"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <IconX size={14} stroke={2} />
            </button>
          )}
        </div>

        {outcome && (
          <button className="ghost" onClick={() => setOutcome(null)}>
            Showing only “{LABEL[outcome]}” — show everyone
          </button>
        )}

        <button onClick={exportCsv} disabled={shown.length === 0} style={{ marginLeft: 'auto' }}>
          <IconDownload size={15} stroke={1.7} aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <h2>Nobody matches that.</h2>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="findings lc-table">
            <thead>
              <tr>
                {COLUMNS.map((column) => {
                  const active = sort.key === column.key;
                  return (
                    <th key={column.key} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button className="ar-sort" onClick={() => toggleSort(column.key)}>
                        {t(column.label)}
                        {active && sort.dir === 'asc' && <IconChevronUp size={13} stroke={2} aria-hidden="true" />}
                        {active && sort.dir === 'desc' && <IconChevronDown size={13} stroke={2} aria-hidden="true" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((person) => {
                const { Icon, tone } = LOOK[person.outcome];
                const link = staffLink(person.staffId);
                return (
                  <tr key={person.staffId || person.staffName}>
                    <td>
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer">
                          {person.staffName || '—'}
                        </a>
                      ) : (
                        person.staffName || '—'
                      )}
                      {person.active === false && <span className="muted"> (inactive)</span>}
                    </td>
                    <td>{person.credentials || '—'}</td>
                    <td>
                      <span className={`lc-result ${tone}`}>
                        <Icon size={15} stroke={1.9} aria-hidden="true" />
                        {LABEL[person.outcome]}
                      </span>
                    </td>
                    {person.matches.length === 0 ? (
                      <td colSpan={5} className="muted">
                        Not on the list
                      </td>
                    ) : (
                      <>
                        <td>{person.matches.map((m) => <div key={`${m.jurisdiction}${m.number}`}>{m.jurisdiction}</div>)}</td>
                        <td className="value">{person.matches.map((m, i) => <div key={`${m.jurisdiction}${m.number}${i}`}>{m.number || '—'}</div>)}</td>
                        <td>
                          {person.matches.map((m) => (
                            <div key={`${m.jurisdiction}${m.number}`}>
                              {fullName(m)}
                              {(m.city || m.state) && <span className="muted"> · {[m.city, m.state].filter(Boolean).join(', ')}</span>}
                              {m.why && <div className="muted lc-why">{m.why}</div>}
                            </div>
                          ))}
                        </td>
                        <td>{person.matches.map((m, i) => <div key={`${m.jurisdiction}${m.number}${i}`}>{m.status || <span className="muted">not published</span>}</div>)}</td>
                        <td>
                          {person.matches.map((m) => (
                            <div key={`${m.jurisdiction}${m.number}`}>
                              {m.expires ? formatIsoDate(m.expires) : '—'}
                              {m.daysLeft !== null && <span className="muted"> · {describeDays(m.daysLeft)}</span>}
                            </div>
                          ))}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
