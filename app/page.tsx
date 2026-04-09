import Link from 'next/link'
import Image from 'next/image'

const features = [
  {
    emoji: '📋',
    title: 'Every PDU, Accounted For',
    body: 'Log training hours the moment they happen. No more scrambling at renewal time wondering what counts and what doesn\'t.',
    color: 'bg-sky-50 border-sky-200',
    pill: 'bg-sky-100 text-sky-700',
  },
  {
    emoji: '⏱️',
    title: 'Pacing That Keeps You Ahead',
    body: 'See exactly where each RBT should be in their certification cycle vs. where they actually are — in real time.',
    color: 'bg-teal-50 border-teal-200',
    pill: 'bg-teal-100 text-teal-700',
  },
  {
    emoji: '📅',
    title: 'Never Miss a Renewal',
    body: 'Expiring certifications surface automatically. Thirty days out, you know. No surprises, no last-minute panic.',
    color: 'bg-amber-50 border-amber-200',
    pill: 'bg-amber-100 text-amber-700',
  },
  {
    emoji: '🎯',
    title: 'Training That Hits the Mark',
    body: 'Tag trainings by topic. See at a glance which skills your team has covered and where the gaps are.',
    color: 'bg-violet-50 border-violet-200',
    pill: 'bg-violet-100 text-violet-700',
  },
  {
    emoji: '✍️',
    title: 'Certificates, Auto-Signed',
    body: 'Trainer signatures embedded directly into certificates. Professional, consistent, and zero extra steps.',
    color: 'bg-rose-50 border-rose-200',
    pill: 'bg-rose-100 text-rose-700',
  },
  {
    emoji: '🔒',
    title: 'Your Data, Only Yours',
    body: 'Each organisation is completely siloed. Row-level security means no one else ever sees your records.',
    color: 'bg-emerald-50 border-emerald-200',
    pill: 'bg-emerald-100 text-emerald-700',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <header style={{ backgroundColor: '#457595' }} className="sticky top-0 z-50 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
          <div className="flex items-center gap-2.5">
            <Image
              src="/narwhal-tracker.jpg"
              alt="Narwhal Tracker"
              width={120}
              height={36}
              className="h-9 w-auto rounded"
              priority
            />
            <span className="text-white font-semibold text-lg leading-none tracking-tight">
              Narwhal Tracker
            </span>
          </div>
          <Link
            href="/login"
            className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ color: '#457595' }}
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden py-24 px-6 text-center"
        style={{
          background: 'linear-gradient(160deg, #457595 0%, #2d5a73 50%, #1a3d52 100%)',
        }}
      >
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: '#6db3d4' }} />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: '#a8d8ea' }} />

        <div className="relative mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white/80">
            🦄 Built for ABA organisations
          </div>
          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
            RBT training records,<br />
            <span style={{ color: '#a8d8ea' }}>finally under control.</span>
          </h1>
          <p className="mx-auto mb-10 max-w-xl text-lg text-white/75 leading-relaxed">
            Narwhal Tracker keeps your whole team&apos;s PDU hours, certification cycles,
            and upcoming trainings in one tidy place — so nothing slips through the cracks.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-base font-bold shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ backgroundColor: '#a8d8ea', color: '#1a3d52' }}
          >
            Get started →
          </Link>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      <section style={{ backgroundColor: '#f0f7fa' }} className="border-y border-sky-100 py-8">
        <div className="mx-auto max-w-4xl grid grid-cols-3 divide-x divide-sky-200 text-center">
          {[
            { value: '12', label: 'PDUs per cycle' },
            { value: '2-yr', label: 'Certification cycles' },
            { value: '0', label: 'Surprises at renewal' },
          ].map(({ value, label }) => (
            <div key={label} className="px-6 py-2">
              <p className="text-4xl font-extrabold" style={{ color: '#457595' }}>{value}</p>
              <p className="mt-1 text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-3xl font-extrabold text-gray-900">
            Everything you need. Nothing you don&apos;t.
          </h2>
          <p className="mb-14 text-center text-gray-500">
            Purpose-built for ABA training coordinators who have enough on their plate.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ emoji, title, body, color }) => (
              <div
                key={title}
                className={`rounded-2xl border p-6 transition-shadow hover:shadow-md ${color}`}
              >
                <div className="mb-3 text-3xl">{emoji}</div>
                <h3 className="mb-2 text-base font-bold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section
        className="py-20 px-6 text-center"
        style={{
          background: 'linear-gradient(135deg, #457595 0%, #2d5a73 100%)',
        }}
      >
        <h2 className="mb-4 text-3xl font-extrabold text-white">
          Your team&apos;s certifications won&apos;t track themselves. 🦭
        </h2>
        <p className="mb-8 text-white/70">
          But Narwhal Tracker will.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-base font-bold shadow-lg transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: '#a8d8ea', color: '#1a3d52' }}
        >
          Sign in to your account →
        </Link>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-white py-8 px-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Narwhal Tracker · Built for the humans keeping ABA teams certified 🐋
      </footer>

    </div>
  )
}
