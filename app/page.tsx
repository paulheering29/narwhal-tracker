import Image from 'next/image'
import { MarketingNav } from '@/components/marketing-nav'
import { PriceCalculator } from '@/components/price-calculator'
import { TRIAL_DAYS, CONTACT_EMAIL, formatMoney, lockInLine, monthlyTotalCents } from '@/lib/pricing'
import { getCurrentOffer } from '@/lib/billing'
import { Icon } from '@/components/marketing-icon'
import { FeatureGrid } from '@/components/feature-grid'

const BLUE  = '#025CA8'
// Blue used as text or an outline; lightened in dark mode (see --brand-text in globals.css). Fills keep BLUE.
const BLUE_TEXT = 'var(--brand-text)'
const GREEN = '#3FAD46'

// The app lives on its own host (see middleware.ts), so sign-in links are absolute.
const LOGIN_URL  = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login`
const SIGNUP_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/signup`

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
    title: 'Generate certificates',
    body: 'PDU and CEU certificates are generated with your trainer’s signature and logo. Download, email, or grab the whole class as a ZIP.',
  },
  {
    icon: 'chart',
    title: 'Track every cycle',
    body: 'PDUs and CEUs roll up against each person’s certification cycle, so everyone can see who’s on pace and who needs a nudge.',
  },
] as const

// Prices come from the database, so refresh now and then rather than building once.
export const revalidate = 60

export default async function HomePage() {
  const { rates, endsOn, next } = await getCurrentOffer()
  // Introductory means a higher tier is waiting, whether or not its start date is set yet.
  const introductory = next != null
  return (
    <div className="min-h-screen overflow-x-clip bg-white text-gray-900">

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
          <MarketingNav signupUrl={SIGNUP_URL} loginUrl={LOGIN_URL} blue={BLUE} />
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
              <span style={{ color: BLUE_TEXT }}>Track your certification.</span><br />
              <span style={{ color: GREEN }}>Stay in the loop.</span>
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed mb-10 max-w-xl">
              Training Loop is where RBTs earn their PDUs and BCBAs earn their CEUs — through
              live trainings and self-paced video courses — and where everyone can see exactly
              where they stand before their certification comes up for renewal.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={SIGNUP_URL}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: BLUE }}
              >
                Start free trial
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
            <p className="text-sm font-semibold mb-3" style={{ color: BLUE_TEXT }}>How it works</p>
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
                'Follow a learning path one course at a time, with the next one unlocking as you finish',
                'Download your certificates any time, without chasing anyone',
                'Know how many days until your certification expires',
              ].map(t => (
                <li key={t} className="flex gap-3"><Icon name="checklist" className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 mb-5" style={{ color: BLUE_TEXT }}>
              <Icon name="certificate" />
            </div>
            <h3 className="text-xl font-semibold mb-3">For BCBAs</h3>
            <ul className="space-y-3 text-gray-600">
              {[
                'Earn CEUs through live trainings and self-paced courses',
                'See your total, ethics, and supervision CEUs against what recertification requires',
                'Add CEUs you earned elsewhere, like a conference — upload the certificate and the details are filled in for you',
                'Keep your BACB certification and every state license in one place, with a reminder before each renewal',
                'Know how many days until your certification renews',
              ].map(t => (
                <li key={t} className="flex gap-3"><Icon name="checklist" className="h-5 w-5 shrink-0 text-gray-400 mt-0.5" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 mb-5" style={{ color: BLUE_TEXT }}>
              <Icon name="school" />
            </div>
            <h3 className="text-xl font-semibold mb-3">For training coordinators</h3>
            <ul className="space-y-3 text-gray-600">
              {[
                'Schedule trainings, take attendance, and issue certificates in a few clicks',
                'Upload video courses once, then assign them — or a whole learning path — to anyone who needs them',
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
            <p className="text-sm font-semibold mb-3" style={{ color: BLUE_TEXT }}>Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Everything the loop needs.</h2>
          </div>
          <FeatureGrid />
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-16 bg-gray-50 border-y border-gray-200 px-4 sm:px-8 py-20 sm:py-24">
        <div className="max-w-4xl mx-auto">
          <div className="max-w-2xl mb-12">
            <p className="text-sm font-semibold mb-3" style={{ color: BLUE_TEXT }}>Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">One plan. Everything included.</h2>
            <p className="text-gray-600 text-lg">
              Start with a {TRIAL_DAYS}-day free trial, no card needed. Then pay for the people you actually track.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border-2 bg-white p-8" style={{ borderColor: BLUE_TEXT }}>
              <h3 className="font-semibold text-lg mb-1">Training Loop</h3>
              {introductory && (
                <p className="inline-block rounded-full bg-[#025CA8]/10 px-3 py-0.5 text-xs font-semibold mb-3" style={{ color: BLUE_TEXT }}>
                  Introductory pricing
                </p>
              )}
              <p className="mb-1">
                <span className="text-4xl font-extrabold" style={{ color: BLUE_TEXT }}>{formatMoney(rates.baseCents)}</span>
                <span className="text-gray-500"> / month</span>
              </p>
              <p className="text-gray-600 mb-1">+ {formatMoney(rates.userCents)} per person</p>
              <p className={`text-sm text-gray-500 ${introductory ? 'mb-1' : 'mb-6'}`}>
                Everyone you add counts: RBTs, BCBAs, and also training coordinators, admins, and anyone else with a login.
              </p>
              {endsOn && (
                <p className="text-sm font-medium mb-6" style={{ color: BLUE_TEXT }}>
                  {lockInLine(endsOn, next)}
                </p>
              )}
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                {[
                  'Live and self-paced training, quizzes, and certificates',
                  'PDU and CEU tracking for every certification cycle',
                  'Learning paths and outside-training uploads',
                  'State licensure tracking and renewal reminders',
                  'Unlimited admins, trainers, and courses',
                ].map(t => (
                  <li key={t} className="flex gap-2"><Icon name="checklist" className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />{t}</li>
                ))}
              </ul>
              <p className="text-xs text-gray-500">
                For example, 20 people is {formatMoney(monthlyTotalCents(20, 0, rates))} a month; 100 people is {formatMoney(monthlyTotalCents(100, 0, rates))}.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-8">
              <h3 className="font-semibold text-lg mb-1">Nightly license checks</h3>
              <p className="mb-1">
                <span className="text-4xl font-extrabold" style={{ color: BLUE_TEXT }}>{formatMoney(rates.stateCents)}</span>
                <span className="text-gray-500"> / state / month</span>
              </p>
              <p className="text-gray-600 mb-6">An optional add-on, one state at a time</p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Every night we compare your Licensed Behavior Analysts’ licenses in that state against the state’s own published list, and flag
                anything expired, missing, or not matching. Add only the states you work in, and optionally get the results by email.
              </p>
              <p className="text-sm text-gray-500 leading-relaxed mt-3">
                Not available in every state — it depends on whether the state publishes a license list we can check.
              </p>
            </div>
          </div>

          <PriceCalculator color={BLUE_TEXT} rates={rates} />

          <p className="mt-8 text-center text-gray-600">
            Fewer than 10 RBTs + BCBAs, or a non-profit?{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold hover:underline" style={{ color: BLUE_TEXT }}>Contact us</a>{' '}
            for discounted plans.
          </p>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="px-4 sm:px-8 py-24">
        <div className="max-w-6xl mx-auto rounded-3xl px-6 sm:px-12 py-14 text-center text-white" style={{ backgroundColor: BLUE }}>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            PDUs, CEUs, and certificates — finally in one place.
          </h2>
          <p className="text-blue-100 text-lg mb-8 max-w-xl mx-auto">
            Try everything free for 30 days. No card needed.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href={SIGNUP_URL}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold bg-white transition-opacity hover:opacity-90"
              style={{ color: BLUE_TEXT }}
            >
              Start free trial
              <Icon name="arrowRight" className="h-4 w-4" />
            </a>
            <a href={LOGIN_URL} className="px-5 py-3 text-sm font-semibold text-white hover:underline">
              Sign in
            </a>
          </div>
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
