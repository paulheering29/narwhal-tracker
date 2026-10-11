import { useState } from 'react';
import { IconTableImport, IconX, IconUsers, IconFileZip, IconArrowRight, IconExternalLink, IconCloudDownload } from '@tabler/icons-react';
import { api } from '../../api.js';
import { useTerms } from '../../terms.jsx';
import { formatIsoDate } from './format.js';
import { STATES } from './states.js';

const REMEMBERED = 'license-check-selected-states';

const FETCHABLE = STATES.filter((state) => state.fetchable !== false);
const BY_HAND = STATES.filter((state) => state.fetchable === false);

/** Which states were ticked last time -- a convenience, so it never has to work. */
function rememberedSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBERED) ?? '[]');
    return new Set(saved.filter((code) => FETCHABLE.some((state) => state.code === code)));
  } catch {
    return new Set();
  }
}

export default function LicenseCheckUpload({ files, busy, onPick, onDropPaths, onFetchStates, onFetchOhio, onRemove, onViewReport }) {
  const t = useTerms();
  const [over, setOver] = useState(false);
  // Which state's list is being fetched right now, for the button to say.
  const [fetching, setFetching] = useState(null);
  const [selected, setSelected] = useState(rememberedSelection);
  // What was pasted from the browser for Ohio. It holds short-lived codes, so it is kept only while this screen is open.
  const [ohioRequest, setOhioRequest] = useState('');
  const [gettingOhio, setGettingOhio] = useState(false);

  function choose(next) {
    setSelected(next);
    try {
      localStorage.setItem(REMEMBERED, JSON.stringify([...next]));
    } catch {
      /* nowhere to remember it; the ticks still work */
    }
  }

  const toggle = (code) => choose(new Set(selected.has(code) ? [...selected].filter((c) => c !== code) : [...selected, code]));
  const allTicked = selected.size === FETCHABLE.length;
  const toggleAll = () => choose(allTicked ? new Set() : new Set(FETCHABLE.map((state) => state.code)));

  /** In the order they are listed, whatever order they were ticked in. */
  const getSelected = () => onFetchStates(FETCHABLE.filter((state) => selected.has(state.code)).map((state) => state.code), setFetching);
  const fetchingName = STATES.find((state) => state.code === fetching)?.name;

  function handleDrop(event) {
    event.preventDefault();
    setOver(false);
    const paths = [...event.dataTransfer.files]
      .filter((f) => /\.(csv|txt|zip)$/i.test(f.name))
      .map((f) => api.pathForFile(f));
    if (paths.length > 0) onDropPaths(paths);
  }

  const both = Boolean(files.contacts) && files.licenses.length > 0;

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Upload</h1>
          <p className="muted">
            {t('Two downloads: the {staff} you want to check, from CentralReach, and the license list from each state you want to check them in. Which is which is read from the file itself. Nothing about anyone on your staff is ever sent anywhere: the app only downloads the state\'s public license list, and the matching happens on this computer.')}
          </p>
        </div>
      </header>

      <section className="staged-section">
        <h2 className="staged-section-title">{t('{Staff} download from CentralReach')}</h2>
        <ul className="staged-list">
          <li className={files.contacts ? 'staged-file' : 'staged-file map-slot-empty'}>
            <IconUsers size={24} stroke={1.5} aria-hidden="true" />
            <div className="staged-meta">
              <div className="staged-name">{files.contacts ? files.contacts.name : t('{Staff} download')}</div>
              <div className="muted">
                {files.contacts
                  ? `${files.contacts.rowCount.toLocaleString()} ${files.contacts.rowCount === 1 ? 'person' : 'people'} -- everyone in it is checked`
                  : t('No {staff} download yet. Export just the people whose license you want to check.')}
              </div>
            </div>
            {files.contacts && (
              <button className="ghost" onClick={() => onRemove('contacts')} disabled={busy} aria-label={`Remove ${files.contacts.name}`}>
                <IconX size={16} stroke={1.8} />
              </button>
            )}
          </li>
        </ul>
      </section>

      <section className="staged-section">
        <h2 className="staged-section-title">State license lists</h2>
        <div className="lc-sources">
          <div className="lc-source-card">
            <h3>We can get these for you</h3>
            <p className="muted">
              Tick the states you want, then press the button. Each list is the state's own public one, fetched only when you press it.
            </p>
            <ul className="lc-checks">
              {FETCHABLE.map((state) => (
                <li key={state.code}>
                  <label className="lc-check">
                    <input type="checkbox" checked={selected.has(state.code)} onChange={() => toggle(state.code)} disabled={busy} />
                    <span>
                      <strong>{state.name}</strong>
                      <span className="muted lc-check-what">{state.what}</span>
                    </span>
                  </label>
                  {state.byHand && (
                    <details className="lc-byhand">
                      <summary>Or get it yourself</summary>
                      <p className="muted">
                        On the state's{' '}
                        <a href={state.site} target="_blank" rel="noreferrer">
                          {state.siteLabel} <IconExternalLink size={12} stroke={1.8} aria-hidden="true" />
                        </a>{' '}
                        {state.byHand}
                      </p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            <div className="lc-source-actions">
              <button className="primary" onClick={getSelected} disabled={busy || selected.size === 0}>
                <IconCloudDownload size={16} stroke={1.8} aria-hidden="true" />
                {fetching
                  ? `Downloading ${fetchingName ?? ''}…`
                  : selected.size === 0
                    ? 'Get the selected lists'
                    : `Get ${selected.size} ${selected.size === 1 ? 'list' : 'lists'}`}
              </button>
              <button className="ghost" onClick={toggleAll} disabled={busy}>
                {allTicked ? 'Clear all' : 'Select all'}
              </button>
            </div>
          </div>

          <div className="lc-source-card">
            <h3>You'll need to get these yourself</h3>
            <p className="muted">
              These states only give their list to a web browser, or to a request copied from one, so the app can't simply fetch them.
            </p>
            <ul className="lc-manual">
              {BY_HAND.map((state) => (
                <li key={state.code}>
                  <strong>{state.name}</strong>
                  {state.pasteRequest ? (
                    <div className="lc-paste">
                      <ol className="muted">
                        <li>
                          Open Ohio's{' '}
                          <a href={state.site} target="_blank" rel="noreferrer">
                            {state.siteLabel} <IconExternalLink size={12} stroke={1.8} aria-hidden="true" />
                          </a>
                          , choose Individual, Board <em>Psychology Board</em>, License Type <em>Certified Ohio Behavior Analyst</em>, State <em>OH</em>, and press Search.
                        </li>
                        <li>
                          In your browser's developer tools, open Network, right-click the request named <code>apexremote</code>, and choose Copy, then Copy as cURL.
                        </li>
                        <li>Paste it here. The app takes only the two short-lived codes from it, and everything else, cookies included, is thrown away.</li>
                      </ol>
                      <textarea
                        value={ohioRequest}
                        onChange={(e) => setOhioRequest(e.target.value)}
                        placeholder="curl 'https://elicense.ohio.gov/apexremote' …"
                        rows={3}
                        spellCheck={false}
                        disabled={busy}
                        aria-label="The request copied from Ohio's license search"
                      />
                      <button
                        onClick={async () => {
                          setGettingOhio(true);
                          try {
                            await onFetchOhio(ohioRequest);
                          } finally {
                            setGettingOhio(false);
                            setOhioRequest('');
                          }
                        }}
                        disabled={busy || ohioRequest.trim() === ''}
                      >
                        <IconCloudDownload size={16} stroke={1.8} aria-hidden="true" />
                        {gettingOhio ? "Getting Ohio's list -- about two minutes…" : "Get Ohio's list"}
                      </button>
                    </div>
                  ) : (
                    <p className="muted">
                      On the state's{' '}
                      <a href={state.site} target="_blank" rel="noreferrer">
                        {state.siteLabel} <IconExternalLink size={12} stroke={1.8} aria-hidden="true" />
                      </a>{' '}
                      {state.byHand}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <ul className="staged-list">
          {files.licenses.length === 0 && (
            <li className="staged-file map-slot-empty">
              <IconFileZip size={24} stroke={1.5} aria-hidden="true" />
              <div className="staged-meta">
                <div className="staged-name">License lists</div>
                <div className="muted">No license list yet</div>
              </div>
            </li>
          )}
          {files.licenses.map((file) => (
            <li key={file.name} className="staged-file">
              <IconFileZip size={24} stroke={1.5} aria-hidden="true" />
              <div className="staged-meta">
                <div className="staged-name">
                  <span className="lc-tag">{file.jurisdiction}</span> {file.name}
                </div>
                <div className="muted">
                  {file.rowCount.toLocaleString()} {file.rowCount === 1 ? 'license' : 'licenses'}
                  {file.exportDate && ` · data from ${formatIsoDate(file.exportDate)}`}
                  {file.ignored > 0 && ` · ${file.ignored.toLocaleString()} other rows ignored`}
                </div>
              </div>
              <button className="ghost" onClick={() => onRemove('licenses', file.name)} disabled={busy} aria-label={`Remove ${file.name}`}>
                <IconX size={16} stroke={1.8} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {both && (
        <div className="run-row">
          <button className="primary" onClick={onViewReport}>
            View report
            <IconArrowRight size={16} stroke={1.8} aria-hidden="true" />
          </button>
        </div>
      )}

      <div
        className={over ? 'dropzone over' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
      >
        <div className="dropzone-inner">
          <IconTableImport size={36} stroke={1.3} aria-hidden="true" className="dropzone-icon" />
          <h2>{t('Drop the {staff} download and the license lists here')}</h2>
          <p className="muted">CSV or text files, or a state's ZIP as it downloads -- or pick them from your computer</p>
          <button onClick={onPick} disabled={busy}>
            {busy ? 'Reading…' : 'Choose files'}
          </button>
        </div>
      </div>
    </div>
  );
}
