-- Arena do Caos: histórico real de partidas e ranking.
-- Execute no SQL Editor do Supabase. Seguro para rodar mais de uma vez.

create table if not exists public.game_matches (
  id uuid primary key,
  game text not null default 'arena-do-caos',
  mode text not null default 'last-survivor',
  room_code text not null,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  player_count integer not null default 0 check (player_count between 0 and 8),
  winner_id text,
  winner_name text,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.game_match_players (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.game_matches(id) on delete cascade,
  user_id text,
  name text not null default 'Jogador',
  handle text not null default '',
  placement integer check (placement between 1 and 8),
  kills integer not null default 0,
  damage integer not null default 0,
  survived_ms integer not null default 0,
  is_winner boolean not null default false,
  played_at timestamptz not null default now()
);

-- Uma linha por jogador em cada partida (jogadores locais sem id podem repetir null).
create unique index if not exists game_match_players_match_user_idx
  on public.game_match_players (match_id, user_id)
  where user_id is not null;

create index if not exists game_matches_ended_at_idx
  on public.game_matches (ended_at desc);
create index if not exists game_match_players_user_idx
  on public.game_match_players (user_id, played_at desc);
create index if not exists game_match_players_played_at_idx
  on public.game_match_players (played_at desc);

alter table public.game_matches enable row level security;
alter table public.game_match_players enable row level security;

-- Leitura pública para ranking e histórico visível no Fluxo.
drop policy if exists "game matches readable" on public.game_matches;
create policy "game matches readable"
  on public.game_matches for select
  using (true);

drop policy if exists "game match players readable" on public.game_match_players;
create policy "game match players readable"
  on public.game_match_players for select
  using (true);

-- Escrita apenas pelo servidor com service_role (bypassa RLS). Não criar
-- policies de insert/update/delete para anon/authenticated.
