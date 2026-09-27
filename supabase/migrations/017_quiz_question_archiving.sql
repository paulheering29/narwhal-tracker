-- ============================================================
-- Migration 017 – Archive quiz questions instead of deleting them
-- ============================================================
-- quiz_attempt_answers.question_id cascades on delete, so hard-deleting a
-- question silently erased every historical answer to it — gutting the
-- quiz-insights trends. Editing a question's correct answer was equally
-- lossy: old attempts kept their original grading while the insights panel
-- reported against the new key.
--
-- Fix: questions are archived (archived_at set) rather than deleted once
-- they have attempts, and an edit that changes grading archives the old
-- question and writes a new one. History stays intact and internally
-- consistent; the quiz-taking flow only ever sees live questions.
-- ============================================================

alter table public.quiz_questions
  add column if not exists archived_at timestamptz;

-- The old constraint blocked an archived question and its replacement from
-- sharing an order_index. Ordering only needs to be unique among the
-- questions actually in use, so scope the uniqueness to live rows.
alter table public.quiz_questions
  drop constraint if exists quiz_questions_order_unique;

create unique index if not exists quiz_questions_live_order_unique
  on public.quiz_questions (quiz_id, order_index)
  where archived_at is null;

create index if not exists quiz_questions_live_idx
  on public.quiz_questions (quiz_id) where archived_at is null;
