'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export type LicenseSync = {
  jurisdiction_code: string
  last_synced_at: string | null
  last_attempt_at: string | null
  row_count: number | null
  error: string | null
}

const NAMES: Record<string, string> = {
  MA: 'Massachusetts', RI: 'Rhode Island', WA: 'Washington', TX: 'Texas', IL: 'Illinois', CT: 'Connecticut',
  NJ: 'New Jersey', PA: 'Pennsylvania', VT: 'Vermont', AZ: 'Arizona', OH: 'Ohio',
}
const MANUAL = ['AZ', 'OH']
/** A hand-supplied list older than this is worth a nudge. The nightly check also notes the age on each license. */
const STALE_DAYS = 7

const ageDays = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null)
const ageLabel = (iso: string | null) => {
  const d = ageDays(iso)
  if (d === null) return 'Never'
  return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`
}

type Result = { type: 'success' | 'error'; msg: string } | null

const link = 'text-[#025CA8] underline underline-offset-2'

export function LicenseLists({ sync }: { sync: LicenseSync[] }) {
  const router = useRouter()
  const byCode = new Map(sync.map(s => [s.jurisdiction_code, s]))

  const [file, setFile] = useState<File | null>(null)
  const [azBusy, setAzBusy] = useState(false)
  const [azResult, setAzResult] = useState<Result>(null)

  const [ohRequest, setOhRequest] = useState('')
  const [ohBusy, setOhBusy] = useState(false)
  const [ohResult, setOhResult] = useState<Result>(null)

  async function uploadArizona() {
    if (!file) return
    setAzBusy(true); setAzResult(null)
    const form = new FormData()
    form.set('state', 'AZ'); form.set('file', file)
    const res = await fetch('/api/owner/license-lists', { method: 'POST', body: form })
    const json = await res.json().catch(() => ({}))
    setAzBusy(false)
    if (!res.ok) { setAzResult({ type: 'error', msg: json.error ?? 'Upload failed.' }); return }
    setAzResult({ type: 'success', msg: `Arizona updated: ${json.count} licenses on the list, ${json.checked} staff licenses re-checked.` })
    setFile(null); router.refresh()
  }

  async function sweepOhio() {
    setOhBusy(true); setOhResult(null)
    const res = await fetch('/api/owner/license-lists', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'OH', request: ohRequest }),
    })
    const json = await res.json().catch(() => ({ error: 'The request took too long or failed. Check the list above; if Ohio did not update, try again with a fresh copy.' }))
    setOhBusy(false)
    if (!res.ok) { setOhResult({ type: 'error', msg: json.error ?? 'Failed.' }); return }
    setOhResult({ type: 'success', msg: `Ohio updated: ${json.count} licenses on the list, ${json.checked} staff licenses re-checked.` })
    setOhRequest(''); router.refresh()
  }

  const th = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'
  const banner = (r: Result) => r && (
    <p className={`text-sm rounded px-3 py-2 ${r.type === 'success' ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>{r.msg}</p>
  )

  return (
    <div className="space-y-8">
      <div className="rounded-lg border bg-white shadow-sm p-6 space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">How this works</h2>
        <p className="text-sm text-gray-600">
          Seven states&apos; lists are downloaded automatically every night. <strong>Arizona</strong> and <strong>Ohio</strong> can&apos;t be:
          their sites make a person pass a bot check. So you do that part, about once a week, and Training Loop does the rest.
          Each time you update one, everyone licensed in that state is re-checked immediately, and the nightly check keeps using
          that list until you update it again. A license checked against a list more than 3 days old says so.
        </p>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr><th className={th}>State</th><th className={th}>How</th><th className={th}>Licenses on list</th><th className={th}>Last updated</th><th className={th}>Status</th></tr>
          </thead>
          <tbody className="divide-y">
            {['AZ', 'OH', 'MA', 'RI', 'WA', 'TX', 'IL', 'CT', 'NJ', 'PA', 'VT'].map(code => {
              const s = byCode.get(code)
              const manual = MANUAL.includes(code)
              const d = ageDays(s?.last_synced_at ?? null)
              const stale = manual && (d === null || d >= STALE_DAYS)
              return (
                <tr key={code}>
                  <td className="px-4 py-3 font-medium text-gray-900">{NAMES[code]}</td>
                  <td className="px-4 py-3 text-gray-500">{manual ? 'You update it' : 'Automatic, nightly'}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-700">{s?.row_count?.toLocaleString() ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{ageLabel(s?.last_synced_at ?? null)}</td>
                  <td className="px-4 py-3">
                    {s?.error ? <span className="text-red-600" title={s.error}>Last attempt failed: {s.error.slice(0, 80)}</span>
                      : stale ? <span className="text-amber-700 font-medium">{d === null ? 'Needs its first update' : 'Due for an update'}</span>
                      : <span className="text-emerald-700">Up to date</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Arizona */}
      <div className="rounded-lg border bg-white shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Arizona: upload the file</h2>
          <p className="text-xs text-gray-400 mt-0.5">About a minute. Do it weekly.</p>
        </div>
        <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700">
          <li>Open Arizona&apos;s <a className={link} href="https://abpe.portalus.thentiacloud.net/webs/portal/register/" target="_blank" rel="noreferrer">public registry</a>.</li>
          <li>Set <em>License Type</em> to <strong>Behavior Analyst</strong> and press <strong>Search</strong>. Pass the CAPTCHA if it asks.</li>
          <li>Click <strong>Download (.csv)</strong>. It saves a file called <code>Export.csv</code>.</li>
          <li>Choose that file below and click <strong>Upload</strong>.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,text/csv" disabled={azBusy}
            onChange={e => { setFile(e.target.files?.[0] ?? null); setAzResult(null) }}
            className="text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm" />
          <Button onClick={uploadArizona} disabled={!file || azBusy} className="bg-[#025CA8] hover:bg-[#024A87]">
            {azBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : 'Upload'}
          </Button>
        </div>
        {banner(azResult)}
      </div>

      {/* Ohio */}
      <div className="rounded-lg border bg-white shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Ohio: paste a copied request</h2>
          <p className="text-xs text-gray-400 mt-0.5">A couple of minutes to prepare, then Training Loop works for about two minutes. Do it weekly. Ohio&apos;s codes last about 3 days, so a fresh copy is needed each time.</p>
        </div>
        <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700">
          <li>
            In Chrome, open <a className={link} href="https://elicense.ohio.gov/oh_verifylicense" target="_blank" rel="noreferrer">eLicense Ohio&apos;s license search</a>,
            then open the developer tools: right-click the page, choose <strong>Inspect</strong>, and click the <strong>Network</strong> tab. Leave it open.
          </li>
          <li>
            On the page choose <em>Individual</em>, Board <strong>Psychology Board</strong>, License Type <strong>Certified Ohio Behavior Analyst</strong>,
            State <strong>OH</strong>. <strong>Pick the State</strong>: Ohio refuses the search as &ldquo;too broad&rdquo; without one. Pass the CAPTCHA if it asks, then press <strong>Search</strong>.
          </li>
          <li>
            In the Network list, find the request named <code>apexremote</code>. Right-click it, choose <strong>Copy</strong>, then <strong>Copy as cURL</strong>.
          </li>
          <li>
            Paste it into the box below and click <strong>Get Ohio&apos;s list</strong>. You only need to search Ohio: Training Loop searches every other state&apos;s addresses itself. Keep this page open until it finishes (about two minutes).
          </li>
        </ol>
        <p className="text-xs text-gray-500">
          The pasted text includes your browser&apos;s cookies. Training Loop reads only the two short codes it needs and ignores and does not save anything else, and the
          paste is cleared when the update finishes.
        </p>
        <textarea
          value={ohRequest} onChange={e => { setOhRequest(e.target.value); setOhResult(null) }} disabled={ohBusy}
          rows={5} spellCheck={false} aria-label="The request copied from eLicense Ohio"
          placeholder="curl 'https://elicense.ohio.gov/apexremote' …"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-800"
        />
        <Button onClick={sweepOhio} disabled={ohBusy || ohRequest.trim() === ''} className="bg-[#025CA8] hover:bg-[#024A87]">
          {ohBusy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Getting Ohio&apos;s list… about two minutes</> : 'Get Ohio’s list'}
        </Button>
        {banner(ohResult)}
      </div>
    </div>
  )
}
