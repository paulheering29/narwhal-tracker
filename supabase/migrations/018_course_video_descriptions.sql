-- ============================================================
-- Migration 018 – Per-section description
-- ============================================================
-- Rich-text notes shown alongside each section's video: what it covers,
-- what to pay attention to, references, etc. Stored as a small allowlisted
-- subset of HTML (bold/italic/lists/links) produced by the editor in
-- components/rich-text-editor.tsx and sanitised on both save and render.
-- ============================================================

alter table public.course_videos
  add column if not exists description text;
