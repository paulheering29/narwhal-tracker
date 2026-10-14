'use client'

import { Fragment, useState, type ReactNode } from 'react'
import { Icon } from '@/components/marketing-icon'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const BLUE_TEXT = 'var(--brand-text)'

// Sample data only: these are illustrations of the screens, not real records.
function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-gray-300" />
        <span className="h-2 w-2 rounded-full bg-gray-300" />
        <span className="h-2 w-2 rounded-full bg-gray-300" />
        <span className="ml-2 text-[11px] font-medium text-gray-500">{title}</span>
      </div>
      <div className="p-4 text-xs text-gray-700">{children}</div>
    </div>
  )
}

function Bar({ pct, color = '#025CA8' }: { pct: number; color?: string }) {
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function Pill({ children, tone = 'gray', icon }: { children: ReactNode; tone?: 'gray' | 'green' | 'amber' | 'blue'; icon?: string }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600', green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>
      {icon && <Icon name={icon} className="h-3 w-3" />}
      {children}
    </span>
  )
}

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-3 border-b border-gray-100 py-2 last:border-b-0">{children}</div>
)

// "How it works" strip at the bottom of each modal: step, arrow, step, arrow, step.
function FlowStep({ icon, label, art }: { icon?: string; label: string; art?: ReactNode }) {
  return (
    <div className="flex w-36 flex-col items-center gap-3 text-center">
      {art ?? (
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-blue-100" style={{ color: BLUE_TEXT }}>
          <Icon name={icon ?? 'checklist'} className="h-9 w-9" />
        </div>
      )}
      <p className="text-sm font-medium text-gray-700">{label}</p>
    </div>
  )
}

function FlowArrow({ icon }: { icon?: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 text-blue-300 max-sm:rotate-90">
      {icon && <Icon name={icon} className="h-4 w-4 text-amber-400 max-sm:-rotate-90" />}
      <Icon name="arrowRight" className="h-7 w-7" />
    </div>
  )
}

function Flow({ steps }: { steps: { icon: string; label: string }[] }) {
  return (
    <>
      {steps.map((st, i) => (
        <Fragment key={st.label}>
          {i > 0 && <FlowArrow />}
          <FlowStep icon={st.icon} label={st.label} />
        </Fragment>
      ))}
    </>
  )
}

// Hand-drawn certificate and filled-in form for the outside-trainings flow.
function MiniCertificate() {
  return (
    <div className="flex h-24 w-20 flex-col items-center rounded-lg border-2 border-double border-gray-300 bg-white p-2 shadow-md">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50" style={{ color: BLUE_TEXT }}><Icon name="certificate" className="h-3.5 w-3.5" /></span>
      <span className="mt-2 h-1.5 w-12 rounded bg-gray-300" />
      <span className="mt-1.5 h-1 w-14 rounded bg-gray-200" />
      <span className="mt-1 h-1 w-10 rounded bg-gray-200" />
      <span className="mt-auto h-px w-10 bg-gray-300" />
    </div>
  )
}

function MiniForm() {
  return (
    <div className="relative flex h-24 w-28 flex-col justify-center gap-1.5 rounded-lg bg-white p-3 shadow-md ring-1 ring-blue-100">
      {[10, 14, 8, 6].map((w, i) => (
        <span key={i} className="h-3 rounded border border-gray-200 bg-blue-50/60 px-1"><span className="block h-1 rounded bg-gray-400" style={{ width: `${w * 6}%`, marginTop: 3 }} /></span>
      ))}
      <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow"><Icon name="circleCheck" className="h-4 w-4" /></span>
    </div>
  )
}

type Feature = {
  icon: string
  title: string
  body: string
  more: string
  points: { icon: string; text: string }[]
  preview: ReactNode
  flow: ReactNode
}

const features: Feature[] = [
  {
    icon: 'play',
    title: 'Self-paced video courses',
    body: 'Upload a course in sections. Learners can pause and pick up where they left off, but can’t skip ahead or speed through.',
    more: 'Record your in-service once and let everyone take it on their own schedule. Each course is split into sections, and progress is saved as people go.',
    points: [
      { icon: 'listNumbers', text: 'Break a course into sections so it’s easy to resume' },
      { icon: 'lock', text: 'Learners can’t skip ahead, so completion means they actually watched' },
      { icon: 'chartBar', text: 'See each person’s progress from the course page' },
    ],
    flow: <Flow steps={[{ icon: 'listNumbers', label: 'Upload in sections' }, { icon: 'play', label: 'Learners watch' }, { icon: 'circleCheck', label: 'Progress is saved' }]} />,
    preview: (
      <Frame title="Course · Section progress">
        {[['1. Welcome', 100], ['2. Core concepts', 100], ['3. Case examples', 45], ['4. Wrap-up', 0]].map(([n, p]) => (
          <Row key={n as string}>
            <Icon name={p === 100 ? 'circleCheck' : p === 0 ? 'lock' : 'play'} className={`h-4 w-4 shrink-0 ${p === 100 ? 'text-emerald-500' : p === 0 ? 'text-gray-300' : 'text-blue-500'}`} />
            <span className="w-32 shrink-0">{n}</span>
            <Bar pct={p as number} />
            <span className="w-8 text-right tabular-nums text-gray-500">{p}%</span>
          </Row>
        ))}
      </Frame>
    ),
  },
  {
    icon: 'route',
    title: 'Learning paths',
    body: 'Bundle self-paced courses into an ordered path, like New RBT Onboarding, and assign the whole thing in one click. Each course unlocks as the one before it is finished.',
    more: 'Onboarding shouldn’t be a spreadsheet of links. Build a path once, then assign it to a new hire and the order takes care of itself.',
    points: [
      { icon: 'listNumbers', text: 'Put courses in the order people should take them' },
      { icon: 'userCheck', text: 'Assign the whole path to a person in one click' },
      { icon: 'lock', text: 'Later courses stay locked until the earlier ones are done' },
    ],
    flow: <Flow steps={[{ icon: 'listNumbers', label: 'Build the path' }, { icon: 'userCheck', label: 'Assign in one click' }, { icon: 'lock', label: 'Courses unlock in order' }]} />,
    preview: (
      <Frame title="Path · New RBT Onboarding">
        {[['Welcome to the team', 'Complete', 'green', 'circleCheck'], ['Ethics basics', 'In progress', 'blue', 'play'], ['Data collection', 'Locked', 'gray', 'lock']].map(([n, s, t, ic]) => (
          <Row key={n}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"><Icon name={ic} className="h-3.5 w-3.5" /></span>
            <span className="flex-1">{n}</span>
            <Pill tone={t as 'green' | 'blue' | 'gray'}>{s}</Pill>
          </Row>
        ))}
      </Frame>
    ),
  },
  {
    icon: 'clipboard',
    title: 'Quizzes that close the loop',
    body: 'A short quiz at the end of each course. Pass it and the certificate is issued — every attempt is kept for your records.',
    more: 'Watching a video isn’t the same as learning from it. A quiz at the end confirms understanding, and passing is what triggers the certificate.',
    points: [
      { icon: 'pencil', text: 'Add a short quiz to any course' },
      { icon: 'fileCert', text: 'The certificate is issued automatically on a pass' },
      { icon: 'file', text: 'Every attempt is saved, so you have a record' },
    ],
    flow: <Flow steps={[{ icon: 'play', label: 'Finish the course' }, { icon: 'pencil', label: 'Take the quiz' }, { icon: 'fileCert', label: 'Certificate issued' }]} />,
    preview: (
      <Frame title="Quiz · Attempts">
        {[['Attempt 1', '60%', 'Not passed', 'amber'], ['Attempt 2', '90%', 'Passed', 'green']].map(([a, sc, r, t]) => (
          <Row key={a}>
            <span className="flex-1">{a}</span>
            <span className="tabular-nums text-gray-500">{sc}</span>
            <Pill tone={t as 'amber' | 'green'}>{r}</Pill>
          </Row>
        ))}
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
          <Icon name="fileCert" className="h-4 w-4" /> Certificate issued
        </p>
      </Frame>
    ),
  },
  {
    icon: 'fileCert',
    title: 'Certificates your way',
    body: 'Choose from several certificate styles or the BACB in-service form, signed by the trainer and branded with your logo.',
    more: 'Certificates come out looking like they’re from your organization, with the trainer’s signature already on them.',
    points: [
      { icon: 'palette', text: 'Pick the certificate style that fits' },
      { icon: 'file', text: 'Use the BACB in-service form when you need it' },
      { icon: 'signature', text: 'Your logo and the trainer’s signature are added for you' },
    ],
    flow: <Flow steps={[{ icon: 'palette', label: 'Pick a style' }, { icon: 'signature', label: 'Logo and signature added' }, { icon: 'file', label: 'Download or email' }]} />,
    preview: (
      <Frame title="Certificate preview">
        <div className="rounded-lg border-2 border-double border-gray-300 p-5 text-center">
          <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-50" style={{ color: BLUE_TEXT }}><Icon name="certificate" className="h-4 w-4" /></div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400">Certificate of Completion</p>
          <p className="my-2 text-base font-semibold text-gray-900">Alex Rivera</p>
          <p className="text-gray-500">Ethics basics · 1.0 hour</p>
          <div className="mt-4 h-px w-24 bg-gray-300 mx-auto" />
          <p className="mt-1 text-[10px] text-gray-400">Trainer signature</p>
        </div>
      </Frame>
    ),
  },
  {
    icon: 'scale',
    title: 'Ethics & supervision minimums',
    body: 'BCBA CEUs are tracked by type, so ethics and supervision requirements show up alongside the total — not as a surprise at recertification.',
    more: 'A BCBA can hit their total CEUs and still be short on ethics or supervision. Each type is tracked on its own so the gap is visible long before the deadline.',
    points: [
      { icon: 'chartBar', text: 'CEUs are tracked by type, not just as one total' },
      { icon: 'scale', text: 'Ethics and supervision minimums sit next to the overall progress' },
      { icon: 'target', text: 'No surprises at recertification' },
    ],
    flow: <Flow steps={[{ icon: 'certificate', label: 'CEUs are logged' }, { icon: 'scale', label: 'Sorted by type' }, { icon: 'chartBar', label: 'Gaps show up early' }]} />,
    preview: (
      <Frame title="BCBA · Current cycle">
        {[['Total CEUs', 28, 32, '#025CA8', 'chartBar'], ['Ethics', 4, 4, '#3FAD46', 'scale'], ['Supervision', 1, 3, '#d97706', 'userCheck']].map(([n, v, g, c, ic]) => (
          <Row key={n as string}>
            <Icon name={ic as string} className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="w-24 shrink-0">{n}</span>
            <Bar pct={((v as number) / (g as number)) * 100} color={c as string} />
            <span className="w-10 text-right tabular-nums text-gray-500">{v}/{g}</span>
          </Row>
        ))}
      </Frame>
    ),
  },
  {
    icon: 'sparkles',
    title: 'Outside trainings, filled in for you',
    body: 'Upload a PDF or a photo of a certificate and AI reads the details into the form. You check it and save — no retyping, and an optional review step for your team.',
    more: 'When someone completes a training elsewhere, they upload the certificate and the form fills itself in. Nothing is saved until a person confirms it.',
    points: [
      { icon: 'photo', text: 'Works with a PDF or a photo of the certificate' },
      { icon: 'sparkles', text: 'Title, date, provider and hours are read into the form' },
      { icon: 'circleCheck', text: 'You check it and save; AI never saves anything on its own' },
      { icon: 'eye', text: 'Optional review step so your team can approve entries' },
    ],
    flow: <><FlowStep label="Upload the certificate" art={<MiniCertificate />} /><FlowArrow icon="sparkles" /><FlowStep label="The form fills itself in" art={<MiniForm />} /></>,
    preview: (
      <Frame title="Add outside training">
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
          <Icon name="sparkles" className="h-3.5 w-3.5" /> Filled in from your certificate. Please check.
        </p>
        {[['Title', 'Functional Behavior Assessment'], ['Provider', 'Example Training Co.'], ['Date', 'Mar 4, 2026'], ['Hours', '2.0']].map(([k, v]) => (
          <div key={k} className="mb-2">
            <p className="mb-0.5 text-[10px] text-gray-400">{k}</p>
            <p className="rounded border border-gray-200 px-2 py-1">{v}</p>
          </div>
        ))}
      </Frame>
    ),
  },
  {
    icon: 'calendar',
    title: 'State licensure tracking',
    body: 'Track BCBA state licenses next to the BACB certification: renewal dates, state CE hours, and required topics, with email reminders before anything expires.',
    more: 'Many BCBAs hold a state license on top of their certification, each with its own renewal date and CE rules. Keep them all in one place.',
    points: [
      { icon: 'file', text: 'One record per state license, next to the BACB certification' },
      { icon: 'calendar', text: 'Renewal dates, state CE hours and required topics' },
      { icon: 'bell', text: 'Email reminders before anything expires' },
    ],
    flow: <Flow steps={[{ icon: 'file', label: 'Add each license' }, { icon: 'calendar', label: 'Renewal dates tracked' }, { icon: 'bell', label: 'Reminder before it expires' }]} />,
    preview: (
      <Frame title="Licenses">
        {[['BACB certification', 'Renews Dec 31, 2026', 'green', 'Active', 'certificate'], ['State license · OH', 'Renews Jun 30, 2027', 'green', 'Active', 'calendar'], ['State license · PA', 'Renews Nov 15, 2026', 'amber', 'Due soon', 'bell']].map(([n, d, t, s, ic]) => (
          <Row key={n}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><Icon name={ic} className="h-4 w-4" /></span>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{n}</p>
              <p className="text-gray-500">{d}</p>
            </div>
            <Pill tone={t as 'green' | 'amber'}>{s}</Pill>
          </Row>
        ))}
      </Frame>
    ),
  },
  {
    icon: 'checklist',
    title: 'Topic coverage & insights',
    body: 'Tag trainings by topic to spot gaps, and see course ratings and quiz results to find what needs reteaching.',
    more: 'See which topics your team has covered and which they haven’t, then check what learners thought of each course to decide what to run again.',
    points: [
      { icon: 'tag', text: 'Tag each training with a topic' },
      { icon: 'checklist', text: 'A grid shows who has completed which topics' },
      { icon: 'message', text: 'Course ratings and written comments, summarized with AI' },
    ],
    flow: <Flow steps={[{ icon: 'tag', label: 'Tag each training' }, { icon: 'checklist', label: 'See who’s covered' }, { icon: 'target', label: 'Reteach the gaps' }]} />,
    preview: (
      <Frame title="Topic coverage">
        <div className="grid grid-cols-[1fr_repeat(3,2.25rem)] items-center gap-y-2">
          <span />
          {['Ethics', 'Safety', 'Data'].map(t => <span key={t} className="text-center text-[10px] text-gray-400">{t}</span>)}
          {[['Alex R.', [1, 1, 0]], ['Sam T.', [1, 0, 0]], ['Jordan K.', [1, 1, 1]]].map(([n, cells]) => (
            <Fragment key={n as string}>
              <span>{n as string}</span>
              {(cells as number[]).map((c, i) => (
                <span key={`${n}-${i}`} className={`mx-auto h-4 w-4 rounded ${c ? 'bg-emerald-400' : 'bg-gray-100'}`} />
              ))}
            </Fragment>
          ))}
        </div>
      </Frame>
    ),
  },
  {
    icon: 'shield',
    title: 'Private to your organization',
    body: 'Every organization’s data is completely separate. Roles control who can run trainings, manage staff, or change settings.',
    more: 'Your staff, records and certificates are visible only to your organization. Within it, roles decide who can do what.',
    points: [
      { icon: 'building', text: 'Each organization’s data is kept completely separate' },
      { icon: 'shield', text: 'Roles control who can run trainings, manage staff or change settings' },
      { icon: 'eye', text: 'Learners see their own records, not everyone’s' },
    ],
    flow: <Flow steps={[{ icon: 'building', label: 'Your organization' }, { icon: 'shield', label: 'Roles decide access' }, { icon: 'eye', label: 'People see what’s theirs' }]} />,
    preview: (
      <Frame title="Roles">
        {[['Account Owner', 'Everything', 'shield'], ['Admin', 'Staff and settings', 'userCheck'], ['Trainer', 'Run trainings', 'presentation'], ['Learner', 'Own records', 'school']].map(([r, d, ic]) => (
          <Row key={r}>
            <Icon name={ic} className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="w-28 shrink-0 font-medium text-gray-900">{r}</span>
            <span className="text-gray-500">{d}</span>
          </Row>
        ))}
      </Frame>
    ),
  },
]

export function FeatureGrid() {
  const [index, setIndex] = useState<number | null>(null)
  const open = index === null ? null : features[index]
  const next = index === null ? null : features[(index + 1) % features.length]

  return (
    <>
      <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(f => (
          <div key={f.title}>
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50" style={{ color: BLUE_TEXT }}>
                <Icon name={f.icon} className="h-5 w-5" />
              </div>
              <button
                type="button"
                onClick={() => setIndex(features.indexOf(f))}
                aria-label={`Learn more about ${f.title}`}
                className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <Icon name="expand" className="h-4 w-4" />
              </button>
            </div>
            <h3 className="mb-2 font-semibold">{f.title}</h3>
            <p className="text-sm leading-relaxed text-gray-600">{f.body}</p>
          </div>
        ))}
      </div>

      <Dialog open={open !== null} onOpenChange={o => { if (!o) setIndex(null) }}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-none flex-col gap-0 overflow-hidden bg-white p-0 sm:max-w-none md:h-[75vh] md:w-[75vw]">
          {open && (
            <>
              {/* key resets the scroll position when moving to the next feature */}
              <div key={open.title} className="flex-1 overflow-y-auto p-6 sm:p-10">
                <DialogHeader className="-mx-6 -mt-6 mb-8 flex-row items-center gap-5 bg-gradient-to-br from-blue-50 via-white to-emerald-50 px-6 py-8 sm:-mx-10 sm:-mt-10 sm:px-10">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-blue-100" style={{ color: BLUE_TEXT }}>
                    <Icon name={open.icon} className="h-8 w-8" />
                  </div>
                  <DialogTitle className="text-3xl font-bold leading-tight tracking-tight">{open.title}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="space-y-6">
                    <p className="leading-relaxed text-gray-600">{open.more}</p>
                    <ul className="space-y-3 text-sm text-gray-700">
                      {open.points.map(p => (
                        <li key={p.text} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50" style={{ color: BLUE_TEXT }}>
                            <Icon name={p.icon} className="h-[18px] w-[18px]" />
                          </span>
                          {p.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">A look inside</p>
                    {open.preview}
                  </div>
                </div>
                <div className="mt-10 rounded-2xl bg-gradient-to-br from-blue-50/70 to-emerald-50/50 px-6 py-8">
                  <p className="mb-6 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">How it works</p>
                  <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:items-start sm:gap-6">
                    {open.flow}
                  </div>
                </div>
              </div>
              {next && (
                <button
                  type="button"
                  onClick={() => setIndex(((index ?? 0) + 1) % features.length)}
                  className="flex items-center justify-between gap-4 border-t border-gray-100 px-6 py-4 text-left transition-colors hover:bg-gray-50 sm:px-10"
                >
                  <span>
                    <span className="block text-xs text-gray-400">Next</span>
                    <span className="text-sm font-semibold text-gray-900">{next.title}</span>
                  </span>
                  <Icon name="arrowRight" className="h-5 w-5 shrink-0" />
                </button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
