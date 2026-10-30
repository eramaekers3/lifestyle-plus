-- lifestyle+ database
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Every piece of data (tasks, time blocks, week plans, habits, weigh-ins, workouts, settings)
-- is stored as one small record. The phone saves changes locally first, then syncs them here.

create table if not exists public.records (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  kind        text not null,                 -- 'task', 'block', 'week', 'habit', 'habitlog', 'weight', 'workout', 'draft', 'settings'
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null,          -- when the change was made (set by the device)
  deleted     boolean not null default false,-- soft delete so other devices hear about it
  synced_at   timestamptz not null default now() -- when the server received it (used for pulling changes)
);

create index if not exists records_user_synced on public.records (user_id, synced_at);
create index if not exists records_user_kind on public.records (user_id, kind);

-- Only you can see and change your own rows.
alter table public.records enable row level security;

drop policy if exists "Own records" on public.records;
create policy "Own records" on public.records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Stamp synced_at with the server clock on every insert and update.
create or replace function public.touch_synced_at()
returns trigger language plpgsql as $$
begin
  new.synced_at = now();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.touch_synced_at();

-- Apple Health keys (added for the iPhone Shortcut that sends Health data).
-- Only a hash of each key is stored. Run this part too if you set up the database earlier.
create table if not exists public.health_tokens (
  token_hash   text primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.health_tokens enable row level security;

drop policy if exists "Own health keys" on public.health_tokens;
create policy "Own health keys" on public.health_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- lifestyle+ bank connections (Plaid). Safe to run more than once.
-- Run it in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- One row per bank login. The access token here is what lets the server read that bank, so this
-- table has row level security ON and NO policies: signed-in users (and the app) can't read it at
-- all. Only the server, using the service key, can.
create table if not exists public.plaid_items (
  item_id       text primary key,
  user_id       uuid not null references auth.users on delete cascade,
  access_token  text not null,
  institution   text,
  cursor        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists plaid_items_user on public.plaid_items (user_id);
alter table public.plaid_items enable row level security;
-- Deliberately no policies.

-- Faster lookups for bank data in the records table.
create index if not exists records_user_kind_item on public.records (user_id, kind, ((data->>'itemId')));
