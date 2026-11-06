-- 🧠 Навчання на правках: правила, які програма вивела з ✏️-правок власника (і ті, що він дописав сам).
create table if not exists public.calc_lessons(
  id uuid primary key default gen_random_uuid(), user_id uuid not null, text text not null, count int not null default 1,
  source text, example text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists calc_lessons_user on public.calc_lessons(user_id,active);
alter table public.calc_lessons enable row level security;
