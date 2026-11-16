-- ============================================================================
-- Quiz BOOM — refresh de rodadas: +1 a cada 3 horas (máximo 8 por dia),
-- somado às rodadas grátis semanais e ao bônus de convites de amigos.
-- Idempotente: pode ser executado várias vezes.
-- ============================================================================

-- A assinatura do retorno mudou (nova coluna refresh_rounds), então removemos
-- a versão antiga antes de recriá-la.
drop function if exists public.quiz_round_status();

-- Helper: quantas rodadas de refresh o usuário tem direito hoje (0..8).
-- A cada 3 horas completas desde a meia-noite (UTC) concede +1, até 8/dia.
create or replace function public.quiz_refresh_rounds()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select least(
    8,
    floor(
      extract(epoch from (now() - date_trunc('day', now() at time zone 'utc') at time zone 'utc'))
      / 10800
    )::int
  );
$$;

-- Status: 3 grátis/semana + bônus de convites + refresh diário.
create or replace function public.quiz_round_status()
returns table (used integer, bonus integer, free_rounds integer, remaining integer, refresh_rounds integer)
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
  ),
  refreshed as (
    select public.quiz_refresh_rounds() as total
  )
  select
    u.total as used,
    b.total as bonus,
    3 as free_rounds,
    greatest(0, 3 + b.total + rf.total - u.total) as remaining,
    rf.total as refresh_rounds
  from used_runs u, bonus_rounds b, refreshed rf;
$$;

-- Início de rodada: usa o mesmo limite (3 + convites + refresh).
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
  v_refresh integer;
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

  v_refresh := public.quiz_refresh_rounds();

  v_limit := 3 + v_bonus + v_refresh;
  if v_used >= v_limit then
    raise exception 'quiz_round_limit';
  end if;

  insert into public.quiz_runs (id, user_id, category, mode, total)
  values (p_id, v_uid, coalesce(nullif(p_category, ''), 'todas'), coalesce(nullif(p_mode, ''), 'classic'), greatest(1, coalesce(p_total, 10)));

  return p_id;
end;
$$;

revoke all on function public.quiz_refresh_rounds() from public;
grant execute on function public.quiz_refresh_rounds() to authenticated, service_role;
