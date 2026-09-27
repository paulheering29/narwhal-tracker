import Image from 'next/image'

const BLUE  = '#025CA8'
const GREEN = '#3FAD46'

// The app lives on its own host (see middleware.ts), so sign-in links are absolute.
const LOGIN_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login`

// Tabler icon outlines (tabler.io/icons), inlined as path data so the
// landing page doesn't pull in an icon package the rest of the app doesn't use.
const ICONS: Record<string, string[]> = {
  users:        ['M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', 'M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2', 'M16 3.13a4 4 0 0 1 0 7.75', 'M21 21v-2a4 4 0 0 0 -3 -3.85'],
  presentation: ['M3 4l18 0', 'M4 4v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-10', 'M12 16l0 4', 'M9 20l6 0', 'M8 12l3 -3l2 2l3 -3'],
  play:         ['M7 4v16l13 -8l-13 -8'],
  certificate:  ['M12 15a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M13 17.5v4.5l2 -1.5l2 1.5v-4.5', 'M10 19h-5a2 2 0 0 1 -2 -2v-10c0 -1.1 .9 -2 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -1 1.73', 'M6 9l12 0', 'M6 12l3 0', 'M6 15l2 0'],
  chart:        ['M4 19l16 0', 'M4 15l4 -6l4 2l4 -5l4 4'],
  calendar:     ['M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12', 'M16 3v4', 'M8 3v4', 'M4 11h16', 'M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'],
  shield:       ['M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3', 'M11 11a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M12 12l0 2.5'],
  fileCert:     ['M14 3v4a1 1 0 0 0 1 1h4', 'M5 8v-3a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5', 'M3 14a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', 'M4.5 17l-1.5 5l3 -1.5l3 1.5l-1.5 -5'],
  clipboard:    ['M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2', 'M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2', 'M9 14l2 2l4 -4'],
  school:       ['M22 9l-10 -4l-10 4l10 4l10 -4v6', 'M6 10.6v5.4a6 3 0 0 0 12 0v-5.4'],
  refresh:      ['M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4', 'M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'],
  arrowRight:   ['M5 12l14 0', 'M13 18l6 -6', 'M13 6l6 6'],
  userCheck:    ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4', 'M15 19l2 2l4 -4'],
  checklist:    ['M9.615 20h-2.615a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8', 'M14 19l2 2l4 -4', 'M9 8h4', 'M9 12h2'],
}

function Icon({ name, className = 'h-6 w-6' }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICONS[name].map(d => <path key={d} d={d} />)}
    </svg>
  )
}

const steps = [
  {
    icon: 'users',
    title: 'Add your team',
    body: 'Import your RBTs and BCBAs from a spreadsheet — certification numbers, cycle dates, preferred names and all.',
  },
  {
    icon: 'presentation',
    title: 'Deliver training',
    body: 'Run live in-services and mark attendance, or assign self-paced video courses people watch on their own time.',
  },
  {
    icon: 'certificate',
    title: 'Certify automatically',
    body: 'PDU and CEU certificates are generated with your trainer’s signature and logo. Download, email, or grab the whole class as a ZIP.',
  },
  {
    icon: 'chart',
    title: 'Track every cycle',
    body: 'PDUs and CEUs roll up against each person’s certification cycle, so everyone can see who’s on pace and who needs a nudge.',
  },
] as const

const features = [
  {
    icon: 'play',
    title: 'Self-paced video courses',
    body: 'Upload a course in sections. Learners can pause and pick up where they left off, but can’t skip ahead or speed through.',
  },
  {
    icon: 'clipboard',
    title: 'Quizzes that close the loop',
    body: 'A short quiz at the end of each course. Pass it and the certificate is issued — every attempt is kept for your records.',
  },
  {
    icon: 'fileCert',
    title: 'Certificates your way',
    body: 'Choose from several certificate styles or the BACB in-service form, signed by the trainer and branded with your logo.',
  },
  {
    icon: 'calendar',
    title: 'Renewals you see coming',
    body: 'Expiring certifications and cycle deadlines surface on the dashboard well before they become a problem.',
  },
  {
    icon: 'checklist',
    title: 'Topic coverage & insights',
    body: 'Tag trainings by topic to spot gaps, and see course ratings and quiz results to find what needs reteaching.',
  },
  {
    icon: 'shield',
    title: 'Private to your organization',
    body: 'Every organization’s data is completely separate. Roles control who can run trainings, manage staff, or change settings.',
  },
] as const

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-8 h-16">
          <Image
            src="/training-loop-wordmark.png"
            alt="Training Loop"
            width={2195}
            height={340}
            className="h-6 sm:h-7 w-auto shrink-0"
            priority
          />
          <nav className="flex items-center gap-1 sm:gap-6">
            <a href="#how-it-works" className="hidden sm:inline text-sm font-medium text-gray-600 hover:text-gray-900">How it works</a>
            <a href="#features" className="hidden sm:inline text-sm font-medium text-gray-600 hover:text-gray-900">Features</a>
            <a
              href={LOGIN_URL}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: BLUE }}
            >
              Sign in
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-8 pt-16 sm:pt-24 pb-20">
        <div className="max-w-6xl mx-auto grid gap-14 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800 mb-6">
              <Icon name="refresh" className="h-3.5 w-3.5" />
              For RBTs, BCBAs, and the teams that train them
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08] mb-6">
              Earn PDUs & CEUs.<br />
              <span style={{ color: BLUE }}>Track your certification.</span><br />
              <span style={{ color: GREEN }}>Stay in the loop.</span>
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed mb-10 max-w-xl">
              Training Loop is where RBTs earn their PDUs and BCBAs earn their CEUs — through
              live trainings and self-paced video courses — and where everyone can see exactly
              where they stand before their certification comes up for renewal.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={LOGIN_URL}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: BLUE }}
              >
                Sign in
                <Icon name="arrowRight" className="h-4 w-4" />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                See how it works
              </a>
            </div>
          </div>

          {/* Product glimpse — an illustrative RBT dashboard, not live data */}
          <div className="relative" aria-hidden="true">
            <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-blue-50 via-white to-green-50" />
            <div className="relative rounded-2xl border border-gray-200 bg-white shadow-xl p-6 sm:p-7">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs font-medium text-gray-500">Welcome back</p>
                  <p className="text-lg font-semibold">Jordan Rivera, RBT</p>
                </div>
                <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">On pace</span>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">PDUs this cycle</p>
                  <p className="text-sm text-gray-500"><span className="text-2xl font-bold text-gray-900">8</span> / 12</p>
                </div>
                <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: '66%', backgroundColor: GREEN }} />
                </div>
                <p className="mt-2 text-xs text-gray-500">6.5 needed by today to stay on pace</p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500 mb-1">Certification expires</p>
                  <p className="font-semibold">Mar 14, 2027</p>
                  <p className="text-xs text-gray-500">168 days</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500 mb-1">Courses assigned</p>
                  <p className="font-semibold">2 to finish</p>
                  <p className="text-xs text-gray-500">1 in progress</p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4 flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: BLUE }}>
                  <Icon name="play" className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">Ethics & Professional Conduct</p>
                  <p className="text-xs text-gray-500">Section 3 of 4 · Quiz unlocks after section 4</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-16 bg-gray-50 border-y border-gray-200 px-4 sm:px-8 py-20 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-14">
            <p className="text-sm font-semibold mb-3" style={{ color: BLUE }}>How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">One loop, every cycle.</h2>
            <p className="text-gray-600 text-lg">
              Set your team up once. From then on, every training feeds straight into
              certificates and PDU or CEU progress — and the loop starts again each cycle.
            </p>
          </div>

          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon, title, body }, i) => (
              <li key={title} className="relative rounded-2xl bg-white border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                    style={{ backgroundColor: i === steps.length - 1 ? GREEN : BLUE }}
                  >
                    <Icon name={icon} className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-semibold text-gray-400">STEP {i + 1}</span>
                </div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>

          <p className="mt-8 flex items-center justify-center gap-2 text-sm font-medium text-gray-500">
            <Icon name="refresh" className="h-4 w-4" />
            Then it repeats — every RBT and BCBA, every cycle.
          </p>
        </div>
      </section>

      {/* ── Two audiences ─────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-8 py-20 sm:py-24">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-700 mb-5">
              <Icon name="userCheck" />
            </div>
            <h3 className="text-xl font-semibold mb-3">For RBTs</h3>
            <ul className="space-y-3 text-gray-600">
              {[
                'A personal dashboard showing exactly how many PDUs you have — and how many you need',
                'Watch assigned courses on your own schedule, on any device',
                'Download your certificates any time, without chasing anyone',
                'Know how many days until your certification expires',
              ].map(t => (
                <li key={t} className="flex gap-3"><Icon name="checklist" className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 mb-5" style={{ color: BLUE }}>
              <Icon name="certificate" />
            </div>
            <h3 className="text-xl font-semibold mb-3">For BCBAs</h3>
            <ul className="space-y-3 text-gray-600">
              {[
                'Earn CEUs through live trainings and self-paced courses',
                'See the CEUs you’ve earned against what your recertification requires',
                'Keep every CEU certificate in one place, ready when you recertify',
                'Know how many days until your certification renews',
              ].map(t => (
                <li key={t} className="flex gap-3"><Icon name="checklist" className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 mb-5" style={{ color: BLUE }}>
              <Icon name="school" />
            </div>
            <h3 className="text-xl font-semibold mb-3">For training coordinators</h3>
            <ul className="space-y-3 text-gray-600">
              {[
                'Schedule trainings, take attendance, and issue certificates in a few clicks',
                'Upload video courses once and assign them to anyone who needs them',
                'See every RBT’s PDUs and every BCBA’s CEUs, plus upcoming expirations, at a glance',
                'Keep certification cycle documents together, ready for an audit',
              ].map(t => (
                <li key={t} className="flex gap-3"><Icon name="checklist" className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-16 px-4 sm:px-8 pb-20 sm:pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-12">
            <p className="text-sm font-semibold mb-3" style={{ color: BLUE }}>Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything the loop needs.</h2>
          </div>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon, title, body }) => (
              <div key={title}>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 mb-4" style={{ color: BLUE }}>
                  <Icon name={icon} className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-8 pb-24">
        <div className="max-w-6xl mx-auto rounded-3xl px-6 sm:px-12 py-14 text-center text-white" style={{ backgroundColor: BLUE }}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            PDUs, CEUs, and certificates — finally in one place.
          </h2>
          <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
            Sign in to pick up where you left off.
          </p>
          <a
            href={LOGIN_URL}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold bg-white transition-opacity hover:opacity-90"
            style={{ color: BLUE }}
          >
            Sign in to Training Loop
            <Icon name="arrowRight" className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 px-4 sm:px-8 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Image src="/training-loop-wordmark.png" alt="Training Loop" width={2195} height={340} className="h-5 w-auto" />
          <p className="text-xs text-gray-500">© {new Date().getFullYear()} Training Loop</p>
        </div>
      </footer>

    </div>
  )
}
