-- lifestyle+ undo history. Safe to run more than once.
-- Run it in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Every time a record changes or is deleted, the version it replaced is copied here first, so
-- Settings → History can put it back. Versions older than 90 days are cleared out each night.

create table if not exists public.record_history (
  hid          bigint generated always as identity primary key,
  record_id    uuid not null,
  user_id      uuid not null references auth.users on delete cascade,
  kind         text not null,
  data         jsonb not null,
  deleted      boolean not null,
  updated_at   timestamptz not null,           -- when that version was made
  replaced_at  timestamptz not null default now() -- when it was replaced
);
create index if not exists record_history_user_time on public.record_history (user_id, replaced_at desc);
create index if not exists record_history_record on public.record_history (record_id, replaced_at desc);

-- You can read your own history. Nobody writes to it directly; the trigger below does.
alter table public.record_history enable row level security;
drop policy if exists "Read own history" on public.record_history;
create policy "Read own history" on public.record_history for select using (auth.uid() = user_id);

create or replace function public.keep_record_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.data is distinct from new.data or old.deleted is distinct from new.deleted then
    insert into public.record_history (record_id, user_id, kind, data, deleted, updated_at)
    values (old.id, old.user_id, old.kind, old.data, old.deleted, old.updated_at);
  end if;
  return new;
end $$;

drop trigger if exists records_history on public.records;
create trigger records_history
  after update on public.records
  for each row execute function public.keep_record_history();

-- Nightly cleanup (pg_cron is already on if you set up notifications).
create extension if not exists pg_cron;
select cron.unschedule('lifestyle-history-cleanup') where exists (select 1 from cron.job where jobname = 'lifestyle-history-cleanup');
select cron.schedule(
  'lifestyle-history-cleanup',
  '17 9 * * *',
  $cron$ delete from public.record_history where replaced_at < now() - interval '90 days'; $cron$
);
