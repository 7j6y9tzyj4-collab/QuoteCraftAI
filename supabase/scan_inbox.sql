-- LiDAR-скани з iPhone (додаток QuoteCraft Scan): веб створює рядок з токеном, додаток кладе payload, веб забирає і видаляє.
-- Запустити один раз у Supabase → SQL Editor.
create table if not exists public.scan_inbox (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  survey_id text,
  room_id text,
  payload jsonb,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists scan_inbox_user_idx on public.scan_inbox(user_id);
alter table public.scan_inbox enable row level security;
drop policy if exists "scan_inbox select own" on public.scan_inbox;
create policy "scan_inbox select own" on public.scan_inbox for select using (auth.uid() = user_id);
drop policy if exists "scan_inbox insert own" on public.scan_inbox;
create policy "scan_inbox insert own" on public.scan_inbox for insert with check (auth.uid() = user_id);
drop policy if exists "scan_inbox delete own" on public.scan_inbox;
create policy "scan_inbox delete own" on public.scan_inbox for delete using (auth.uid() = user_id);
-- payload пише сервер (service role) з /api/scan-import — політика update для користувача не потрібна.
