-- ============================================================================
-- Quiz BOOM! — modos Clássico/Insano, limites de rodada, medalhas, desafios
-- e rankings (semanal global + entre amigos).
-- Idempotente: pode ser executado várias vezes.
-- ============================================================================

create table if not exists public.quiz_runs (
  id text primary key,
  user_id text not null,
  category text not null default 'todas',
  mode text not null default 'classic' check (mode in ('classic', 'insane')),
  status text not null default 'playing' check (status in ('playing', 'finished', 'abandoned')),
  score integer not null default 0,
  correct integer not null default 0,
  answered integer not null default 0,
  total integer not null default 10,
  best_combo integer not null default 0,
  duration_ms integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists quiz_runs_user_idx on public.quiz_runs (user_id);
create index if not exists quiz_runs_finished_idx on public.quiz_runs (finished_at);
create index if not exists quiz_runs_week_idx on public.quiz_runs (started_at);
create index if not exists quiz_runs_score_idx on public.quiz_runs (score desc);

create table if not exists public.quiz_medals (
  user_id text not null,
  category text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, category)
);

create index if not exists quiz_medals_user_idx on public.quiz_medals (user_id);

create table if not exists public.quiz_bonus_rounds (
  id bigserial primary key,
  user_id text not null,
  rounds integer not null default 3,
  reason text not null default 'invite',
  created_at timestamptz not null default now()
);

create index if not exists quiz_bonus_user_idx on public.quiz_bonus_rounds (user_id, created_at);

create table if not exists public.quiz_invites (
  invitee_id text primary key,
  inviter_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_challenges (
  id text primary key,
  challenger_id text not null,
  challenger_name text not null default '',
  category text not null default 'todas',
  mode text not null default 'classic' check (mode in ('classic', 'insane')),
  size integer not null default 10,
  target_score integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quiz_challenges_challenger_idx on public.quiz_challenges (challenger_id);

alter table public.quiz_runs enable row level security;
alter table public.quiz_medals enable row level security;
alter table public.quiz_bonus_rounds enable row level security;
alter table public.quiz_invites enable row level security;
alter table public.quiz_challenges enable row level security;

drop policy if exists quiz_runs_read on public.quiz_runs;
create policy quiz_runs_read on public.quiz_runs
  for select to authenticated using (true);

drop policy if exists quiz_runs_insert on public.quiz_runs;
create policy quiz_runs_insert on public.quiz_runs
  for insert to authenticated with check (user_id = auth.uid()::text);

drop policy if exists quiz_runs_update on public.quiz_runs;
create policy quiz_runs_update on public.quiz_runs
  for update to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

drop policy if exists quiz_runs_delete on public.quiz_runs;
create policy quiz_runs_delete on public.quiz_runs
  for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists quiz_medals_read on public.quiz_medals;
create policy quiz_medals_read on public.quiz_medals
  for select to authenticated using (true);

drop policy if exists quiz_medals_insert on public.quiz_medals;
create policy quiz_medals_insert on public.quiz_medals
  for insert to authenticated with check (user_id = auth.uid()::text);

drop policy if exists quiz_bonus_read on public.quiz_bonus_rounds;
create policy quiz_bonus_read on public.quiz_bonus_rounds
  for select to authenticated using (user_id = auth.uid()::text);

drop policy if exists quiz_invites_read on public.quiz_invites;
create policy quiz_invites_read on public.quiz_invites
  for select to authenticated using (
    inviter_id = auth.uid()::text or invitee_id = auth.uid()::text
  );

drop policy if exists quiz_challenges_read on public.quiz_challenges;
create policy quiz_challenges_read on public.quiz_challenges
  for select to authenticated using (true);

drop policy if exists quiz_challenges_insert on public.quiz_challenges;
create policy quiz_challenges_insert on public.quiz_challenges
  for insert to authenticated with check (challenger_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Status de rodadas da semana: 3 grátis + bônus de convites.
-- ---------------------------------------------------------------------------
create or replace function public.quiz_round_status()
returns table (used integer, bonus integer, free_rounds integer, remaining integer)
language sql
stable
security definer
set search_path = public
as $$
  with week as (
    select date_trunc('week', now()) as starts_at
  ),
  used_runs as (
    select count(*)::int as total
    from public.quiz_runs r, week w
    where r.user_id = auth.uid()::text
      and r.started_at >= w.starts_at
  ),
  bonus_rounds as (
    select coalesce(sum(b.rounds), 0)::int as total
    from public.quiz_bonus_rounds b, week w
    where b.user_id = auth.uid()::text
      and b.created_at >= w.starts_at
  )
  select
    u.total as used,
    b.total as bonus,
    3 as free_rounds,
    greatest(0, 3 + b.total - u.total) as remaining
  from used_runs u, bonus_rounds b;
$$;

-- ---------------------------------------------------------------------------
-- Inicia uma rodada de forma atômica, aplicando o limite semanal.
-- ---------------------------------------------------------------------------
create or replace function public.quiz_begin_run(
  p_id text,
  p_category text,
  p_mode text,
  p_total integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_used integer;
  v_bonus integer;
  v_limit integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select coalesce(count(*), 0)::int into v_used
  from public.quiz_runs
  where user_id = v_uid
    and started_at >= date_trunc('week', now());

  select coalesce(sum(rounds), 0)::int into v_bonus
  from public.quiz_bonus_rounds
  where user_id = v_uid
    and created_at >= date_trunc('week', now());

  v_limit := 3 + v_bonus;
  if v_used >= v_limit then
    raise exception 'quiz_round_limit';
  end if;

  insert into public.quiz_runs (id, user_id, category, mode, total)
  values (p_id, v_uid, coalesce(nullif(p_category, ''), 'todas'), coalesce(nullif(p_mode, ''), 'classic'), greatest(1, coalesce(p_total, 10)));

  return p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Convite: ao abrir o Fluxo por um link de convite, libera +3 rodadas para
-- quem convidou e +3 para quem chegou (uma única vez por conta).
-- ---------------------------------------------------------------------------
create or replace function public.quiz_claim_invite(p_inviter text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_inserted integer := 0;
begin
  if v_uid is null or p_inviter is null or p_inviter = '' or p_inviter = v_uid then
    return false;
  end if;

  -- Qualquer usuário cadastrado pode ser convidado (auth.users é a fonte da
  -- verdade; perfis podem não existir porque o cadastro não cria um).
  if not exists (select 1 from auth.users where id::text = p_inviter) then
    return false;
  end if;

  insert into public.quiz_invites (invitee_id, inviter_id)
  values (v_uid, p_inviter)
  on conflict (invitee_id) do nothing;

  get diagnostics v_inserted = row_count;
  if coalesce(v_inserted, 0) = 0 then
    return false;
  end if;

  insert into public.quiz_bonus_rounds (user_id, rounds, reason)
  values (p_inviter, 3, 'invite'), (v_uid, 3, 'invite_welcome');

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ranking semanal global (todos os jogadores).
-- ---------------------------------------------------------------------------
create or replace function public.quiz_weekly_ranking(p_limit integer default 50)
returns table (
  "position" bigint,
  user_id text,
  name text,
  handle text,
  avatar_url text,
  total_score bigint,
  rounds bigint,
  best_combo integer
)
language sql
stable
security definer
set search_path = public
as $$
  with scored as (
    select
      r.user_id,
      sum(r.score)::bigint as total_score,
      count(*)::bigint as rounds,
      max(r.best_combo)::int as best_combo
    from public.quiz_runs r
    where r.status = 'finished'
      and r.finished_at >= date_trunc('week', now())
    group by r.user_id
  )
  select
    row_number() over (order by s.total_score desc, s.best_combo desc, s.rounds asc) as position,
    s.user_id,
    coalesce(p.name, 'Jogador') as name,
    coalesce(p.handle, '') as handle,
    p.avatar_url,
    s.total_score,
    s.rounds,
    s.best_combo
  from scored s
  left join public.profiles p on p.user_id = s.user_id
  order by s.total_score desc, s.best_combo desc, s.rounds asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- ---------------------------------------------------------------------------
-- Ranking semanal entre amigos (quem o usuário segue + ele mesmo).
-- ---------------------------------------------------------------------------
create or replace function public.quiz_friends_ranking(p_limit integer default 50)
returns table (
  "position" bigint,
  user_id text,
  name text,
  handle text,
  avatar_url text,
  total_score bigint,
  rounds bigint,
  best_combo integer
)
language sql
stable
security definer
set search_path = public
as $$
  with friends as (
    select auth.uid()::text as user_id
    union
    select f.following_id
    from public.follows f
    where f.follower_id = auth.uid()::text
  ),
  scored as (
    select
      r.user_id,
      sum(r.score)::bigint as total_score,
      count(*)::bigint as rounds,
      max(r.best_combo)::int as best_combo
    from public.quiz_runs r
    join friends f on f.user_id = r.user_id
    where r.status = 'finished'
      and r.finished_at >= date_trunc('week', now())
    group by r.user_id
  )
  select
    row_number() over (order by s.total_score desc, s.best_combo desc, s.rounds asc) as position,
    s.user_id,
    coalesce(p.name, 'Jogador') as name,
    coalesce(p.handle, '') as handle,
    p.avatar_url,
    s.total_score,
    s.rounds,
    s.best_combo
  from scored s
  left join public.profiles p on p.user_id = s.user_id
  order by s.total_score desc, s.best_combo desc, s.rounds asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.quiz_round_status() from public;
revoke all on function public.quiz_begin_run(text, text, text, integer) from public;
revoke all on function public.quiz_claim_invite(text) from public;
revoke all on function public.quiz_weekly_ranking(integer) from public;
revoke all on function public.quiz_friends_ranking(integer) from public;

grant execute on function public.quiz_round_status() to authenticated;
grant execute on function public.quiz_begin_run(text, text, text, integer) to authenticated;
grant execute on function public.quiz_claim_invite(text) to authenticated;
grant execute on function public.quiz_weekly_ranking(integer) to authenticated;
grant execute on function public.quiz_friends_ranking(integer) to authenticated;

-- O Supabase concede EXECUTE para `anon` automaticamente ao criar funções
-- pela plataforma (dashboard/API). Remove explicitamente para que apenas
-- usuários autenticados executem as funções do quiz.
revoke execute on function public.quiz_round_status() from anon;
revoke execute on function public.quiz_begin_run(text, text, text, integer) from anon;
revoke execute on function public.quiz_claim_invite(text) from anon;
revoke execute on function public.quiz_weekly_ranking(integer) from anon;
revoke execute on function public.quiz_friends_ranking(integer) from anon;
