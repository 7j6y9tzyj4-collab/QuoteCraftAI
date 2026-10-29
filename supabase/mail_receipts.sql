-- Чеки з Gmail (Apps Script → /api/receipts-mail): auto — програма додає в розрахунок; review — «Розібрати»; skipped — не чек / дублікат.
alter table public.user_settings add column if not exists mail_key uuid unique;
create table if not exists public.mail_receipts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  msg_id text not null,
  store text,
  subject text,
  payload jsonb not null default '{}'::jsonb,
  sid text,
  suggest text,
  reason text,
  confidence numeric,
  status text not null default 'review' check (status in ('auto','review','applied','skipped')),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique(user_id,msg_id));
alter table public.mail_receipts enable row level security;
create policy "own mail receipts" on public.mail_receipts for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create index if not exists mail_receipts_pending on public.mail_receipts(user_id) where applied_at is null;
