-- Enquetes de lives/chat.
--
-- mode = 'fluxo' -> também vira publicação no Fluxo (post_id) e aceita votos
--                   de quem não está assistindo, até closes_at.
-- mode = 'chat'  -> exclusiva da transmissão; só aceita votos enquanto a live
--                   está no ar e fecha automaticamente quando a live termina.
--
-- O voto é único e imutável por pessoa (unique + ausência de update/delete).
-- O prazo máximo de 24h é validado no servidor.
--
-- Idempotente: pode rodar várias vezes.

create table if not exists public.channel_polls (
  id text primary key,
  channel_id text not null,
  created_by text not null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  mode text not null default 'chat' check (mode in ('chat', 'fluxo')),
  status text not null default 'open' check (status in ('open', 'closed')),
  post_id text,
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.channel_poll_votes (
  id text primary key default (gen_random_uuid()::text),
  poll_id text not null,
  user_id text not null,
  option_id text not null,
  created_at timestamptz default now()
);

create unique index if not exists channel_poll_votes_unique
  on public.channel_poll_votes (poll_id, user_id);
create index if not exists channel_polls_channel_idx
  on public.channel_polls (channel_id);
create index if not exists channel_polls_post_idx
  on public.channel_polls (post_id);
create index if not exists channel_poll_votes_poll_idx
  on public.channel_poll_votes (poll_id);

alter table public.channel_polls enable row level security;
alter table public.channel_poll_votes enable row level security;

-- Enquetes são visíveis para quem está no app; o cliente só exibe as do canal
-- aberto e as do modo "fluxo" aparecem no feed por serem publicações.
drop policy if exists channel_polls_read on public.channel_polls;
create policy channel_polls_read on public.channel_polls
  for select to authenticated using (true);

drop policy if exists channel_polls_insert on public.channel_polls;
create policy channel_polls_insert on public.channel_polls
  for insert to authenticated
  with check (
    created_by = auth.uid()::text
    and exists (
      select 1 from public.channels c
      where c.id = channel_polls.channel_id
        and c.owner_id = auth.uid()::text
    )
    and closes_at is not null
    and closes_at > now()
    and closes_at <= now() + interval '24 hours'
  );

drop policy if exists channel_polls_update on public.channel_polls;
create policy channel_polls_update on public.channel_polls
  for update to authenticated
  using (
    created_by = auth.uid()::text
    and exists (
      select 1 from public.channels c
      where c.id = channel_polls.channel_id
        and c.owner_id = auth.uid()::text
    )
  )
  with check (
    created_by = auth.uid()::text
    and exists (
      select 1 from public.channels c
      where c.id = channel_polls.channel_id
        and c.owner_id = auth.uid()::text
    )
  );

drop policy if exists channel_polls_delete on public.channel_polls;
create policy channel_polls_delete on public.channel_polls
  for delete to authenticated
  using (
    created_by = auth.uid()::text
    and exists (
      select 1 from public.channels c
      where c.id = channel_polls.channel_id
        and c.owner_id = auth.uid()::text
    )
  );

-- Reabrir enquete encerrada ou trocar dono/modo não é permitido.
create or replace function public.guard_channel_poll_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'closed' and new.status = 'open' then
    raise exception 'Enquete encerrada não pode ser reaberta.';
  end if;
  if new.created_by <> old.created_by
     or new.channel_id <> old.channel_id
     or new.mode <> old.mode
     or new.question <> old.question then
    raise exception 'Não é possível alterar a autoria, o canal, o modo ou a pergunta da enquete.';
  end if;
  if old.closes_at is not null and new.closes_at is not null and new.closes_at > old.closes_at then
    raise exception 'O prazo da enquete não pode ser ampliado.';
  end if;
  if new.closes_at is not null
     and new.closes_at > coalesce(old.created_at, now()) + interval '24 hours' then
    raise exception 'A enquete não pode durar mais de 24 horas.';
  end if;
  if new.options is distinct from old.options
     and exists (select 1 from public.channel_poll_votes v where v.poll_id = old.id) then
    raise exception 'As alternativas não podem mudar depois que alguém votou.';
  end if;
  return new;
end;
$$;

drop trigger if exists channel_polls_guard_update on public.channel_polls;
create trigger channel_polls_guard_update
  before update on public.channel_polls
  for each row execute function public.guard_channel_poll_update();

-- Votos: únicos, imutáveis e só dentro de enquete aberta/no prazo. Enquetes
-- exclusivas do chat exigem a live no ar.
drop policy if exists channel_poll_votes_read on public.channel_poll_votes;
create policy channel_poll_votes_read on public.channel_poll_votes
  for select to authenticated using (
    user_id = auth.uid()::text
    or exists (
      select 1
      from public.channel_polls p
      where p.id = channel_poll_votes.poll_id
        and (
          p.status = 'closed'
          or (p.closes_at is not null and now() >= p.closes_at)
        )
    )
  );

drop policy if exists channel_poll_votes_insert on public.channel_poll_votes;
create policy channel_poll_votes_insert on public.channel_poll_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()::text
    and exists (
      select 1
      from public.channel_polls p
      where p.id = channel_poll_votes.poll_id
        and p.status = 'open'
        and (p.closes_at is null or now() < p.closes_at)
        and (
          p.mode = 'fluxo'
          or exists (
            select 1 from public.channels c
            where c.id = p.channel_id and c.is_live
          )
        )
        and exists (
          select 1
          from jsonb_array_elements(p.options) opt
          where opt->>'id' = channel_poll_votes.option_id
        )
    )
  );

-- Sem policies de update/delete: voto enviado não muda. O unique acima garante
-- um voto por pessoa por enquete.

-- Encerramento automático das enquetes exclusivas do chat quando a live cai.
create or replace function public.close_chat_polls_on_live_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_live = true and new.is_live = false then
    update public.channel_polls
      set status = 'closed',
          closed_at = coalesce(closed_at, now())
      where channel_id = new.id
        and mode = 'chat'
        and status = 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists channels_close_chat_polls on public.channels;
create trigger channels_close_chat_polls
  after update of is_live on public.channels
  for each row execute function public.close_chat_polls_on_live_end();

-- Realtime para chat e feed acompanharem a mesma enquete.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channel_polls'
  ) then
    alter publication supabase_realtime add table public.channel_polls;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channel_poll_votes'
  ) then
    alter publication supabase_realtime add table public.channel_poll_votes;
  end if;
end
$$;
