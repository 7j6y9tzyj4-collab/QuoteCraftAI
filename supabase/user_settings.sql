-- Налаштування власника: Telegram-сповіщення, Stripe (завдаток карткою), мінімальна ціна, нагадування.
create table if not exists public.user_settings(
 user_id uuid primary key references auth.users(id) on delete cascade,
 telegram_bot_token text, telegram_chat_id text, stripe_secret_key text,
 min_job_price numeric default 0, remind_days int default 3,
 updated_at timestamptz default now());
alter table public.user_settings enable row level security;
create policy "own settings" on public.user_settings for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
