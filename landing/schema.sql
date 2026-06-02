-- ════════════════════════════════════════════════════════════════════════════
--  Claude for Premiere Pro — Supabase schema
--  Paste this whole file into:  Supabase Dashboard → SQL Editor → New query → Run
-- ════════════════════════════════════════════════════════════════════════════

-- One row per authenticated user: their plan, render usage, and Stripe linkage.
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  full_name              text,
  avatar_url             text,
  plan                   text        not null default 'free',   -- 'free' | 'creator' | 'studio'
  renders_used           int         not null default 0,
  renders_limit          int         not null default 5,        -- monthly quota for this plan
  period_start           timestamptz not null default date_trunc('month', now()),
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text,                                  -- 'active' | 'past_due' | 'canceled' | null
  current_period_end     timestamptz,
  created_at             timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read & update only their own row. (Plan/limit changes happen server-side
-- via Stripe webhooks using the service_role key, which bypasses RLS.)
drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "update own profile" on public.profiles;
create policy "read own profile"   on public.profiles for select using (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);

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
-- Rolls the monthly window over if needed, then consumes one render if quota remains.
-- Returns renders REMAINING after this one, or -1 if the user is already at their limit.
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

  -- Consume one render only if under the limit.
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
