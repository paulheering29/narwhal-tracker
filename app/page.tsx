import Link from 'next/link'
import Image from 'next/image'

const features = [
  {
    emoji: '📋',
    title: 'Every PDU, accounted for',
    body: 'Log training hours the moment they happen. No more scrambling at renewal time.',
  },
  {
    emoji: '⏱️',
    title: 'Pacing in real time',
    body: 'See exactly where each RBT should be in their cycle — versus where they actually are.',
  },
  {
    emoji: '📅',
    title: 'Never miss a renewal',
    body: 'Expiring certifications surface automatically. Thirty days out, you know.',
  },
  {
    emoji: '🎯',
    title: 'Topic-level visibility',
    body: 'Tag trainings by topic. See which skills your team has covered and where the gaps are.',
  },
  {
    emoji: '✍️',
    title: 'Certificates, auto-signed',
    body: 'Trainer signatures embedded directly into certificates. Professional, zero extra steps.',
  },
  {
    emoji: '🔒',
    title: 'Your data, only yours',
    body: 'Each organisation is fully siloed. Nobody else ever sees your records.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-8 h-16">
          <div className="flex items-center gap-3">
            <Image
              src="/narwhal-tracker.jpg"
              alt="Narwhal Tracker"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
              priority
            />
            <span className="font-semibold text-gray-900 tracking-tight">
              Narwhal Tracker
            </span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: '#457595', color: '#fff' }}
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-28 px-8 text-center">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1] text-gray-900 mb-6">
            RBT training records,<br />
            <span style={{ color: '#457595' }}>finally under control.</span>
          </h1>
          <p className="text-xl text-gray-400 leading-relaxed mb-12 max-w-lg mx-auto">
            One place for PDU hours, certification cycles, and upcoming trainings —
            so nothing slips through the cracks.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#457595', color: '#fff' }}
          >
            Get started →
          </Link>
        </div>
      </section>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-8">
        <hr className="border-gray-100" />
      </div>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="py-28 px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold tracking-tight text-center mb-4">
            Everything you need.
          </h2>
          <p className="text-gray-400 text-center mb-20">
            Purpose-built for ABA training coordinators.
          </p>
          <div className="grid gap-x-12 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ emoji, title, body }) => (
              <div key={title}>
                <div className="text-2xl mb-4">{emoji}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-8">
        <hr className="border-gray-100" />
      </div>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-32 px-8 text-center">
        <div className="mx-auto max-w-xl">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Your team&apos;s certifications<br />won&apos;t track themselves.
          </h2>
          <p className="text-gray-400 mb-10">But Narwhal Tracker will.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#457595', color: '#fff' }}
          >
            Sign in to your account →
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 py-10 px-8 text-center text-xs text-gray-300">
        © {new Date().getFullYear()} Narwhal Tracker
      </footer>

    </div>
  )
}
