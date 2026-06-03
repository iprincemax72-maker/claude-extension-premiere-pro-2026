-- ════════════════════════════════════════════════════════════════════════════
--  Flimify — Supabase schema (auth + plans + render metering + Polar billing)
--  Paste this whole file into:  Supabase Dashboard → SQL Editor → New query → Run
--  Safe to re-run (idempotent).
-- ════════════════════════════════════════════════════════════════════════════

-- One row per authenticated user: their plan, render usage, and billing linkage.
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  full_name              text,
  avatar_url             text,
  plan                   text        not null default 'free',   -- 'free' | 'creator' | 'studio'
  renders_used           int         not null default 0,
  renders_limit          int         not null default 5,        -- monthly quota for this plan
  period_start           timestamptz not null default date_trunc('month', now()),
  polar_customer_id      text,
  polar_subscription_id  text,
  subscription_status    text,                                  -- 'active' | 'past_due' | 'canceled' | 'revoked' | null
  current_period_end     timestamptz,
  created_at             timestamptz not null default now()
);

-- Add the Polar columns if an older schema (with stripe_* columns) already exists.
alter table public.profiles add column if not exists polar_customer_id     text;
alter table public.profiles add column if not exists polar_subscription_id text;

alter table public.profiles enable row level security;

-- ── RLS — READ-ONLY for clients. ────────────────────────────────────────────
-- A user may READ only their own row. NOBODY may UPDATE profiles from the
-- client: plan / renders_limit / renders_used are privileged and must never be
-- set by the user (that was a free-upgrade hole). All writes happen ONLY via:
--   • the SECURITY DEFINER functions below (consume_render), or
--   • the Polar webhook using the service_role key (which bypasses RLS).
drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "update own profile" on public.profiles;   -- <- removes the self-upgrade loophole
drop policy if exists "insert own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
-- (No update / insert / delete policy on purpose → clients cannot write this table.)

-- ── Auto-create a profile row whenever someone signs up ──────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Render metering ──────────────────────────────────────────────────────────
-- Called by the extension/bridge (with the user's access token) BEFORE each render.
-- Atomic check-and-consume: rolls the monthly window over, then consumes one
-- render only if quota remains. Returns renders REMAINING after this one, or -1
-- if already at the limit. A user can only ever DECREMENT their own quota here;
-- there is no path to raise plan / renders_limit from the client.
create or replace function public.consume_render()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  remaining int;
begin
  -- New month? reset the counter.
  update public.profiles
     set renders_used = 0,
         period_start = date_trunc('month', now())
   where id = auth.uid()
     and period_start < date_trunc('month', now());

  -- Consume one render only if under the limit (row lock makes this race-safe).
  update public.profiles
     set renders_used = renders_used + 1
   where id = auth.uid()
     and renders_used < renders_limit
  returning renders_limit - renders_used into remaining;

  if remaining is null then
    return -1;            -- over quota, nothing consumed
  end if;
  return remaining;
end;
$$;

-- Read-only usage snapshot for the extension/account UI (no consumption).
create or replace function public.my_usage()
returns table (plan text, renders_used int, renders_limit int, current_period_end timestamptz)
language sql
security definer set search_path = public
as $$
  select plan, renders_used, renders_limit, current_period_end
    from public.profiles
   where id = auth.uid();
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  Polar billing — webhook-driven plan changes (server-side only)
-- ════════════════════════════════════════════════════════════════════════════

-- Idempotency log: every processed Polar webhook event id lands here once, so a
-- re-delivered event can never double-apply. service_role only (no RLS policy).
create table if not exists public.billing_events (
  id          text primary key,           -- the Polar webhook event id
  type        text,
  received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;   -- → only service_role can touch it

-- Apply a verified Polar subscription change. ONLY the Polar webhook (running
-- with the service_role key) may call this. It is idempotent on p_event_id.
-- Returns 'applied' or 'duplicate'.
create or replace function public.apply_polar_subscription(
  p_event_id     text,
  p_user_id      uuid,
  p_plan         text,
  p_limit        int,
  p_status       text,
  p_period_end   timestamptz,
  p_customer     text,
  p_subscription text
)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.billing_events (id, type) values (p_event_id, 'subscription')
  on conflict (id) do nothing;
  if not found then
    return 'duplicate';                    -- already processed this exact event
  end if;

  update public.profiles set
    plan                  = p_plan,
    renders_limit         = p_limit,
    subscription_status   = p_status,
    current_period_end    = p_period_end,
    polar_customer_id     = coalesce(p_customer, polar_customer_id),
    polar_subscription_id = coalesce(p_subscription, polar_subscription_id)
  where id = p_user_id;

  return 'applied';
end;
$$;

-- Lock the billing function down: clients must NOT be able to call it (that would
-- be a free-upgrade hole). Only the service_role (the webhook) may execute it.
revoke all on function public.apply_polar_subscription(text,uuid,text,int,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.apply_polar_subscription(text,uuid,text,int,text,timestamptz,text,text) to service_role;
