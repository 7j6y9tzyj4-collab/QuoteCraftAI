-- 💬 Відгуки / проблеми від користувачів (пише /api/feedback, читає адмін).
create table if not exists public.feedback(
  id uuid primary key default gen_random_uuid(), user_id uuid, email text, company text, screen text, text text not null, ua text,
  status text not null default 'new', created_at timestamptz not null default now());
alter table public.feedback enable row level security;
