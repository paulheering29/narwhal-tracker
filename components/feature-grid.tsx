'use client'

import { Fragment, useState, type ReactNode } from 'react'
import { Icon } from '@/components/marketing-icon'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

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

function Pill({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'amber' | 'blue' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600', green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700',
  }
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>
}

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-3 border-b border-gray-100 py-2 last:border-b-0">{children}</div>
)

type Feature = {
  icon: string
  title: string
  body: string
  more: string
  points: string[]
  preview: ReactNode
}

const features: Feature[] = [
  {
    icon: 'play',
    title: 'Self-paced video courses',
    body: 'Upload a course in sections. Learners can pause and pick up where they left off, but can’t skip ahead or speed through.',
    more: 'Record your in-service once and let everyone take it on their own schedule. Each course is split into sections, and progress is saved as people go.',
    points: [
      'Break a course into sections so it’s easy to resume',
      'Learners can’t skip ahead, so completion means they actually watched',
      'See each person’s progress from the course page',
    ],
    preview: (
      <Frame title="Course · Section progress">
        {[['1. Welcome', 100], ['2. Core concepts', 100], ['3. Case examples', 45], ['4. Wrap-up', 0]].map(([n, p]) => (
          <Row key={n as string}>
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
      'Put courses in the order people should take them',
      'Assign the whole path to a person in one click',
      'Later courses stay locked until the earlier ones are done',
    ],
    preview: (
      <Frame title="Path · New RBT Onboarding">
        {[['Welcome to the team', 'Complete', 'green'], ['Ethics basics', 'In progress', 'blue'], ['Data collection', 'Locked', 'gray']].map(([n, s, t], i) => (
          <Row key={n}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">{i + 1}</span>
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
      'Add a short quiz to any course',
      'The certificate is issued automatically on a pass',
      'Every attempt is saved, so you have a record',
    ],
    preview: (
      <Frame title="Quiz · Attempts">
        {[['Attempt 1', '60%', 'Not passed', 'amber'], ['Attempt 2', '90%', 'Passed', 'green']].map(([a, sc, r, t]) => (
          <Row key={a}>
            <span className="flex-1">{a}</span>
            <span className="tabular-nums text-gray-500">{sc}</span>
            <Pill tone={t as 'amber' | 'green'}>{r}</Pill>
          </Row>
        ))}
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">Certificate issued</p>
      </Frame>
    ),
  },
  {
    icon: 'fileCert',
    title: 'Certificates your way',
    body: 'Choose from several certificate styles or the BACB in-service form, signed by the trainer and branded with your logo.',
    more: 'Certificates come out looking like they’re from your organization, with the trainer’s signature already on them.',
    points: [
      'Pick the certificate style that fits',
      'Use the BACB in-service form when you need it',
      'Your logo and the trainer’s signature are added for you',
    ],
    preview: (
      <Frame title="Certificate preview">
        <div className="rounded-lg border-2 border-double border-gray-300 p-5 text-center">
          <div className="mx-auto mb-2 h-6 w-16 rounded bg-gray-100" />
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
      'CEUs are tracked by type, not just as one total',
      'Ethics and supervision minimums sit next to the overall progress',
      'No surprises at recertification',
    ],
    preview: (
      <Frame title="BCBA · Current cycle">
        {[['Total CEUs', 28, 32, '#025CA8'], ['Ethics', 4, 4, '#3FAD46'], ['Supervision', 1, 3, '#d97706']].map(([n, v, g, c]) => (
          <Row key={n as string}>
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
      'Works with a PDF or a photo of the certificate',
      'Title, date, provider and hours are read into the form',
      'You check it and save; AI never saves anything on its own',
      'Optional review step so your team can approve entries',
    ],
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
      'One record per state license, next to the BACB certification',
      'Renewal dates, state CE hours and required topics',
      'Email reminders before anything expires',
    ],
    preview: (
      <Frame title="Licenses">
        {[['BACB certification', 'Renews Dec 31, 2026', 'green', 'Active'], ['State license · OH', 'Renews Jun 30, 2027', 'green', 'Active'], ['State license · PA', 'Renews Nov 15, 2026', 'amber', 'Due soon']].map(([n, d, t, s]) => (
          <Row key={n}>
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
      'Tag each training with a topic',
      'A grid shows who has completed which topics',
      'Course ratings and written comments, summarized with AI',
    ],
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
      'Each organization’s data is kept completely separate',
      'Roles control who can run trainings, manage staff or change settings',
      'Learners see their own records, not everyone’s',
    ],
    preview: (
      <Frame title="Roles">
        {[['Account Owner', 'Everything'], ['Admin', 'Staff and settings'], ['Trainer', 'Run trainings'], ['Learner', 'Own records']].map(([r, d]) => (
          <Row key={r}>
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

      <Sheet open={open !== null} onOpenChange={o => { if (!o) setIndex(null) }}>
        <SheetContent className="sm:max-w-xl">
          {open && (
            <>
              <SheetHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50" style={{ color: BLUE_TEXT }}>
                  <Icon name={open.icon} className="h-5 w-5" />
                </div>
                <SheetTitle className="text-xl font-bold">{open.title}</SheetTitle>
              </SheetHeader>
              {/* key resets the scroll position when moving to the next feature */}
              <div key={open.title} className="flex-1 space-y-6 overflow-y-auto px-6 pb-8">
                <p className="leading-relaxed text-gray-600">{open.more}</p>
                <ul className="space-y-2.5 text-sm text-gray-700">
                  {open.points.map(p => (
                    <li key={p} className="flex gap-3">
                      <Icon name="checklist" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                      {p}
                    </li>
                  ))}
                </ul>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">A look inside</p>
                  {open.preview}
                </div>
              </div>
              {next && (
                <button
                  type="button"
                  onClick={() => setIndex(((index ?? 0) + 1) % features.length)}
                  className="flex items-center justify-between gap-4 border-t border-gray-100 px-6 py-4 text-left transition-colors hover:bg-gray-50"
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
        </SheetContent>
      </Sheet>
    </>
  )
}
