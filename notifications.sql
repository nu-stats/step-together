-- Run once in Supabase SQL Editor, after schema.sql.

-- Each person can switch the daily messages off (the page has a checkbox for this).
create table if not exists public.notify_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default true
);
alter table public.notify_prefs enable row level security;
create policy "read own prefs"   on public.notify_prefs for select using (auth.uid() = user_id);
create policy "insert own prefs" on public.notify_prefs for insert with check (auth.uid() = user_id);
create policy "update own prefs" on public.notify_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Prevents double-sending. Only the edge function (service role) can touch it.
create table if not exists public.message_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null,
  primary key (user_id, day, kind)
);
alter table public.message_log enable row level security;

-- Used by the edge function to detect 25/50/75/100% milestones. Not callable by site visitors.
create or replace function public.total_through(d date)
returns bigint language sql security definer set search_path = public as $$
  select coalesce(sum(steps), 0) from public.steps where day <= d;
$$;
revoke all on function public.total_through(date) from public, anon, authenticated;

-- Hourly trigger. Replace the two placeholders, then run this part LAST (after deploying the function).
-- The function itself decides whether it is the 8 AM or 8 PM hour in your time zone, so daylight saving is handled.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-message',
  '0 * * * *',
  $$ select net.http_post(
       url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/daily-message',
       headers := '{"x-cron-secret": "YOUR-CRON-SECRET"}'::jsonb
     ) $$
);
