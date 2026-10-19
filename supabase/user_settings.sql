-- Налаштування власника: Zelle для завдатку, мінімальна ціна роботи.
create table if not exists public.user_settings(
 user_id uuid primary key references auth.users(id) on delete cascade,
 zelle text,
 min_job_price numeric default 0,
 updated_at timestamptz default now());
alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
