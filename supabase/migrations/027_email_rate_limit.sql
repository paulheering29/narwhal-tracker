-- ============================================================
-- Migration 027 – Rate limit for emails sent to arbitrary addresses
-- ============================================================
-- The public signup and forgot-password endpoints send an email to whatever
-- address they're given, so without a limit anyone could flood a person's inbox.
-- record_email_request() counts recent requests per address and per IP and, when
-- under the limits, records this one — atomically, so concurrent requests can't
-- slip past. Addresses and IPs are stored only as keyed hashes, and rows older
-- than a day are removed as it runs.
--
-- Service role only (the API routes); RLS is on with no policies.
-- ============================================================

create table public.email_request_log (
  id          bigint generated always as identity primary key,
  kind        text not null,          -- 'signup' | 'password-reset'
  email_hash  text not null,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

alter table public.email_request_log enable row level security;

create index on public.email_request_log (kind, email_hash, created_at);
create index on public.email_request_log (kind, ip_hash, created_at);

-- Returns 'ok' (recorded), 'email_limited' or 'ip_limited' (not recorded).
create or replace function public.record_email_request(
  p_kind        text,
  p_email_hash  text,
  p_ip_hash     text,
  p_email_limit integer,
  p_ip_limit    integer,
  p_window      interval
)
returns text
language plpgsql as $$
declare
  v_since timestamptz := now() - p_window;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_kind || ':' || p_email_hash));

  delete from public.email_request_log where created_at < now() - interval '1 day';

  select count(*) into v_count from public.email_request_log
   where kind = p_kind and email_hash = p_email_hash and created_at > v_since;
  if v_count >= p_email_limit then
    return 'email_limited';
  end if;

  if p_ip_hash is not null then
    select count(*) into v_count from public.email_request_log
     where kind = p_kind and ip_hash = p_ip_hash and created_at > v_since;
    if v_count >= p_ip_limit then
      return 'ip_limited';
    end if;
  end if;

  insert into public.email_request_log (kind, email_hash, ip_hash)
  values (p_kind, p_email_hash, p_ip_hash);
  return 'ok';
end;
$$;

revoke all on function public.record_email_request(text, text, text, integer, integer, interval) from public, anon, authenticated;
grant execute on function public.record_email_request(text, text, text, integer, integer, interval) to service_role;
