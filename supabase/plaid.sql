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
