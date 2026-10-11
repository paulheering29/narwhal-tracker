-- ============================================================
-- Migration 026 – Self-serve signup
-- ============================================================
-- provision_company_owner() runs when someone confirms their email after
-- signing up: it creates their organization (on the Free plan) and their staff
-- row as Admin + Account Owner in one transaction, so a half-created account
-- can't exist. Idempotent: if the person already has a staff row (a clicked
-- link twice, a retry) it returns the existing organization.
--
-- Called by the /auth/confirm route with the service role only.
-- ============================================================

create or replace function public.provision_company_owner(
  p_auth_id      uuid,
  p_email        text,
  p_first_name   text,
  p_last_name    text,
  p_company_name text
)
returns uuid
language plpgsql as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.staff where auth_id = p_auth_id;
  if v_company is not null then
    return v_company;
  end if;

  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Organization name is required.';
  end if;

  insert into public.companies (name, plan_id)
  values (trim(p_company_name), (select id from public.plans where name = 'free' limit 1))
  returning id into v_company;

  -- The staff insert also fires the trigger that puts company_id / tier / roles
  -- into the user's token claims.
  insert into public.staff (company_id, auth_id, first_name, last_name, email, tier, roles, active)
  values (
    v_company, p_auth_id, coalesce(trim(p_first_name), ''), coalesce(trim(p_last_name), ''),
    lower(p_email), 'staff', array['Admin', 'Account Owner'], true
  );

  return v_company;
end;
$$;

revoke all on function public.provision_company_owner(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_company_owner(uuid, text, text, text, text) to service_role;
