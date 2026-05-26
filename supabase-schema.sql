create extension if not exists pgcrypto;

create table if not exists public.leaderboard_scores (
    id uuid primary key default gen_random_uuid(),
    entry_id text not null unique,
    first_name text not null check (char_length(first_name) between 1 and 20),
    last_name text not null check (char_length(last_name) between 1 and 20),
    alias text not null check (char_length(alias) between 1 and 20),
    score integer not null check (score >= 0),
    savings integer not null default 0,
    minus_points integer not null default 0,
    created_at timestamptz not null default now()
);

create index if not exists leaderboard_scores_score_idx
    on public.leaderboard_scores (score desc, created_at asc);

create table if not exists public.registrations (
    id uuid primary key default gen_random_uuid(),
    registration_id text not null unique,
    first_name text not null check (char_length(first_name) between 1 and 20),
    last_name text not null check (char_length(last_name) between 1 and 20),
    company text not null check (char_length(company) between 1 and 80),
    email text not null check (position('@' in email) > 1),
    consent boolean not null default true,
    photo_linkedin_consent boolean not null default false,
    score integer not null default 0 check (score >= 0),
    savings integer not null default 0,
    minus_points integer not null default 0,
    created_at timestamptz not null default now()
);

alter table public.leaderboard_scores enable row level security;
alter table public.registrations enable row level security;

drop policy if exists "Public can read leaderboard scores" on public.leaderboard_scores;
create policy "Public can read leaderboard scores"
on public.leaderboard_scores
for select
to anon
using (true);

drop policy if exists "Public can insert leaderboard scores" on public.leaderboard_scores;
create policy "Public can insert leaderboard scores"
on public.leaderboard_scores
for insert
to anon
with check (
    char_length(first_name) between 1 and 20
    and char_length(last_name) between 1 and 20
    and char_length(alias) between 1 and 20
    and score >= 0
    and savings >= 0
    and minus_points >= 0
);

drop policy if exists "Public can insert registrations" on public.registrations;
create policy "Public can insert registrations"
on public.registrations
for insert
to anon
with check (
    consent = true
    and char_length(first_name) between 1 and 20
    and char_length(last_name) between 1 and 20
    and char_length(company) between 1 and 80
    and position('@' in email) > 1
    and score >= 0
    and savings >= 0
    and minus_points >= 0
);

revoke all on public.registrations from anon;
grant insert on public.registrations to anon;

revoke all on public.leaderboard_scores from anon;
grant select, insert on public.leaderboard_scores to anon;
