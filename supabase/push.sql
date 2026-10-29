-- lifestyle+ notifications. Safe to run more than once.
-- Run it in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- First replace {{APP_URL}} with your app's address (https://lifestyle-plus.vercel.app) and
-- {{CRON_SECRET}} with the CRON_SECRET value set in Vercel.

-- Phones that turned notifications on. One row per device.
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh      text not null,
  auth        text not null,
  tz          text not null default 'America/Chicago',
  user_agent  text,
  updated_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "Own push subscriptions" on public.push_subscriptions;
create policy "Own push subscriptions" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Which notifications were already sent, so each one goes out once. Server only.
create table if not exists public.push_log (
  user_id  uuid not null references auth.users on delete cascade,
  key      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_log enable row level security;

-- Every minute, ask the app to send whatever is due.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'lifestyle-push-tick',
  '* * * * *',
  $cron$
    select net.http_post(
      url := '{{APP_URL}}/api/push-tick',
      headers := jsonb_build_object('Authorization', 'Bearer {{CRON_SECRET}}', 'Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  $cron$
);
