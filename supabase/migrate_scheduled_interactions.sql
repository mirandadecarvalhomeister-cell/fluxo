-- Experiências interativas programadas: trava de participação e liberação de
-- resultados no SERVIDOR (RLS), não só no frontend.
--
-- Regras aplicadas aqui:
-- 1. Ninguém lê votos/respostas de outra pessoa antes de resultsAt.
-- 2. Ninguém vota/responde depois de closesAt.
-- 3. Publicações programadas não aceitam troca de voto/resposta (nem delete
--    seguido de insert) depois de enviado.
-- 4. Publicações comuns continuam com o comportamento tradicional.
--
-- Idempotente: pode rodar várias vezes.

-- Lê datas do JSONB sem quebrar a consulta se o valor estiver inválido.
create or replace function public.interactive_schedule_at(p_interactive jsonb, p_key text)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v text;
begin
  if p_interactive is null then
    return null;
  end if;
  if jsonb_typeof(p_interactive) = 'string' then
    begin
      p_interactive := (p_interactive #>> '{}')::jsonb;
    exception
      when others then
        return null;
    end;
  end if;
  if jsonb_typeof(p_interactive) <> 'object' then
    return null;
  end if;
  if (p_interactive->'schedule'->>'mode') is distinct from 'scheduled' then
    return null;
  end if;
  v := p_interactive->'schedule'->>p_key;
  if v is null or v = '' then
    return null;
  end if;
  return v::timestamptz;
exception
  when others then
    return null;
end;
$$;

-- Resultados: cada pessoa vê a própria participação; o restante só depois da
-- liberação. Autores também não enxergam antecipadamente pelo banco/API.
drop policy if exists post_interactions_read on public.post_interactions;
create policy post_interactions_read on public.post_interactions
  for select to authenticated
  using (
    user_id = auth.uid()::text
    or exists (
      select 1
      from public.posts p
      where p.id = post_interactions.post_id
        and (
          public.interactive_schedule_at(p.interactive, 'resultsAt') is null
          or now() >= public.interactive_schedule_at(p.interactive, 'resultsAt')
        )
    )
  );

-- Participação: só enquanto o prazo está aberto. "view" não é participação e
-- continua liberado para métricas básicas.
drop policy if exists post_interactions_insert on public.post_interactions;
create policy post_interactions_insert on public.post_interactions
  for insert to authenticated
  with check (
    user_id = auth.uid()::text
    and exists (
      select 1
      from public.posts p
      where p.id = post_interactions.post_id
        and (
          post_interactions.kind = 'view'
          or public.interactive_schedule_at(p.interactive, 'closesAt') is null
          or now() < public.interactive_schedule_at(p.interactive, 'closesAt')
        )
    )
  );

-- Publicação programada é imutável depois do primeiro envio: o upsert do app
-- vira UPDATE e é barrado aqui.
drop policy if exists post_interactions_update on public.post_interactions;
create policy post_interactions_update on public.post_interactions
  for update to authenticated
  using (
    user_id = auth.uid()::text
    and exists (
      select 1
      from public.posts p
      where p.id = post_interactions.post_id
        and public.interactive_schedule_at(p.interactive, 'closesAt') is null
    )
  )
  with check (
    user_id = auth.uid()::text
    and exists (
      select 1
      from public.posts p
      where p.id = post_interactions.post_id
        and public.interactive_schedule_at(p.interactive, 'closesAt') is null
    )
  );

-- Apagar para votar de novo também é uma forma de alterar o voto.
drop policy if exists post_interactions_delete on public.post_interactions;
create policy post_interactions_delete on public.post_interactions
  for delete to authenticated
  using (
    user_id = auth.uid()::text
    and exists (
      select 1
      from public.posts p
      where p.id = post_interactions.post_id
        and public.interactive_schedule_at(p.interactive, 'closesAt') is null
    )
  );

-- O autor continua podendo limpar participações ao excluir a publicação.
drop policy if exists post_interactions_post_author_delete on public.post_interactions;
create policy post_interactions_post_author_delete on public.post_interactions
  for delete to authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_interactions.post_id
        and p.author_id = auth.uid()::text
    )
  );

-- Prazos controlados no servidor: ninguém amplia o prazo além de 24h nem
-- libera resultados adiantando datas. Encerrar antes continua permitido.
create or replace function public.guard_post_interactive_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
  o_mode text;
  v_format text;
  o_format text;
  v_closes timestamptz;
  v_results timestamptz;
  v_limit timestamptz;
  o_closes timestamptz;
  o_results timestamptz;
begin
  if new.interactive is not null and jsonb_typeof(new.interactive) <> 'object' then
    raise exception 'Formato inválido de publicação interativa.';
  end if;

  v_mode := new.interactive->'schedule'->>'mode';
  v_format := new.interactive->>'format';

  if tg_op = 'UPDATE' then
    o_mode := old.interactive->'schedule'->>'mode';
    o_format := old.interactive->>'format';
    if o_mode = 'scheduled' and v_mode is distinct from 'scheduled' then
      raise exception 'Uma publicação programada não pode deixar de ser programada.';
    end if;
    if o_format is not null and v_format is distinct from o_format then
      raise exception 'O formato de uma publicação interativa não pode ser alterado.';
    end if;
  end if;

  if v_mode is distinct from 'scheduled' then
    return new;
  end if;

  if v_format = 'classic' then
    raise exception 'Publicações comuns não podem ser programadas.';
  end if;

  begin
    v_closes := (new.interactive->'schedule'->>'closesAt')::timestamptz;
    v_results := coalesce(
      (new.interactive->'schedule'->>'resultsAt')::timestamptz,
      v_closes
    );
  exception
    when others then
      raise exception 'Datas do agendamento inválidas.';
  end;

  if v_closes is null then
    raise exception 'Publicação programada precisa de um prazo de encerramento.';
  end if;
  if tg_op = 'INSERT' then
    v_limit := now() + interval '24 hours 5 minutes';
  else
    v_limit := coalesce(old.created_at, now()) + interval '24 hours';
  end if;
  if v_closes > v_limit then
    raise exception 'O prazo máximo de uma experiência é de 24 horas.';
  end if;
  if v_results < v_closes then
    raise exception 'Os resultados não podem ser liberados antes do encerramento.';
  end if;
  if v_results > v_closes + interval '24 hours' then
    raise exception 'A liberação dos resultados deve ocorrer em até 24 horas após o encerramento.';
  end if;

  if tg_op = 'UPDATE' then
    begin
      o_closes := (old.interactive->'schedule'->>'closesAt')::timestamptz;
      o_results := coalesce(
        (old.interactive->'schedule'->>'resultsAt')::timestamptz,
        o_closes
      );
    exception
      when others then
        o_closes := null;
        o_results := null;
    end;
    if o_closes is not null and v_closes > o_closes then
      raise exception 'O prazo já definido não pode ser ampliado.';
    end if;
    if o_results is not null and v_results > o_results then
      raise exception 'A liberação já definida não pode ser adiada.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists posts_guard_interactive_schedule on public.posts;
create trigger posts_guard_interactive_schedule
  before insert or update on public.posts
  for each row execute function public.guard_post_interactive_schedule();
