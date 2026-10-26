-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.steps (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null check (day >= date '2020-01-01' and day <= current_date + 1),
  steps integer not null check (steps between 0 and 200000),
  updated timestamptz not null default now(),
  primary key (user_id, day)
);

-- Each person can only see and change their own rows.
alter table public.steps enable row level security;

create policy "read own steps"   on public.steps for select using (auth.uid() = user_id);
create policy "insert own steps" on public.steps for insert with check (auth.uid() = user_id);
create policy "update own steps" on public.steps for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own steps" on public.steps for delete using (auth.uid() = user_id);

-- The only thing everyone can see: team aggregates (no per-person numbers).
create or replace function public.team_totals()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'total',   coalesce(sum(steps), 0),
    'walkers', count(distinct user_id),
    'today',   coalesce(sum(steps) filter (where day = (now() at time zone 'utc')::date), 0)
  ) from public.steps;
$$;

revoke all on function public.team_totals() from public;
grant execute on function public.team_totals() to anon, authenticated;
