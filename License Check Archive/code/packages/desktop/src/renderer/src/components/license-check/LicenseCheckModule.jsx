import { useCallback, useEffect, useState } from 'react';
import { api, call } from '../../api.js';
import { useTerms } from '../../terms.jsx';
import LicenseCheckUpload from './LicenseCheckUpload.jsx';
import LicenseCheckReport from './LicenseCheckReport.jsx';
import { STATES } from './states.js';

export const LICENSE_CHECK_TABS = [
  { id: 'upload', label: 'Upload' },
  { id: 'report', label: 'Report' },
];

const EMPTY_REPORT = { people: [], checkedOn: null, dataDate: null, licenseCounts: {} };

/**
 * License Check: the {staff} download from CentralReach and the states' license
 * lists, lined up by name. Owns its state so it survives moving between its
 * tabs.
 */
export default function LicenseCheckModule({ tab, onTab }) {
  const t = useTerms();
  const [files, setFiles] = useState({ contacts: null, licenses: [] });
  const [report, setReport] = useState(EMPTY_REPORT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    call(api.licenseCheck.get)
      .then((data) => {
        setFiles(data.files);
        setReport(data.report);
      })
      .catch((e) => setError(e.message));
  }, []);

  const act = useCallback(async (task) => {
    setBusy(true);
    setError(null);
    try {
      return await task();
    } catch (e) {
      setError(e.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const apply = (state) => {
    setFiles(state.files);
    setReport(state.report);
  };

  /** Files that were read go straight to the report; files that weren't say why. */
  const stage = (read) =>
    act(async () => {
      const state = await read();
      apply(state);
      if (state.failed?.length) {
        setError(state.failed.map((file) => (file.name ? `Couldn't use ${file.name}: ${t(file.reason)}` : t(file.reason))).join('  ·  '));
      } else if (state.files.contacts && state.files.licenses.length > 0) {
        onTab('report');
      }
    });

  /**
   * Fetch the lists for several states, one after another -- one request chain
   * at a time -- and say afterwards what went wrong with any of them. A state
   * that fails does not stop the others. Only when every one came through, and
   * both halves are loaded, does it move on to the report; otherwise the screen
   * stays put so the reasons can be read.
   */
  const fetchStates = (codes, onProgress) =>
    act(async () => {
      const failures = [];
      let last = null;
      try {
        for (const code of codes) {
          onProgress?.(code);
          const state = await call(api.licenseCheck.fetchFromState, code);
          apply(state);
          last = state;
          const label = STATES.find((s) => s.code === code)?.name ?? code;
          for (const file of state.failed ?? []) {
            failures.push(file.name ? `${label}: couldn't use ${file.name}: ${t(file.reason)}` : `${label}: ${t(file.reason)}`);
          }
        }
      } finally {
        onProgress?.(null);
      }
      if (failures.length > 0) setError(failures.join('  ·  '));
      else if (last?.files.contacts && last.files.licenses.length > 0) onTab('report');
    });

  /** Ohio's list, from the request copied out of the person's browser. Same rules as the other states: say what went wrong, go on to the report only if all is loaded. */
  const fetchOhio = (copiedRequest) =>
    act(async () => {
      const state = await call(api.licenseCheck.fetchOhio, copiedRequest);
      apply(state);
      if (state.failed?.length) setError(state.failed.map((file) => `Ohio: ${t(file.reason)}`).join('  ·  '));
      else if (state.files.contacts && state.files.licenses.length > 0) onTab('report');
    });

  return (
    <>
      {error && (
        <div className="banner error" role="alert">
          {error}
          <button className="banner-dismiss" onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {tab === 'upload' && (
        <LicenseCheckUpload
          files={files}
          busy={busy}
          onPick={() => stage(() => call(api.licenseCheck.pick))}
          onDropPaths={(paths) => stage(() => call(api.licenseCheck.open, paths))}
          onFetchStates={fetchStates}
          onFetchOhio={fetchOhio}
          onRemove={(kind, name) => act(async () => apply(await call(api.licenseCheck.remove, kind, name)))}
          onViewReport={() => onTab('report')}
        />
      )}

      {tab === 'report' && (
        <LicenseCheckReport
          ready={Boolean(files.contacts) && files.licenses.length > 0}
          report={report}
          onGoToUpload={() => onTab('upload')}
          onExport={(sheet) => act(() => call(api.licenseCheck.exportCsv, sheet))}
        />
      )}
    </>
  );
}
