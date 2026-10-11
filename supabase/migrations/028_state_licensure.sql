-- ============================================================
-- Migration 028 – State licensure for BCBAs (phase 1)
-- ============================================================
-- license_jurisdictions        what each state requires (seeded from the
--                              behavior_analyst_licensure_by_state spreadsheet;
--                              states without BCBA licensure aren't listed).
--                              Reference data: edit rows in the Supabase table
--                              editor, no code change.
-- license_requirement_topics   recurring / one-time topic requirements
-- staff_licenses               one row per person per state they hold a license in
--
-- Rules change. `needs_verification` marks states the source says to confirm with
-- the board, and `last_reviewed` records when the row was last checked.
-- ============================================================

create table public.license_jurisdictions (
  code                  text primary key,                 -- two-letter state / DC code
  name                  text not null,
  regulation_status     text not null check (regulation_status in ('licensed','registration','certified','pending')),
  cycle_years           numeric(3,1),                      -- how often the license renews; null = not yet set
  ce_basis              text not null check (ce_basis in ('bacb','state_hours','bacb_plus_topics','none','pending')),
  ce_hours_required     numeric(6,2),                      -- state hours per CE period (state_hours states)
  ce_period_years       numeric(3,1),                      -- length of that CE period
  ethics_hours_required numeric(6,2),                      -- of those hours, per CE period
  ce_met_by_bacb        boolean not null default false,    -- state hours deemed met while BACB certification is active
  tied_to_bacb          boolean not null default false,    -- license requires active BACB certification
  needs_verification    boolean not null default false,    -- confirm details with the board
  ce_summary            text,                              -- the spreadsheet's wording, shown as-is
  ethics_summary        text,
  supervision_summary   text,
  other_requirements    text,
  renewal_notes         text,
  sources               text,
  last_reviewed         date not null default current_date
);

create table public.license_requirement_topics (
  id                 uuid primary key default uuid_generate_v4(),
  jurisdiction_code  text not null references public.license_jurisdictions(code) on delete cascade,
  name               text not null,
  hours              numeric(5,2),
  frequency          text not null check (frequency in ('once','each_renewal','every_n_years')),
  every_n_years      integer,
  counts_toward_ce   boolean not null default false,       -- also counts toward the CE hours
  note               text
);

create index on public.license_requirement_topics (jurisdiction_code);

create table public.staff_licenses (
  id                 uuid primary key default uuid_generate_v4(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  staff_id           uuid not null references public.staff(id) on delete cascade,
  jurisdiction_code  text not null references public.license_jurisdictions(code),
  license_number     text,
  status             text not null default 'active' check (status in ('active','pending','lapsed','inactive')),
  issued_date        date,
  expiration_date    date not null,                         -- the person's real date; formats vary by state
  notes              text,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint staff_licenses_unique unique (staff_id, jurisdiction_code)
);

create index on public.staff_licenses (company_id);
create index on public.staff_licenses (staff_id);
create index on public.staff_licenses (expiration_date);

-- ── RLS ─────────────────────────────────────────────────────

alter table public.license_jurisdictions       enable row level security;
alter table public.license_requirement_topics  enable row level security;
alter table public.staff_licenses              enable row level security;

create policy "license_jurisdictions readable by signed-in users"
  on public.license_jurisdictions for select to authenticated using (true);

create policy "license_requirement_topics readable by signed-in users"
  on public.license_requirement_topics for select to authenticated using (true);

-- A person sees their own licenses; staff tier sees the company's.
create policy "staff_licenses select (self or staff tier)"
  on public.staff_licenses for select
  using (
    staff_id = public.jwt_staff_id()
    or (
      company_id = public.jwt_company_id()
      and (auth.jwt() -> 'app_metadata' ->> 'tier') = 'staff'
    )
  );

-- Only admins, trainers and account owners enter or change licenses.
create policy "staff_licenses insert (admin / trainer / owner)"
  on public.staff_licenses for insert
  with check (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );

create policy "staff_licenses update (admin / trainer / owner)"
  on public.staff_licenses for update
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );

create policy "staff_licenses delete (admin / trainer / owner)"
  on public.staff_licenses for delete
  using (
    company_id = public.jwt_company_id()
    and (auth.jwt() -> 'app_metadata' -> 'roles') ?| array['Admin','Trainer','Account Owner']
  );

-- ── Seed: 41 jurisdictions that license, register or certify BCBAs ──────

insert into public.license_jurisdictions
  (code, name, regulation_status, cycle_years, ce_basis, ce_hours_required, ce_period_years, ethics_hours_required,
   ce_met_by_bacb, tied_to_bacb, needs_verification, ce_summary, ethics_summary, supervision_summary,
   other_requirements, renewal_notes, sources)
values
  ('AL', 'Alabama', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Licenses expire Dec 31; renewal deadline Dec 15 (late fee after).', 'Ala. Admin. Code 580-5-30B-.07; mh.alabama.gov'),
  ('AK', 'Alaska', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Biennial term ending Sept 30 of even years.', 'Alaska renewal form BEV4690; AS 08.15'),
  ('AZ', 'Arizona', 'licensed', 2, 'state_hours', 30, 2, 4, false, false, false, '30 hours', '4 hours', 'No', 'No carryover; first period prorated; Board does not pre-approve CE', 'Expires last day of birth month (odd/even year by license number).', 'AZ Board of Psychologist Examiners BA CE FAQ'),
  ('AR', 'Arkansas', 'registration', 1, 'bacb', null, null, null, false, true, true, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'New program under AR Psychology Board; state association describes it as optional registration. Confirm cycle with board.', 'BACB licensure table; CAR 95-1301; ArkABA 2025 report'),
  ('CO', 'Colorado', 'pending', null, 'pending', null, null, null, false, false, true, 'Not yet set (rules pending)', 'Not yet set', 'Not yet set', 'Fingerprint criminal history check at licensure', 'HB26-1425 signed June 2, 2026; no license required to practice until 7/1/2028.', 'HB26-1425; Benesch Law summary'),
  ('CT', 'Connecticut', 'licensed', 1, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', '2 hrs PTSD/suicide-risk/depression/grief screening + suicide prevention at first renewal, then at least every 6 years', 'Annual renewal through CT DPH.', 'CGS 20-185k; CT DPH'),
  ('DC', 'District of Columbia', 'pending', 2, 'bacb', null, null, null, false, true, true, 'Not yet set by DC rule; BACB standard applies in interim', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'DC Code 3-1202.11 directs Board of Psychology to issue BA rules incl. CE; final CE chapter not confirmed. Verify with DC Health.', 'DC Code 3-1202.11; Triad DC summary'),
  ('GA', 'Georgia', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'License requires continuously active BACB status.', 'O.C.G.A. 43-7A-10; Ga. Comp. R. & Regs. 75-5-.01'),
  ('HI', 'Hawaii', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No state CE hours in statute (license premised on BACB certification)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Renew within 60 days before expiration; forfeited licenses restorable within 1 year.', 'HRS 465D-10'),
  ('IL', 'Illinois', 'licensed', 2, 'state_hours', 30, 2, null, false, false, false, '30 hours (beginning with 2027 renewal)', 'No specific ethics hours in BA rule', 'No', '1 hr sexual harassment prevention every renewal (even before CE starts); 1 hr implicit bias + 1 hr Alzheimer''s/dementia once CE applies; mandated reporter training every 3 yrs', 'Expires Oct 31 of odd years. First renewal exempt from CE. Online CE must include an exam; sponsors include BACB ACE providers.', '68 Ill. Adm. Code 1376.50; IDFPR CE page'),
  ('IN', 'Indiana', 'licensed', 2, 'bacb_plus_topics', null, null, null, false, true, false, 'BACB CE, including 2 state-specified units', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', '1 unit trauma-informed care + 1 unit abuse & neglect OR mandatory reporting (can also count toward BACB)', 'Expires Dec 31 of odd years.', '844 IAC 21-3-1; Indiana PLA'),
  ('IA', 'Iowa', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', 'Mandatory reporter training (child and/or dependent adult abuse): 2 hrs initial, then 1 hr every 3 yrs, Iowa HHS-approved, if you treat children/dependent adults', 'Mandatory reporter training runs on its own 3-yr clock.', '481 IAC 880.10(3) (via Triad summary)'),
  ('KS', 'Kansas', 'licensed', 2, 'state_hours', 30, 2, 4, false, false, false, '30 hours', '4 hours (professional ethics)', 'No', 'No carryover; category caps apply', 'License expires 24 months after issuance. Kansas hours apply even if BACB lapses.', 'K.A.R. 102-8-7, 102-8-9; KS BSRB'),
  ('KY', 'Kentucky', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Renew biennially by last day of month license was issued.', '201 KAR 43:080'),
  ('LA', 'Louisiana', 'licensed', 1, 'state_hours', 32, 2, 4, false, false, false, '32 hours per 2-year reporting period', '4 hours', 'No', 'Jurisprudence exam at initial licensure; category caps (e.g., non-BACB events max 25%)', 'License renews every year by Dec 31; CE reported biennially.', 'LAC 46:VIII §§401, 803'),
  ('MD', 'Maryland', 'licensed', 2, 'bacb', null, null, null, false, true, true, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', 'Criminal history records check if 6+ years since last one', 'Board of Professional Counselors and Therapists. Confirm CE details in COMAR 10.58.16.', 'MD BOPC renewal notice; Triad MD summary'),
  ('MA', 'Massachusetts', 'licensed', 2, 'state_hours', 30, 2, null, false, false, false, '30 hours', 'Not specified by state rule', 'No', 'CE must be from BACB ACE providers; hours prorated for new licensees; one-time domestic & sexual violence training', 'Board of Allied Mental Health & Human Services Professions.', 'Mass. Allied MH Board CE policy; MA ABA licensing FAQ'),
  ('MI', 'Michigan', 'licensed', 4, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', 'Implicit bias training 1 hr per year of license cycle (4 hrs per 4-yr cycle); one-time human trafficking training', 'Proof of BACB good standing must be sent directly from BACB.', 'MI LARA Behavior Analyst Licensing Guide (rev. 1/26/2026)'),
  ('MN', 'Minnesota', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'New program (2024) under Board of Psychology.', 'Minn. Stat. 148.9984'),
  ('MS', 'Mississippi', 'licensed', 3, 'state_hours', 36, 3, 3, false, true, false, '12 hours per year (36 per 3-yr license term)', '1 hour per year (ethics/legal)', 'No', 'CE reported every year by June 30; max 50% asynchronous without board approval; BACB-approved sources', 'License term 3 years, cannot exceed BACB certification expiration.', 'MS Autism Board CE reporting form; LBA application'),
  ('MO', 'Missouri', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Renew by Oct 31 of odd years.', 'RSMo 337.300-.320; Triad MO summary'),
  ('MT', 'Montana', 'licensed', 1, 'state_hours', 20, 2, 2, false, false, true, '20 hours per 2-year reporting period', '2 hours', 'No', '1 hour suicide prevention per reporting period', 'License expires Dec 31 each year. Older board forms show 10 hrs/yr with 1 ethics - confirm current rule with board.', 'ARM 24.189.2110; MT Board of Psychologists forms'),
  ('NE', 'Nebraska', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', 'Attestations that you are not on NE or other states'' abuse/neglect registries', 'All licenses expire Sept 1 of even years.', '172 NAC 86-005'),
  ('NV', 'Nevada', 'licensed', 2, 'bacb_plus_topics', null, null, null, false, true, false, 'BACB CE requirements adopted by reference', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', '2 hrs evidence-based suicide prevention & awareness (may count within BACB hours)', 'Renew on or before Jan 1 of odd years.', 'NAC 641D; NRS 641D.360'),
  ('NJ', 'New Jersey', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'State Board of Applied Behavior Analyst Examiners; rules adopted 2024.', 'N.J.A.C. 13:42B; N.J.S.A. 45:8B-91 et seq.'),
  ('NY', 'New York', 'licensed', 3, 'none', null, null, null, false, false, false, 'None - NY has no CE requirement for LBAs', 'No', 'No', 'Child abuse identification & reporting training (generally one-time, NYSED-approved provider)', 'NY license is not based on BACB certification; registration renews every 3 years.', 'NYSED Office of the Professions; Triad NY summary'),
  ('NC', 'North Carolina', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', 'LaBAs must show ongoing supervision arrangement', null, 'N.C.G.S. 90-739'),
  ('ND', 'North Dakota', 'licensed', 2, 'state_hours', 32, 2, 4, false, false, false, '32 hours', '4 hours', 'No', 'CE must be BACB-accepted; renew by Nov 15 of odd years', 'Board of Integrative Health Care.', 'NDAC 112-05-01-08, -10, -11'),
  ('OH', 'Ohio', 'certified', 2, 'state_hours', 23, 2, 4, true, false, false, '23 hours (deemed met if BCBA is active)', '4 hours (ethics & professional conduct)', 'No', null, 'Registration due Aug 31 of even years.', 'OAC 4783-2-01, 4783-4-01'),
  ('OK', 'Oklahoma', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Licenses expire April 30 of odd years (OLBAB under OKDHS).', 'OAC 340:100-18; OKDHS renewal form'),
  ('OR', 'Oregon', 'licensed', 1, 'state_hours', 16, 1, 1, false, false, false, '16 hours per year', '1 hour per year', 'No', 'Keep CE documentation 2 years; attest at renewal', 'Assistant BAs: 10 hrs/yr.', 'Oregon HLO BARB CE page'),
  ('RI', 'Rhode Island', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Licenses expire July 1 of even years; renewal application due June 1.', '216-RICR-40-05-28.8; RIGL 5-86-13'),
  ('SD', 'South Dakota', 'licensed', 2, 'bacb', null, null, null, false, true, true, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Confirm cycle with SD ABA Advisory Committee.', 'Triad SD summary; ARSD 20:85'),
  ('TN', 'Tennessee', 'licensed', 2, 'bacb_plus_topics', null, null, null, false, true, false, 'BACB CE + 3 hours', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', '3 hrs cultural diversity, proof submitted with each renewal', null, 'TN Dept of Health ABA CE page'),
  ('TX', 'Texas', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', 'HHSC-approved human trafficking prevention course every renewal', 'TDLR verifies certification as proof of CE.', 'TDLR bhvce.htm; Tex. Occ. Code ch. 116'),
  ('UT', 'Utah', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Expires Sept 30 of even years.', 'Utah DOPL Behavior Analyst renewal page'),
  ('VT', 'Vermont', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs) (OPR accepts BACB certification as proof of competency)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', '1 hr systemic oppression / anti-oppressive practice each renewal (since 2024)', null, '26 V.S.A. ch. 95; VT OPR ABA page'),
  ('VA', 'Virginia', 'licensed', 2, 'state_hours', 32, 2, 4, false, false, false, '32 hours', '4 hours', 'No', 'Sponsor must be BACB-recognized; first renewal exempt; up to 2 hrs via volunteer service (3 hrs = 1 CE)', 'Renews in birth month of odd years.', '18VAC85-150-100; VA Board of Medicine'),
  ('WA', 'Washington', 'licensed', 2, 'state_hours', 32, 2, 4, true, false, false, '32 hours, OR maintain BACB certification', '4 hours (professional ethics & boundaries)', 'No', '2 hrs health equity every 4 years; business-practice hours capped at 8', 'Renews every 2 years on birthday. Also credentials behavior technicians.', 'WAC 246-805; WAC 246-12-800 to -830'),
  ('WI', 'Wisconsin', 'licensed', 2, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'Renews Dec 15 of even years.', 'WI DSPS Behavior Analyst page; Wis. Stat. 440.08'),
  ('WY', 'Wyoming', 'licensed', 1, 'bacb', null, null, null, false, true, false, 'No separate state hours - must keep BACB certification active (BACB: 32 CEUs / 2 yrs)', 'No separate state rule (BACB: 4 ethics CEUs per 2-yr cycle)', 'No separate state rule (BACB: 3 supervision CEUs per 2-yr cycle if you supervise)', null, 'License expires June 30 each year (Board of Psychology).', 'WY Board of Psychology (via Continued summary); Triad WY');

insert into public.license_requirement_topics
  (jurisdiction_code, name, hours, frequency, every_n_years, counts_toward_ce, note)
values
  ('CT', 'Mental health screening & suicide prevention', 2, 'every_n_years', 6, false, 'Required at the first renewal, then at least every 6 years. Covers PTSD, suicide risk, depression and grief screening.'),
  ('IL', 'Sexual harassment prevention', 1, 'each_renewal', null, false, 'Required every renewal, even before CE starts.'),
  ('IL', 'Implicit bias awareness', 1, 'each_renewal', null, false, 'Once the CE requirement applies.'),
  ('IL', 'Alzheimer’s disease & dementia', 1, 'each_renewal', null, false, 'Once the CE requirement applies.'),
  ('IL', 'Mandated reporter training', null, 'every_n_years', 3, false, null),
  ('IN', 'Trauma-informed care', 1, 'each_renewal', null, true, 'Can also count toward BACB CE.'),
  ('IN', 'Abuse & neglect, or mandatory reporting', 1, 'each_renewal', null, true, 'Can also count toward BACB CE.'),
  ('IA', 'Mandatory reporter training (initial)', 2, 'once', null, false, 'If you treat children or dependent adults. Iowa HHS-approved.'),
  ('IA', 'Mandatory reporter training (refresher)', 1, 'every_n_years', 3, false, 'If you treat children or dependent adults. Iowa HHS-approved.'),
  ('MA', 'Domestic & sexual violence training', null, 'once', null, false, 'One-time requirement.'),
  ('MI', 'Implicit bias training', 4, 'each_renewal', null, false, '1 hour per year of the license cycle (4 hours per 4-year cycle).'),
  ('MI', 'Human trafficking training', null, 'once', null, false, 'One-time requirement.'),
  ('MT', 'Suicide prevention', 1, 'each_renewal', null, false, 'Per 2-year reporting period.'),
  ('NV', 'Suicide prevention & awareness (evidence-based)', 2, 'each_renewal', null, true, 'May count within BACB hours.'),
  ('NY', 'Child abuse identification & reporting', null, 'once', null, false, 'Generally one-time, from a NYSED-approved provider.'),
  ('TN', 'Cultural diversity', 3, 'each_renewal', null, false, 'Proof is submitted with each renewal.'),
  ('TX', 'Human trafficking prevention (HHSC-approved)', null, 'each_renewal', null, false, 'Required every renewal.'),
  ('VT', 'Systemic oppression / anti-oppressive practice', 1, 'each_renewal', null, false, 'Required each renewal since 2024.'),
  ('WA', 'Health equity', 2, 'every_n_years', 4, false, null);
