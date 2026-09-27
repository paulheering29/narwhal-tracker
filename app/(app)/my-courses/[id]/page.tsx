'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Script from 'next/script'
import { createClient } from '@/lib/supabase/client'
import { getStaffId } from '@/lib/get-staff-id'
import { getCompanyId } from '@/lib/get-company-id'
import { isHtmlEmpty } from '@/lib/sanitize-html'
import { RichText } from '@/components/rich-text'
import { Button } from '@/components/ui/button'
import {
  Loader2, ArrowLeft, CheckCircle2, Lock, PlayCircle, Circle, Award, XCircle, RotateCcw, HelpCircle, Star,
} from 'lucide-react'

// player.js is untyped — we only touch a handful of methods/events.
type PlayerJs = {
  on: (event: string, cb: (data?: unknown) => void) => void
  getCurrentTime: (cb: (seconds: number) => void) => void
  setCurrentTime: (seconds: number) => void
}
declare global {
  interface Window {
    playerjs?: { Player: new (el: HTMLIFrameElement) => PlayerJs }
  }
}

const SEEK_AHEAD_BUFFER_SECONDS = 3
const HEARTBEAT_INTERVAL_MS = 8000

type CourseInfo = { id: string; name: string; description: string | null; objectives: string | null }
type Part = { id: string; order_index: number; title: string | null; description: string | null; duration_seconds: number | null }
type ProgressMap = Record<string, { completed: boolean; furthestReached: number }>
type ViewMode = 'watch' | 'quiz' | 'feedback'

export default function MyCoursePlayerPage() {
  const { id: courseId } = useParams() as { id: string }
  const router   = useRouter()
  const supabase = createClient()

  const [course, setCourse]     = useState<CourseInfo | null>(null)
  const [parts, setParts]       = useState<Part[]>([])
  const [progress, setProgress] = useState<ProgressMap>({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const [activeIndex, setActiveIndex] = useState(0)
  const [viewMode, setViewMode]       = useState<ViewMode>('watch')
  const [embedUrl, setEmbedUrl]       = useState<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)
  const [seekWarning, setSeekWarning] = useState(false)

  const iframeRef       = useRef<HTMLIFrameElement>(null)
  const furthestRef       = useRef(0)
  const durationRef       = useRef<number | null>(null)
  const wasCompletedRef   = useRef(false)
  const heartbeatTimer    = useRef<ReturnType<typeof setInterval> | null>(null)
  const initializedRef    = useRef(false)
  const prevAllDoneRef    = useRef(false)

  const activePart = parts[activeIndex] as Part | undefined

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const staffId = await getStaffId()
    const [courseRes, partsRes] = await Promise.all([
      supabase.from('courses').select('id, name, description, objectives').eq('id', courseId).single(),
      supabase.from('course_videos').select('id, order_index, title, description, duration_seconds').eq('course_id', courseId).order('order_index'),
    ])
    if (!courseRes.data) { setError('Course not found, or you are not assigned to it.'); setLoading(false); return }
    setCourse(courseRes.data)
    const partsData = partsRes.data ?? []
    setParts(partsData)

    // Seed progress for every section upfront (not just the one being
    // watched) so returning users see accurate lock/done state and land
    // on the quiz immediately if they already finished everything.
    if (staffId && partsData.length > 0) {
      const { data: rows } = await supabase
        .from('course_watch_progress')
        .select('course_video_id, completed, furthest_second_reached')
        .eq('staff_id', staffId)
        .in('course_video_id', partsData.map(p => p.id))
      const seeded: ProgressMap = {}
      for (const row of rows ?? []) {
        seeded[row.course_video_id] = { completed: row.completed, furthestReached: row.furthest_second_reached }
      }
      setProgress(seeded)
    }
    setLoading(false)
  }, [courseId])

  useEffect(() => { load() }, [load])

  // Pick a sensible starting point exactly once (first incomplete section,
  // or the quiz if everything's already done). After that, only react to
  // *finishing the last section just now* — never override a manual click,
  // which is what let people navigate away to rewatch an earlier section.
  useEffect(() => {
    if (parts.length === 0) return
    const allDoneNow = parts.every(p => progress[p.id]?.completed)

    if (!initializedRef.current) {
      initializedRef.current = true
      const firstIncomplete = parts.findIndex(p => !progress[p.id]?.completed)
      setActiveIndex(firstIncomplete === -1 ? parts.length - 1 : firstIncomplete)
      setViewMode(allDoneNow ? 'quiz' : 'watch')
    } else if (allDoneNow && !prevAllDoneRef.current) {
      setViewMode('quiz')
    }
    prevAllDoneRef.current = allDoneNow
  }, [parts, progress])

  // Fetch a signed playback URL + resume position for the active part.
  useEffect(() => {
    if (!activePart || viewMode !== 'watch') return
    setEmbedUrl(null)
    furthestRef.current = 0
    durationRef.current = activePart.duration_seconds
    wasCompletedRef.current = false

    fetch(`/api/course-videos/${activePart.id}/playback`)
      .then(res => res.json().then(json => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok) { setError(json.error ?? 'Could not load this video.'); return }
        furthestRef.current = json.furthestReached ?? 0
        durationRef.current = json.durationSeconds ?? durationRef.current
        wasCompletedRef.current = !!json.completed
        setProgress(prev => ({ ...prev, [activePart.id]: { completed: json.completed, furthestReached: json.furthestReached ?? 0 } }))
        setEmbedUrl(json.embedUrl)
      })
      .catch(() => setError('Could not load this video.'))
  }, [activePart, viewMode])

  const sendHeartbeat = useCallback((videoId: string, currentTime: number) => {
    fetch(`/api/course-videos/${videoId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentTime }),
    })
      .then(res => res.json())
      .then(json => {
        if (typeof json.furthestReached === 'number') furthestRef.current = Math.max(furthestRef.current, json.furthestReached)
        setProgress(prev => ({ ...prev, [videoId]: { completed: !!json.completed, furthestReached: furthestRef.current } }))
      })
      .catch(() => { /* best-effort */ })
  }, [])

  // Wire up player.js against the current iframe once both the script and
  // the iframe (keyed by part id, so it remounts per part) are ready.
  useEffect(() => {
    if (!scriptReady || !embedUrl || !activePart || !iframeRef.current || !window.playerjs) return

    const player = new window.playerjs.Player(iframeRef.current)
    const videoId = activePart.id

    player.on('ready', () => {
      // Resume where you left off — but only for a section still in
      // progress. Rewatching an already-completed section starts at 0.
      if (!wasCompletedRef.current && furthestRef.current > 1) {
        player.setCurrentTime(furthestRef.current)
      }
    })

    player.on('play', () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
      heartbeatTimer.current = setInterval(() => {
        player.getCurrentTime(t => sendHeartbeat(videoId, t))
      }, HEARTBEAT_INTERVAL_MS)
    })

    player.on('pause', () => {
      if (heartbeatTimer.current) { clearInterval(heartbeatTimer.current); heartbeatTimer.current = null }
      player.getCurrentTime(t => sendHeartbeat(videoId, t))
    })

    player.on('ended', () => {
      if (heartbeatTimer.current) { clearInterval(heartbeatTimer.current); heartbeatTimer.current = null }
      const finalTime = durationRef.current ?? furthestRef.current
      sendHeartbeat(videoId, finalTime)
    })

    // timeupdate fires very frequently — use it only to track natural
    // forward progress locally; the server heartbeat (throttled above)
    // is the actual source of truth for completion.
    player.on('timeupdate', (data) => {
      const d = data as { seconds: number; duration: number } | undefined
      if (!d) return
      if (d.duration) durationRef.current = d.duration
      if (d.seconds > furthestRef.current && d.seconds - furthestRef.current < SEEK_AHEAD_BUFFER_SECONDS + 1) {
        furthestRef.current = d.seconds
      }
    })

    // The core "no fast-forward" enforcement: snap back any seek that
    // lands ahead of what's actually been watched. Doesn't apply once a
    // section is already completed — feel free to scrub freely on a rewatch.
    player.on('seeked', () => {
      if (wasCompletedRef.current) return
      player.getCurrentTime(t => {
        if (t > furthestRef.current + SEEK_AHEAD_BUFFER_SECONDS) {
          player.setCurrentTime(furthestRef.current)
          setSeekWarning(true)
          setTimeout(() => setSeekWarning(false), 3000)
        }
      })
    })

    return () => {
      if (heartbeatTimer.current) { clearInterval(heartbeatTimer.current); heartbeatTimer.current = null }
    }
  }, [scriptReady, embedUrl, activePart, sendHeartbeat])

  if (loading) {
    return <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  }

  if (error || !course) {
    return <div className="p-4 md:p-8">
      <p className="text-gray-500">{error ?? 'Course not found.'}</p>
      <Button variant="link" onClick={() => router.push('/my-courses')}>← Back to My Courses</Button>
    </div>
  }

  const allDone = parts.length > 0 && parts.every(p => progress[p.id]?.completed)

  function selectPart(i: number) {
    setViewMode('watch')
    setActiveIndex(i)
  }

  return (
    <div className="p-4 md:p-8">
      <Script src="https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js" onReady={() => setScriptReady(true)} />

      <button onClick={() => router.push('/my-courses')}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to My Courses
      </button>

      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{course.name}</h1>
      {course.description && <p className="text-sm text-gray-500 mb-6">{course.description}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sections list */}
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden h-fit">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-sm font-medium text-gray-700">Sections</p>
          </div>
          <ul className="divide-y">
            {parts.map((p, i) => {
              const done   = !!progress[p.id]?.completed
              const locked = i > 0 && !progress[parts[i - 1].id]?.completed
              const active = viewMode === 'watch' && i === activeIndex
              return (
                <li key={p.id}>
                  <button
                    disabled={locked}
                    onClick={() => selectPart(i)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors ${
                      active ? 'bg-blue-50 text-blue-700' : locked ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      : locked ? <Lock className="h-4 w-4 shrink-0" />
                      : active ? <PlayCircle className="h-4 w-4 text-blue-500 shrink-0" />
                      : <Circle className="h-4 w-4 text-gray-300 shrink-0" />}
                    <span className="truncate">{p.title ?? `Section ${p.order_index}`}</span>
                  </button>
                </li>
              )
            })}
            <li>
              <button
                disabled={!allDone}
                onClick={() => setViewMode('quiz')}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors border-t ${
                  viewMode === 'quiz' ? 'bg-blue-50 text-blue-700' : !allDone ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {allDone ? <HelpCircle className="h-4 w-4 text-blue-500 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />}
                <span className="truncate font-medium">Quiz</span>
              </button>
            </li>
            <li>
              <button
                disabled={!allDone}
                onClick={() => setViewMode('feedback')}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors ${
                  viewMode === 'feedback' ? 'bg-blue-50 text-blue-700' : !allDone ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {allDone ? <Star className="h-4 w-4 text-blue-500 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />}
                <span className="truncate font-medium">Rate this Course</span>
              </button>
            </li>
          </ul>
        </div>

        {/* Player / Quiz */}
        <div>
          {seekWarning && (
            <div className="mb-3 rounded-md bg-amber-50 text-amber-700 text-sm px-3 py-2">
              Skipping ahead isn&apos;t allowed — resuming from where you left off.
            </div>
          )}
          {viewMode === 'quiz' ? (
            <QuizPanel courseId={courseId} />
          ) : viewMode === 'feedback' ? (
            <FeedbackPanel courseId={courseId} />
          ) : embedUrl ? (
            <div className="relative w-full overflow-hidden rounded-lg border bg-black shadow-sm" style={{ aspectRatio: '16/9' }}>
              <iframe
                key={activePart?.id}
                ref={iframeRef}
                src={embedUrl}
                loading="lazy"
                className="absolute inset-0 h-full w-full"
                allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border bg-white shadow-sm" style={{ aspectRatio: '16/9' }}>
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}

          {viewMode === 'watch' && activePart && !isHtmlEmpty(activePart.description) && (
            <div className="mt-6 rounded-lg border bg-white shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                About {activePart.title ?? `Section ${activePart.order_index}`}
              </p>
              <RichText html={activePart.description!} />
            </div>
          )}

          {course.objectives && (
            <div className="mt-6 rounded-lg border bg-white shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Objectives</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{course.objectives}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

type QuizQuestion = { id: string; order_index: number; question_text: string; options: string[] }
type QuizData = { quizId: string; passPercentage: number; questions: QuizQuestion[]; preview: boolean }
type QuizResult = {
  passed: boolean; scorePercentage: number; correctCount: number
  totalQuestions: number; attemptNumber: number | null; certificateIssued: boolean
  recordId: string | null; preview: boolean
}

function QuizPanel({ courseId }: { courseId: string }) {
  const [quiz, setQuiz]         = useState<QuizData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [answers, setAnswers]   = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]     = useState<QuizResult | null>(null)

  const loadQuiz = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setAnswers({})
    const res = await fetch(`/api/quizzes/${courseId}`)
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Could not load the quiz.'); setLoading(false); return }
    setQuiz(json)
    setLoading(false)
  }, [courseId])

  useEffect(() => { loadQuiz() }, [loadQuiz])

  async function handleSubmit() {
    if (!quiz) return
    setSubmitting(true)
    const res = await fetch(`/api/quizzes/${courseId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: quiz.questions.map(q => ({ questionId: q.id, selectedOptionIndex: answers[q.id] ?? -1 })),
      }),
    })
    const json = await res.json()
    setSubmitting(false)
    if (!res.ok) { setError(json.error ?? 'Could not submit the quiz.'); return }
    setResult(json)
  }

  if (loading) {
    return <div className="flex items-center justify-center rounded-lg border bg-white shadow-sm py-16">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  }

  if (error) {
    return <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
      {error}
    </div>
  }

  if (!quiz) return null

  if (result) {
    return (
      <div className="rounded-lg border bg-white shadow-sm p-8 text-center">
        {result.preview && (
          <p className="mb-4 rounded-md bg-amber-50 text-amber-700 text-sm px-3 py-2">
            Preview only — you aren&apos;t assigned to this course, so this attempt wasn&apos;t
            recorded and no certificate was issued.
          </p>
        )}
        {result.passed ? (
          <>
            <Award className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
            <p className="text-lg font-semibold text-gray-900 mb-1">You passed!</p>
            <p className="text-sm text-gray-500 mb-4">
              Scored {result.scorePercentage}% ({result.correctCount}/{result.totalQuestions} correct) — needed {quiz.passPercentage}%.
            </p>
            {result.certificateIssued && result.recordId && (
              <a href={`/api/certificates/rbt-inservice?recordId=${result.recordId}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
                Download your certificate →
              </a>
            )}
          </>
        ) : (
          <>
            <XCircle className="mx-auto mb-3 h-10 w-10 text-red-400" />
            <p className="text-lg font-semibold text-gray-900 mb-1">Not quite</p>
            <p className="text-sm text-gray-500 mb-4">
              Scored {result.scorePercentage}% ({result.correctCount}/{result.totalQuestions} correct) — needed {quiz.passPercentage}%.
            </p>
            <Button onClick={loadQuiz} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              <RotateCcw className="mr-2 h-4 w-4" /> Try Again
            </Button>
          </>
        )}
      </div>
    )
  }

  const allAnswered = quiz.questions.every(q => answers[q.id] != null)

  return (
    <div className="rounded-lg border bg-white shadow-sm p-6 space-y-6">
      <div>
        <p className="text-sm font-semibold text-gray-900">Course Quiz</p>
        <p className="text-sm text-gray-500">Answer every question, then submit. You need {quiz.passPercentage}% to pass.</p>
        {quiz.preview && (
          <p className="mt-2 rounded-md bg-amber-50 text-amber-700 text-xs px-3 py-2">
            Preview mode — you aren&apos;t assigned to this course, so nothing you submit here
            is recorded and no certificate is issued.
          </p>
        )}
      </div>
      {quiz.questions.map((q, qi) => (
        <div key={q.id}>
          <p className="text-sm font-medium text-gray-900 mb-2">{qi + 1}. {q.question_text}</p>
          <div className="space-y-1.5">
            {q.options.map((opt, oi) => (
              <button key={oi} type="button" onClick={() => setAnswers(a => ({ ...a, [q.id]: oi }))}
                className={`w-full flex items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  answers[q.id] === oi ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                <span className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                  answers[q.id] === oi ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                }`}>
                  {answers[q.id] === oi && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button onClick={handleSubmit} disabled={!allAnswered || submitting} className="w-full bg-[#0A253D] hover:bg-[#0d2f4f]">
        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : 'Submit Quiz'}
      </Button>
    </div>
  )
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

function FeedbackPanel({ courseId }: { courseId: string }) {
  const supabase = createClient()

  const [loading, setLoading]   = useState(true)
  const [rating, setRating]     = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const staffId = await getStaffId()
      if (staffId) {
        const { data } = await supabase
          .from('course_reviews')
          .select('rating, comment')
          .eq('course_id', courseId)
          .eq('staff_id', staffId)
          .maybeSingle()
        if (data) { setRating(data.rating); setComment(data.comment ?? '') }
      }
      setLoading(false)
    }
    load()
  }, [courseId])

  async function handleSubmit() {
    if (rating === 0) { setError('Please pick a star rating.'); return }
    setSaving(true)
    setError(null)
    const [staffId, companyId] = await Promise.all([getStaffId(), getCompanyId()])
    if (!staffId || !companyId) { setError('Could not determine your account.'); setSaving(false); return }
    const { error: err } = await supabase.from('course_reviews').upsert({
      company_id: companyId, course_id: courseId, staff_id: staffId,
      rating, comment: comment.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'course_id,staff_id' })
    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) {
    return <div className="flex items-center justify-center rounded-lg border bg-white shadow-sm py-16">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm p-6 space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-900">How would you rate this course?</p>
        <div className="flex gap-1 mt-2" onMouseLeave={() => setHoverRating(0)}>
          {[1, 2, 3, 4, 5].map(i => (
            <button key={i} type="button" onClick={() => setRating(i)} onMouseEnter={() => setHoverRating(i)}>
              <Star className={`h-8 w-8 transition-colors ${
                i <= (hoverRating || rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
              }`} />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-900">Tell us more about your experience with this course <span className="text-gray-400 font-normal">(optional)</span></p>
        <textarea
          rows={4}
          value={comment}
          onChange={e => setComment(e.target.value)}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="What worked, what didn't, anything you'd change…"
        />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}
      <Button onClick={handleSubmit} disabled={saving} className="w-full bg-[#0A253D] hover:bg-[#0d2f4f]">
        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : saved ? <><CheckCircle2 className="mr-2 h-4 w-4" />Saved</> : 'Submit Feedback'}
      </Button>
    </div>
  )
}
