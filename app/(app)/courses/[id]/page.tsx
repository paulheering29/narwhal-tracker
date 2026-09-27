'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import * as tus from 'tus-js-client'
import { createClient } from '@/lib/supabase/client'
import { getCompanyId } from '@/lib/get-company-id'
import { getDisplayName } from '@/lib/display-name'
import { isHtmlEmpty, sanitizeHtml } from '@/lib/sanitize-html'
import { RichTextEditor } from '@/components/rich-text-editor'
import { RichText } from '@/components/rich-text'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft, Pencil, Loader2, Plus, Trash2, PlayCircle, Clock, RefreshCw, Search, UserPlus, X,
  HelpCircle, CheckCircle2, Star,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffOption = {
  id: string; first_name: string; last_name: string
  display_first_name: string | null; display_last_name: string | null
}

type TopicOption = { id: string; name: string }

type StreamedCourse = {
  id: string; name: string; description: string | null; objectives: string | null
  units: number | null; validity_months: number | null
  trainer_staff_id: string | null; trainer_name: string | null; trainer_cert_number: string | null
  topic_id: string | null
  staff: StaffOption | null
}

type CourseVideo = {
  id: string
  order_index: number
  title: string | null
  description: string | null
  bunny_video_id: string
  duration_seconds: number | null
  created_at: string
}

type Assignment = { id: string; staff_id: string; staff: StaffOption }
type StaffProgress = { completedSections: number; passed: boolean }

type Quiz = { id: string; pass_percentage: number }
type QuizQuestion = {
  id: string; order_index: number; question_text: string
  options: string[]; correct_option_index: number
}
type QuestionInsight = {
  questionId: string; questionText: string; archived: boolean
  totalAnswered: number; correctCount: number; pctCorrect: number
}
type QuizInsights = { totalAttempts: number; uniqueStaff: number; passedAttempts: number; questions: QuestionInsight[] }

type CourseReview = {
  id: string; staff_id: string; rating: number; comment: string | null; created_at: string
  staff: StaffOption
}

const emptyForm = {
  name: '', description: '', objectives: '', units: '', validity_months: '',
  trainer_staff_id: '', trainer_name: '', trainer_cert_number: '', topic_id: '',
}

const emptyQuestionForm = { question_text: '', options: ['', ''], correct_option_index: 0 }

function fmtDuration(seconds: number | null) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function CourseDetailPage() {
  const { id: courseId } = useParams() as { id: string }
  const router   = useRouter()
  const supabase = createClient()

  const [course, setCourse]       = useState<StreamedCourse | null>(null)
  const [videos, setVideos]       = useState<CourseVideo[]>([])
  const [staffList, setStaffList] = useState<StaffOption[]>([])
  const [topicList, setTopicList] = useState<TopicOption[]>([])
  const [loading, setLoading]     = useState(true)

  // ── Edit sheet ───────────────────────────────────────────────────────────────
  const [editOpen, setEditOpen]       = useState(false)
  const [form, setForm]               = useState(emptyForm)
  const [trainerType, setTrainerType] = useState<'none' | 'staff' | 'external'>('none')
  const [saving, setSaving]           = useState(false)
  const [editError, setEditError]     = useState<string | null>(null)

  // ── Add part ─────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [addPartOpen, setAddPartOpen]   = useState(false)
  const [partTitle, setPartTitle]       = useState('')
  const [partDescription, setPartDescription] = useState('')
  const [editPart, setEditPart]         = useState<CourseVideo | null>(null)
  const [editPartTitle, setEditPartTitle] = useState('')
  const [editPartDescription, setEditPartDescription] = useState('')
  const [savingPart, setSavingPart]     = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError]   = useState<string | null>(null)
  const [deletingPartId, setDeletingPartId] = useState<string | null>(null)
  const [partError, setPartError]       = useState<string | null>(null)

  // ── Assigned staff ───────────────────────────────────────────────────────────
  const [assignments, setAssignments]   = useState<Assignment[]>([])
  const [assignSearch, setAssignSearch] = useState('')
  const [assigning, setAssigning]       = useState<string | null>(null)
  const [assignError, setAssignError]   = useState<string | null>(null)
  const [progressByStaff, setProgressByStaff] = useState<Record<string, StaffProgress>>({})

  const loadAssignments = useCallback(async () => {
    const { data } = await supabase
      .from('course_assignments')
      .select('id, staff_id, staff:staff_id(id, first_name, last_name, display_first_name, display_last_name)')
      .eq('course_id', courseId)
    setAssignments((data ?? []) as unknown as Assignment[])
  }, [courseId])

  const loadProgress = useCallback(async () => {
    const [watchRes, recordsRes] = await Promise.all([
      supabase.from('course_watch_progress').select('staff_id, completed').eq('course_id', courseId),
      supabase.from('training_records').select('staff_id').eq('course_id', courseId).eq('confirmed', true),
    ])
    const completedCounts: Record<string, number> = {}
    for (const row of watchRes.data ?? []) {
      if (row.completed) completedCounts[row.staff_id] = (completedCounts[row.staff_id] ?? 0) + 1
    }
    const passedSet = new Set((recordsRes.data ?? []).map(r => r.staff_id))
    const result: Record<string, StaffProgress> = {}
    for (const staffId of Object.keys(completedCounts)) {
      result[staffId] = { completedSections: completedCounts[staffId], passed: passedSet.has(staffId) }
    }
    for (const staffId of Array.from(passedSet)) {
      if (!result[staffId]) result[staffId] = { completedSections: completedCounts[staffId] ?? 0, passed: true }
    }
    setProgressByStaff(result)
  }, [courseId])

  // ── Reviews ──────────────────────────────────────────────────────────────────
  const [reviews, setReviews] = useState<CourseReview[]>([])

  const loadReviews = useCallback(async () => {
    const { data } = await supabase
      .from('course_reviews')
      .select('id, staff_id, rating, comment, created_at, staff:staff_id(id, first_name, last_name, display_first_name, display_last_name)')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
    setReviews((data ?? []) as unknown as CourseReview[])
  }, [courseId])

  const loadCourse = useCallback(async () => {
    const { data } = await supabase
      .from('courses')
      .select('*, staff:trainer_staff_id(id, first_name, last_name, display_first_name, display_last_name)')
      .eq('id', courseId)
      .eq('course_type', 'streamed')
      .single()
    if (data) setCourse(data as unknown as StreamedCourse)
  }, [courseId])

  // ── Quiz ─────────────────────────────────────────────────────────────────────
  const [quiz, setQuiz]                 = useState<Quiz | null>(null)
  const [questions, setQuestions]       = useState<QuizQuestion[]>([])
  const [creatingQuiz, setCreatingQuiz] = useState(false)
  const [passPct, setPassPct]           = useState('80')
  const [savingPassPct, setSavingPassPct] = useState(false)
  const [questionOpen, setQuestionOpen]   = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null)
  const [questionForm, setQuestionForm]       = useState(emptyQuestionForm)
  const [savingQuestion, setSavingQuestion]   = useState(false)
  const [questionError, setQuestionError]     = useState<string | null>(null)
  const [quizInsights, setQuizInsights]       = useState<QuizInsights | null>(null)

  const loadQuizInsights = useCallback(async (quizId: string) => {
    const { data: attempts } = await supabase
      .from('quiz_attempts')
      .select('id, staff_id, passed')
      .eq('quiz_id', quizId)
    if (!attempts || attempts.length === 0) {
      setQuizInsights({ totalAttempts: 0, uniqueStaff: 0, passedAttempts: 0, questions: [] })
      return
    }
    // Include archived questions here — they were retired from the live quiz
    // but their historical answers are still part of the trend.
    const [answersRes, allQuestionsRes] = await Promise.all([
      supabase.from('quiz_attempt_answers').select('question_id, is_correct').in('attempt_id', attempts.map(a => a.id)),
      supabase.from('quiz_questions').select('id, order_index, question_text, archived_at').eq('quiz_id', quizId).order('order_index'),
    ])
    const byQuestion: Record<string, { total: number; correct: number }> = {}
    for (const a of answersRes.data ?? []) {
      const e = byQuestion[a.question_id] ?? { total: 0, correct: 0 }
      e.total += 1
      if (a.is_correct) e.correct += 1
      byQuestion[a.question_id] = e
    }
    const allQuestions = (allQuestionsRes.data ?? []) as unknown as
      { id: string; question_text: string; archived_at: string | null }[]
    setQuizInsights({
      totalAttempts:  attempts.length,
      uniqueStaff:    new Set(attempts.map(a => a.staff_id)).size,
      passedAttempts: attempts.filter(a => a.passed).length,
      questions: allQuestions
        // A retired question with no answers is just noise.
        .filter(q => !q.archived_at || byQuestion[q.id])
        .map(q => {
          const e = byQuestion[q.id] ?? { total: 0, correct: 0 }
          return {
            questionId:     q.id,
            questionText:   q.question_text,
            archived:       !!q.archived_at,
            totalAnswered:  e.total,
            correctCount:   e.correct,
            pctCorrect:     e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0,
          }
        }),
    })
  }, [])

  const loadQuiz = useCallback(async () => {
    const { data: quizRow } = await supabase
      .from('quizzes')
      .select('id, pass_percentage')
      .eq('course_id', courseId)
      .maybeSingle()
    setQuiz(quizRow ?? null)
    if (quizRow) {
      setPassPct(String(quizRow.pass_percentage))
      const { data: qs } = await supabase
        .from('quiz_questions')
        .select('id, order_index, question_text, options, correct_option_index')
        .eq('quiz_id', quizRow.id)
        .is('archived_at', null)
        .order('order_index')
      setQuestions((qs ?? []) as unknown as QuizQuestion[])
      loadQuizInsights(quizRow.id)
    } else {
      setQuestions([])
      setQuizInsights(null)
    }
  }, [courseId, loadQuizInsights])

  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set())

  const checkStatus = useCallback(async (videoId: string): Promise<boolean> => {
    setCheckingIds(prev => new Set(prev).add(videoId))
    try {
      const res = await fetch(`/api/admin/course-videos/${videoId}/status`)
      const status = await res.json()
      if (res.ok && status.ready) {
        setVideos(prev => prev.map(v => v.id === videoId ? { ...v, duration_seconds: status.durationSeconds } : v))
        return true
      }
      return false
    } finally {
      setCheckingIds(prev => { const n = new Set(prev); n.delete(videoId); return n })
    }
  }, [])

  // Bunny takes real time to encode, so a single check right after upload
  // almost always lands before it's done. Poll every 5s until it reports
  // ready (or we give up after 15 tries, ~75s) instead of checking once.
  const pollStatus = useCallback((videoId: string, attemptsLeft = 15) => {
    checkStatus(videoId).then(ready => {
      if (!ready && attemptsLeft > 1) {
        setTimeout(() => pollStatus(videoId, attemptsLeft - 1), 5000)
      }
    })
  }, [checkStatus])

  // Every reload — initial mount, after adding a part, after deleting one —
  // kicks off polling for any part still stuck on "Processing" so the
  // badge flips to Ready on its own, without the admin clicking refresh.
  const loadVideos = useCallback(async () => {
    const { data } = await supabase
      .from('course_videos')
      .select('id, order_index, title, description, bunny_video_id, duration_seconds, created_at')
      .eq('course_id', courseId)
      .order('order_index')
    setVideos(data ?? [])
    for (const v of data ?? []) {
      if (!v.duration_seconds) pollStatus(v.id)
    }
  }, [courseId, pollStatus])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const [, , topicsRes, staffRes] = await Promise.all([
        loadCourse(), loadVideos(),
        supabase.from('topics').select('id, name').order('name'),
        supabase.from('staff').select('id, first_name, last_name, display_first_name, display_last_name').eq('active', true).order('last_name'),
        loadAssignments(),
        loadQuiz(),
        loadProgress(),
        loadReviews(),
      ])
      setTopicList((topicsRes as { data: TopicOption[] | null }).data ?? [])
      setStaffList((staffRes as { data: StaffOption[] | null }).data ?? [])
      setLoading(false)
    }
    init()
  }, [loadCourse, loadVideos, loadAssignments, loadQuiz, loadProgress, loadReviews, supabase])

  async function handleCreateQuiz() {
    setCreatingQuiz(true)
    const companyId = await getCompanyId()
    if (!companyId) { setCreatingQuiz(false); return }
    await supabase.from('quizzes').insert({ company_id: companyId, course_id: courseId, pass_percentage: 80 })
    setCreatingQuiz(false)
    loadQuiz()
  }

  async function handleSavePassPct() {
    if (!quiz) return
    const pct = parseInt(passPct)
    if (!pct || pct < 1 || pct > 100) return
    setSavingPassPct(true)
    await supabase.from('quizzes').update({ pass_percentage: pct }).eq('id', quiz.id)
    setSavingPassPct(false)
    loadQuiz()
  }

  function openAddQuestion() {
    setEditingQuestion(null)
    setQuestionForm(emptyQuestionForm)
    setQuestionError(null)
    setQuestionOpen(true)
  }

  function openEditQuestion(q: QuizQuestion) {
    setEditingQuestion(q)
    setQuestionForm({ question_text: q.question_text, options: [...q.options], correct_option_index: q.correct_option_index })
    setQuestionError(null)
    setQuestionOpen(true)
  }

  function updateOption(index: number, value: string) {
    setQuestionForm(f => ({ ...f, options: f.options.map((o, i) => i === index ? value : o) }))
  }

  function addOption() {
    setQuestionForm(f => f.options.length >= 6 ? f : { ...f, options: [...f.options, ''] })
  }

  function removeOption(index: number) {
    setQuestionForm(f => {
      if (f.options.length <= 2) return f
      const options = f.options.filter((_, i) => i !== index)
      const correct_option_index = f.correct_option_index === index ? 0 : f.correct_option_index > index ? f.correct_option_index - 1 : f.correct_option_index
      return { ...f, options, correct_option_index }
    })
  }

  async function handleSaveQuestion() {
    if (!quiz) return
    const text = questionForm.question_text.trim()
    const options = questionForm.options.map(o => o.trim())
    if (!text) { setQuestionError('Question text is required.'); return }
    if (options.some(o => !o)) { setQuestionError('All options must have text.'); return }

    setSavingQuestion(true)
    setQuestionError(null)
    const companyId = await getCompanyId()
    if (!companyId) { setQuestionError('Could not determine your company.'); setSavingQuestion(false); return }

    if (editingQuestion) {
      const answered = await questionHasAnswers(editingQuestion.id)
      const gradingChanged =
        options.length !== editingQuestion.options.length ||
        options.some((o, i) => o !== editingQuestion.options[i]) ||
        questionForm.correct_option_index !== editingQuestion.correct_option_index

      if (answered && gradingChanged) {
        // Past attempts were graded against the old options/answer key.
        // Rewriting them in place would leave historical is_correct values
        // disagreeing with the question they point at, so retire the old
        // version and start a fresh one at the same position instead.
        const { error: archiveErr } = await supabase.from('quiz_questions')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', editingQuestion.id)
        if (archiveErr) { setQuestionError(archiveErr.message); setSavingQuestion(false); return }

        const { error } = await supabase.from('quiz_questions').insert({
          company_id: companyId, quiz_id: quiz.id, order_index: editingQuestion.order_index,
          question_text: text, options, correct_option_index: questionForm.correct_option_index,
        })
        if (error) { setQuestionError(error.message); setSavingQuestion(false); return }
      } else {
        const { error } = await supabase.from('quiz_questions').update({
          question_text: text, options, correct_option_index: questionForm.correct_option_index,
        }).eq('id', editingQuestion.id)
        if (error) { setQuestionError(error.message); setSavingQuestion(false); return }
      }
    } else {
      const nextOrder = questions.length > 0 ? Math.max(...questions.map(q => q.order_index)) + 1 : 1
      const { error } = await supabase.from('quiz_questions').insert({
        company_id: companyId, quiz_id: quiz.id, order_index: nextOrder,
        question_text: text, options, correct_option_index: questionForm.correct_option_index,
      })
      if (error) { setQuestionError(error.message); setSavingQuestion(false); return }
    }
    setSavingQuestion(false)
    setQuestionOpen(false)
    loadQuiz()
  }

  /** Has anyone already answered this question? Decides archive vs. hard delete. */
  async function questionHasAnswers(questionId: string): Promise<boolean> {
    const { count } = await supabase
      .from('quiz_attempt_answers')
      .select('id', { count: 'exact', head: true })
      .eq('question_id', questionId)
    return (count ?? 0) > 0
  }

  async function handleDeleteQuestion(id: string) {
    if (!confirm('Remove this question from the quiz?')) return
    // Hard-deleting cascades away every historical answer to this question,
    // which would silently rewrite the insights. Once it has been answered,
    // retire it instead so the trend data survives.
    if (await questionHasAnswers(id)) {
      await supabase.from('quiz_questions').update({ archived_at: new Date().toISOString() }).eq('id', id)
    } else {
      await supabase.from('quiz_questions').delete().eq('id', id)
    }
    loadQuiz()
  }

  async function handleAssign(staffId: string) {
    setAssigning(staffId)
    setAssignError(null)
    const companyId = await getCompanyId()
    if (!companyId) { setAssignError('Could not determine your company.'); setAssigning(null); return }
    const { error } = await supabase.from('course_assignments').insert({
      company_id: companyId, course_id: courseId, staff_id: staffId,
    })
    if (error) { setAssignError(error.message); setAssigning(null); return }
    // Also drop a pending (unconfirmed) training_records row so the course
    // shows up immediately on the staff member's own profile as "not
    // complete" — same as adding someone to a live training does. It
    // becomes confirmed once they pass the quiz.
    //
    // Only if they don't already have one: re-assigning someone who already
    // passed would otherwise stack a second row, which inflates their pending
    // PDUs and trips up the lookup when they next submit the quiz.
    const { data: existing } = await supabase
      .from('training_records')
      .select('id')
      .eq('staff_id', staffId)
      .eq('course_id', courseId)
      .limit(1)
    if (!existing?.length) {
      const today = new Date().toISOString().split('T')[0]
      await supabase.from('training_records').insert({
        company_id: companyId, staff_id: staffId, course_id: courseId,
        completed_date: today, confirmed: false,
      })
    }
    setAssigning(null)
    loadAssignments()
    loadProgress()
  }

  async function handleUnassign(assignmentId: string, staffId: string) {
    await supabase.from('course_assignments').delete().eq('id', assignmentId)
    // Only clean up the record if it's still pending — a confirmed one
    // represents PDUs already earned and shouldn't disappear just because
    // the assignment was later removed.
    await supabase.from('training_records').delete()
      .eq('staff_id', staffId).eq('course_id', courseId).eq('confirmed', false)
    loadAssignments()
    loadProgress()
  }

  // ── Edit course ───────────────────────────────────────────────────────────────

  function openEdit() {
    if (!course) return
    setForm({
      name:                course.name,
      description:         course.description ?? '',
      objectives:          course.objectives ?? '',
      units:               course.units?.toString() ?? '',
      validity_months:     course.validity_months?.toString() ?? '',
      trainer_staff_id:    course.trainer_staff_id ?? '',
      trainer_name:        course.trainer_name ?? '',
      trainer_cert_number: course.trainer_cert_number ?? '',
      topic_id:            course.topic_id ?? '',
    })
    setTrainerType(course.trainer_staff_id ? 'staff' : course.trainer_name ? 'external' : 'none')
    setEditError(null)
    setEditOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.units) {
      setEditError('Course name and PDUs are required.')
      return
    }
    setSaving(true)
    setEditError(null)
    const { error } = await supabase.from('courses').update({
      name:                form.name.trim(),
      description:         form.description || null,
      objectives:          form.objectives || null,
      units:               parseFloat(form.units),
      validity_months:     form.validity_months ? parseInt(form.validity_months) : null,
      trainer_staff_id:    trainerType === 'staff'    ? form.trainer_staff_id || null : null,
      trainer_name:        trainerType === 'external' ? form.trainer_name || null     : null,
      trainer_cert_number: trainerType === 'external' ? form.trainer_cert_number || null : null,
      topic_id:            form.topic_id || null,
    }).eq('id', courseId)
    if (error) { setEditError(error.message); setSaving(false); return }
    setSaving(false)
    setEditOpen(false)
    loadCourse()
  }

  // ── Add part (upload) ───────────────────────────────────────────────────────

  function openAddPart() {
    setPartTitle(`Section ${videos.length + 1}`)
    setPartDescription('')
    setUploadError(null)
    setUploadProgress(0)
    setAddPartOpen(true)
  }

  function openEditPart(v: CourseVideo) {
    setEditPart(v)
    setEditPartTitle(v.title ?? `Section ${v.order_index}`)
    setEditPartDescription(v.description ?? '')
    setPartError(null)
  }

  async function handleSavePart() {
    if (!editPart) return
    setSavingPart(true)
    setPartError(null)
    const { error } = await supabase.from('course_videos').update({
      title:       editPartTitle.trim() || null,
      description: isHtmlEmpty(editPartDescription) ? null : sanitizeHtml(editPartDescription),
    }).eq('id', editPart.id)
    setSavingPart(false)
    if (error) { setPartError(error.message); return }
    setEditPart(null)
    loadVideos()
  }

  function handleFilePick() {
    fileInputRef.current?.click()
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setUploadError('Please choose a video file.')
      return
    }
    const title = partTitle.trim() || `Section ${videos.length + 1}`

    setUploading(true)
    setUploadError(null)
    setUploadProgress(0)

    try {
      const authRes = await fetch('/api/admin/course-videos/upload-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, title }),
      })
      const auth = await authRes.json()
      if (!authRes.ok) throw new Error(auth.error ?? 'Failed to start upload')

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: auth.endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            AuthorizationSignature: auth.signature,
            AuthorizationExpire:    String(auth.expire),
            VideoId:                auth.videoId,
            LibraryId:              auth.libraryId,
          },
          metadata: { filetype: file.type, title },
          onError: reject,
          onProgress: (uploaded, total) => setUploadProgress(Math.round((uploaded / total) * 100)),
          onSuccess: () => resolve(),
        })
        upload.start()
      })

      const companyId = await getCompanyId()
      if (!companyId) throw new Error('Could not determine your company. Please sign out and back in.')

      const nextOrder = videos.length > 0 ? Math.max(...videos.map(v => v.order_index)) + 1 : 1
      const { error: insertErr } = await supabase.from('course_videos').insert({
        company_id:       companyId,
        course_id:        courseId,
        order_index:      nextOrder,
        title,
        description:      isHtmlEmpty(partDescription) ? null : sanitizeHtml(partDescription),
        bunny_video_id:   auth.videoId,
        bunny_library_id: auth.libraryId,
      })
      if (insertErr) throw new Error(insertErr.message)

      setUploading(false)
      setAddPartOpen(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      loadVideos()
    } catch (err) {
      setUploading(false)
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    }
  }

  async function handleDeletePart(video: CourseVideo) {
    const label = video.title ?? `Section ${video.order_index}`
    if (!confirm(`Delete "${label}"?\n\nThe video file is removed from Bunny and everyone's watch progress for this section is lost. This can't be undone.`)) return
    setDeletingPartId(video.id)
    setPartError(null)
    const res = await fetch(`/api/admin/course-videos/${video.id}`, { method: 'DELETE' })
    setDeletingPartId(null)
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Delete failed.' }))
      setPartError(json.error ?? 'Delete failed.')
      return
    }
    loadVideos()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  }

  if (!course) {
    return <div className="p-4 md:p-8">
      <p className="text-gray-500">Course not found.</p>
      <Button variant="link" onClick={() => router.push('/courses')}>← Back</Button>
    </div>
  }

  const trainerDisplay = course.staff ? getDisplayName(course.staff) : course.trainer_name ?? null

  return (
    <div className="p-4 md:p-8">

      <button onClick={() => router.push('/courses')}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Courses
      </button>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{course.name}</h1>
          <p className="mt-1.5 text-sm text-gray-500">Self-paced streamed course</p>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit} className="shrink-0">
          <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      <Card className="mb-8 shadow-sm">
        <CardContent className="pt-6">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">PDUs</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {course.units != null ? `${course.units} PDU${course.units !== 1 ? 's' : ''}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Topic</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {topicList.find(t => t.id === course.topic_id)?.name ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trainer of Record</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {trainerDisplay ?? '—'}
                {course.trainer_cert_number && (
                  <span className="ml-1 text-xs text-gray-400">({course.trainer_cert_number})</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Sections</dt>
              <dd className="mt-1 text-sm text-gray-900">{videos.length}</dd>
            </div>
            {course.description && (
              <div className="col-span-4">
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</dt>
                <dd className="mt-1 text-sm text-gray-700">{course.description}</dd>
              </div>
            )}
            {course.objectives && (
              <div className="col-span-4">
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">Objectives</dt>
                <dd className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{course.objectives}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* ── Sections ─────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sections</h2>
          <p className="text-sm text-gray-500">{videos.length} video{videos.length !== 1 ? 's' : ''} in this course</p>
        </div>
        <Button size="sm" className="bg-[#0A253D] hover:bg-[#0d2f4f]" onClick={openAddPart}>
          <Plus className="mr-2 h-4 w-4" /> Add Section
        </Button>
      </div>

      {partError && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{partError}</p>}

      {videos.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          No sections uploaded yet. Add Section 1 to get started.
        </div>
      ) : (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map(v => {
                const duration = fmtDuration(v.duration_seconds)
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-gray-400 text-sm">{v.order_index}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium text-sm">
                        <PlayCircle className="h-4 w-4 text-gray-400 shrink-0" />
                        {v.title ?? `Section ${v.order_index}`}
                      </span>
                      {!isHtmlEmpty(v.description) && (
                        <RichText html={v.description!} className="mt-1 ml-6 text-xs text-gray-500 line-clamp-2" />
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {duration ? (
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{duration}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          v.duration_seconds ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {v.duration_seconds ? 'Ready' : 'Processing'}
                        </span>
                        {!v.duration_seconds && (
                          <button
                            onClick={() => checkStatus(v.id)}
                            disabled={checkingIds.has(v.id)}
                            title="Check encoding status"
                            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${checkingIds.has(v.id) ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" title="Edit section" onClick={() => openEditPart(v)}>
                        <Pencil className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Remove section"
                        disabled={deletingPartId === v.id} onClick={() => handleDeletePart(v)}>
                        {deletingPartId === v.id
                          ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          : <Trash2 className="h-4 w-4 text-gray-400" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Quiz ─────────────────────────────────────────────────────────────── */}
      <div className="mt-8 mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Quiz</h2>
          <p className="text-sm text-gray-500">
            {quiz ? 'Unlocks once every section has been watched' : 'No quiz configured yet'}
          </p>
        </div>
        {quiz && (
          <Button size="sm" className="bg-[#0A253D] hover:bg-[#0d2f4f]" onClick={openAddQuestion}>
            <Plus className="mr-2 h-4 w-4" /> Add Question
          </Button>
        )}
      </div>

      {!quiz ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          <HelpCircle className="mx-auto mb-2 h-6 w-6 text-gray-300" />
          <p className="mb-3">Staff can&apos;t earn a certificate for this course until it has a quiz.</p>
          <Button size="sm" onClick={handleCreateQuiz} disabled={creatingQuiz} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
            {creatingQuiz ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating…</> : 'Create Quiz'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white shadow-sm px-4 py-3 flex items-center gap-3">
            <Label className="text-sm text-gray-600 shrink-0">Passing score</Label>
            <Input type="number" min="1" max="100" value={passPct}
              onChange={e => setPassPct(e.target.value)} className="w-20 h-8 text-sm" />
            <span className="text-sm text-gray-500">%</span>
            <Button size="sm" variant="outline" onClick={handleSavePassPct} disabled={savingPassPct}>
              {savingPassPct ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>

          {questions.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
              No questions yet. Add at least one for staff to be able to pass this quiz.
            </div>
          ) : (
            <div className="rounded-lg border bg-white shadow-sm divide-y">
              {questions.map((q, qi) => (
                <div key={q.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">{qi + 1}. {q.question_text}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openEditQuestion(q)}>
                        <Pencil className="h-3.5 w-3.5 text-gray-400" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteQuestion(q.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {q.options.map((o, oi) => (
                      <li key={oi} className={`flex items-center gap-1.5 text-xs ${oi === q.correct_option_index ? 'text-emerald-600 font-medium' : 'text-gray-500'}`}>
                        {oi === q.correct_option_index && <CheckCircle2 className="h-3 w-3" />}
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Quiz Insights ────────────────────────────────────────────────────── */}
      {quiz && (
        <>
          <div className="mt-8 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Quiz Insights</h2>
            <p className="text-sm text-gray-500">
              {quizInsights
                ? `${quizInsights.totalAttempts} attempt${quizInsights.totalAttempts !== 1 ? 's' : ''} · ${quizInsights.uniqueStaff} staff · ${quizInsights.totalAttempts > 0 ? Math.round((quizInsights.passedAttempts / quizInsights.totalAttempts) * 100) : 0}% pass rate`
                : 'Loading…'}
            </p>
          </div>
          {!quizInsights || quizInsights.totalAttempts === 0 ? (
            <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
              No attempts yet. Insights appear once staff start taking the quiz.
            </div>
          ) : (
            <div className="rounded-lg border bg-white shadow-sm divide-y">
              {[...quizInsights.questions]
                .sort((a, b) => a.pctCorrect - b.pctCorrect)
                .map(q => (
                  <div key={q.questionId} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <p className="text-sm text-gray-900 flex-1">
                        {q.questionText}
                        {q.archived && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 align-middle">
                            Retired
                          </span>
                        )}
                      </p>
                      <span className={`shrink-0 text-sm font-semibold ${
                        q.pctCorrect >= 80 ? 'text-emerald-600' : q.pctCorrect >= 50 ? 'text-amber-600' : 'text-red-500'
                      }`}>
                        {q.pctCorrect}% correct
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full ${q.pctCorrect >= 80 ? 'bg-emerald-500' : q.pctCorrect >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                        style={{ width: `${q.pctCorrect}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">{q.correctCount}/{q.totalAnswered} answers correct</p>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {/* ── Reviews ──────────────────────────────────────────────────────────── */}
      <div className="mt-8 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Reviews</h2>
        <p className="text-sm text-gray-500">What staff think of this course</p>
      </div>
      {reviews.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
          No reviews yet.
        </div>
      ) : (
        <div className="rounded-lg border bg-white shadow-sm p-5">
          {(() => {
            const total   = reviews.length
            const average = reviews.reduce((sum, r) => sum + r.rating, 0) / total
            const counts  = [5, 4, 3, 2, 1].map(star => reviews.filter(r => r.rating === star).length)
            return (
              <div className="flex flex-col sm:flex-row gap-6 pb-5 mb-5 border-b">
                <div className="shrink-0 text-center sm:w-36">
                  <p className="text-3xl font-bold text-gray-900">{average.toFixed(1)}</p>
                  <div className="flex justify-center gap-0.5 my-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} className={`h-4 w-4 ${i <= Math.round(average) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">{total} review{total !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star, i) => (
                    <div key={star} className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="w-8 shrink-0">{star} star</span>
                      <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-amber-400" style={{ width: `${total > 0 ? (counts[i] / total) * 100 : 0}%` }} />
                      </div>
                      <span className="w-6 shrink-0 text-right">{counts[i]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
          <div className="space-y-4">
            {reviews.map(r => (
              <div key={r.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(i => (
                        <Star key={i} className={`h-3.5 w-3.5 ${i <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{getDisplayName(r.staff)}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Assigned Staff ───────────────────────────────────────────────────── */}
      <div className="mt-8 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Assigned Staff</h2>
        <p className="text-sm text-gray-500">{assignments.length} assigned</p>
      </div>
      {assignError && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded px-3 py-2">{assignError}</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-sm font-medium text-gray-700">Currently assigned</p>
          </div>
          {assignments.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No one assigned yet.</div>
          ) : (
            <ul className="divide-y">
              {[...assignments]
                .sort((a, b) => getDisplayName(a.staff).localeCompare(getDisplayName(b.staff)))
                .map(a => {
                  const p = progressByStaff[a.staff_id]
                  const status: 'not_started' | 'in_progress' | 'complete' =
                    p?.passed ? 'complete' : p ? 'in_progress' : 'not_started'
                  const statusLabel = {
                    not_started: 'Not started',
                    in_progress: 'In progress',
                    complete:    'Complete',
                  }[status]
                  const statusStyle = {
                    not_started: 'bg-gray-100 text-gray-500',
                    in_progress: 'bg-amber-100 text-amber-700',
                    complete:    'bg-emerald-100 text-emerald-700',
                  }[status]
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{getDisplayName(a.staff)}</p>
                        {p && !p.passed && (
                          <p className="text-xs text-gray-400">{p.completedSections}/{videos.length} sections watched</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
                          {statusLabel}
                        </span>
                        <button onClick={() => handleUnassign(a.id, a.staff_id)} title="Remove"
                          className="text-gray-400 hover:text-red-500 transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  )
                })}
            </ul>
          )}
        </div>

        <div className="rounded-lg border bg-white shadow-sm flex flex-col">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-sm font-medium text-gray-700">Assign staff</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input placeholder="Search staff…" value={assignSearch}
                onChange={e => setAssignSearch(e.target.value)} className="pl-8 h-8 text-sm" />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {(() => {
                const assignedIds = new Set(assignments.map(a => a.staff_id))
                const available = staffList
                  .filter(s => !assignedIds.has(s.id))
                  .filter(s => assignSearch === '' || getDisplayName(s).toLowerCase().includes(assignSearch.toLowerCase()))
                if (available.length === 0) {
                  return <p className="py-8 text-center text-sm text-gray-400">
                    {assignSearch ? 'No staff match your search.' : 'Everyone active is already assigned.'}
                  </p>
                }
                return available.map(s => (
                  <button key={s.id} type="button" onClick={() => handleAssign(s.id)} disabled={assigning === s.id}
                    className="w-full flex items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
                    {getDisplayName(s)}
                    {assigning === s.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                      : <UserPlus className="h-3.5 w-3.5 text-gray-400" />}
                  </button>
                ))
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Course Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Course</SheetTitle></SheetHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label>Course Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Objectives</Label>
              <Textarea rows={3} value={form.objectives}
                onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PDUs *</Label>
                <Input type="number" min="0" step="0.25" value={form.units}
                  onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
              </div>
              {topicList.length > 0 && (
                <div className="space-y-2">
                  <Label>Topic</Label>
                  <Select value={form.topic_id} onValueChange={v => setForm(f => ({ ...f, topic_id: (!v || v === '__none__') ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select a topic (optional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {topicList.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <Label>Trainer of Record <span className="text-gray-400 font-normal">(optional)</span></Label>
              <div className="flex rounded-md border overflow-hidden w-fit">
                {(['none', 'staff', 'external'] as const).map(type => (
                  <button key={type} type="button" onClick={() => setTrainerType(type)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${trainerType === type ? 'bg-[#0A253D] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {type === 'none' ? 'None' : type === 'staff' ? 'Staff Member' : 'External'}
                  </button>
                ))}
              </div>
              {trainerType === 'staff' && (
                <Select value={form.trainer_staff_id} onValueChange={v => setForm(f => ({ ...f, trainer_staff_id: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {staffList.map(s => <SelectItem key={s.id} value={s.id}>{getDisplayName(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {trainerType === 'external' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Trainer Name</Label>
                    <Input value={form.trainer_name} onChange={e => setForm(f => ({ ...f, trainer_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cert Number</Label>
                    <Input value={form.trainer_cert_number} onChange={e => setForm(f => ({ ...f, trainer_cert_number: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Certification Validity <span className="text-gray-400 font-normal">(months, optional)</span></Label>
              <Input type="number" min="0" value={form.validity_months}
                onChange={e => setForm(f => ({ ...f, validity_months: e.target.value }))} />
            </div>
            {editError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{editError}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Add Section Sheet ─────────────────────────────────────────────────── */}
      <Sheet open={addPartOpen} onOpenChange={open => { if (!uploading) setAddPartOpen(open) }}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Section</SheetTitle></SheetHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label>Section Title</Label>
              <Input value={partTitle} onChange={e => setPartTitle(e.target.value)} disabled={uploading} />
            </div>

            <div className="space-y-2">
              <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
              <RichTextEditor
                value={partDescription}
                onChange={setPartDescription}
                disabled={uploading}
                placeholder="What this section covers, what to look out for, any references…"
              />
            </div>

            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChosen} />

            {uploading ? (
              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-[#0A253D] transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-sm text-gray-500 text-center">Uploading… {uploadProgress}%</p>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={handleFilePick}>
                Choose Video File
              </Button>
            )}

            {uploadError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{uploadError}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setAddPartOpen(false)} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Cancel'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Edit Section Sheet ───────────────────────────────────────────────── */}
      <Sheet open={!!editPart} onOpenChange={open => { if (!open) setEditPart(null) }}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Section</SheetTitle></SheetHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label>Section Title</Label>
              <Input value={editPartTitle} onChange={e => setEditPartTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
              <RichTextEditor
                value={editPartDescription}
                onChange={setEditPartDescription}
                placeholder="What this section covers, what to look out for, any references…"
              />
            </div>
            <p className="text-xs text-gray-400">
              Shown to staff alongside the video when they watch this section.
            </p>
            {partError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{partError}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditPart(null)}>Cancel</Button>
            <Button onClick={handleSavePart} disabled={savingPart} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              {savingPart ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Section'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Add/Edit Question Sheet ──────────────────────────────────────────── */}
      <Sheet open={questionOpen} onOpenChange={setQuestionOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>{editingQuestion ? 'Edit Question' : 'Add Question'}</SheetTitle></SheetHeader>
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label>Question *</Label>
              <Textarea rows={2} value={questionForm.question_text}
                onChange={e => setQuestionForm(f => ({ ...f, question_text: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Options * <span className="text-gray-400 font-normal">(select the correct one)</span></Label>
              <div className="space-y-2">
                {questionForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button type="button" onClick={() => setQuestionForm(f => ({ ...f, correct_option_index: i }))}
                      title="Mark as correct answer"
                      className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                        questionForm.correct_option_index === i ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                      }`}>
                      {questionForm.correct_option_index === i && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                    </button>
                    <Input value={opt} onChange={e => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`} className="flex-1" />
                    {questionForm.options.length > 2 && (
                      <button type="button" onClick={() => removeOption(i)} className="text-gray-400 hover:text-red-500 shrink-0">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {questionForm.options.length < 6 && (
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Option
                </Button>
              )}
            </div>
            {questionError && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{questionError}</p>}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setQuestionOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveQuestion} disabled={savingQuestion} className="bg-[#0A253D] hover:bg-[#0d2f4f]">
              {savingQuestion ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save Question'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

    </div>
  )
}
