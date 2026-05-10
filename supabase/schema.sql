-- Run this in Supabase SQL Editor.
-- Single-user setup. For multi-user, add user_id + RLS policies.

create table if not exists public.trades (
  id          bigint primary key,
  date        date not null,
  time        text,
  symbol      text not null,
  direction   text not null default 'Long',
  setup       text,
  entry       numeric,
  exit        numeric,
  size        numeric,
  pnl         numeric,
  r_multiple  numeric,
  grade       text,
  emotion     text,
  notes       text,
  screenshot  text,
  created_at  timestamptz default now()
);

create index if not exists trades_date_idx on public.trades (date);
create index if not exists trades_symbol_idx on public.trades (symbol);

-- DEMO MODE: anon key has full access. Lock down before going public.
alter table public.trades enable row level security;
drop policy if exists "anon all" on public.trades;
create policy "anon all" on public.trades for all using (true) with check (true);
