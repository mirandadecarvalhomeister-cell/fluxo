-- Ranking global do jogo Enigmas: melhor marca de cada usuário.
create table if not exists public.enigma_scores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Jogador',
  level integer not null default 1 check (level between 1 and 100),
  score integer not null default 0 check (score >= 0),
  hints integer not null default 0 check (hints >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists enigma_scores_ranking_idx
  on public.enigma_scores (level desc, score desc, hints asc, updated_at asc);

alter table public.enigma_scores enable row level security;

drop policy if exists enigma_scores_read on public.enigma_scores;
create policy enigma_scores_read on public.enigma_scores
  for select to authenticated using (true);

drop policy if exists enigma_scores_insert on public.enigma_scores;
create policy enigma_scores_insert on public.enigma_scores
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists enigma_scores_update on public.enigma_scores;
create policy enigma_scores_update on public.enigma_scores
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.enigma_scores to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.enigma_scores;
exception when duplicate_object then null; end $$;

alter table public.enigma_scores replica identity full;
