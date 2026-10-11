-- Introductory pricing tiers. A company claims a tier when it starts paying
-- (set by the Stripe webhook) and keeps that tier's prices for as long as it stays.
--
-- Each tier names its three Stripe prices by lookup key, so adding a tier is:
-- create the three prices in Stripe, then insert a row here. No code change.
-- ends_on = last day (US Eastern) the tier can be signed up for; null = no end date.
-- The open tier is the lowest-numbered one that hasn't ended; the last tier is always open.
-- To move a deadline, edit ends_on in the Supabase table editor.

create table if not exists public.pricing_tiers (
  tier          int primary key,
  ends_on       date,
  base_cents    int not null,
  user_cents    int not null,
  state_cents   int not null,
  base_lookup   text not null,
  user_lookup   text not null,
  state_lookup  text not null
);

-- Read and written only by the server (service role); no policies on purpose.
alter table public.pricing_tiers enable row level security;

insert into public.pricing_tiers (tier, ends_on, base_cents, user_cents, state_cents, base_lookup, user_lookup, state_lookup) values
  (1, null, 5000, 50, 1000, 'trainingloop_base_monthly',    'trainingloop_user_monthly',    'trainingloop_state_monthly'),
  (2, null, 6000, 60, 1000, 'trainingloop_base_monthly_t2', 'trainingloop_user_monthly_t2', 'trainingloop_state_monthly_t2')
on conflict (tier) do nothing;

alter table public.companies
  add column if not exists price_tier int references public.pricing_tiers(tier);

-- Anyone already subscribed is on the original prices, which are tier 1.
update public.companies set price_tier = 1
where stripe_subscription_id is not null and price_tier is null;
