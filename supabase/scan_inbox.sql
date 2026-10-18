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
-- v2: 6-значний код для ручного вводу в додатку (перехід на quotecraftscan:// з домашнього веб-додатка iOS ламає сторінку)
alter table public.scan_inbox add column if not exists pin text;
create index if not exists scan_inbox_pin_idx on public.scan_inbox(pin);
-- v3: прив'язані iPhone (один раз код → ключ пристрою; далі додаток сам бере останню заявку користувача)
create table if not exists public.scan_devices (
  key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
create index if not exists scan_devices_user_idx on public.scan_devices(user_id);
alter table public.scan_devices enable row level security;
-- доступ тільки через service role (API); користувачу прямий доступ не потрібен
