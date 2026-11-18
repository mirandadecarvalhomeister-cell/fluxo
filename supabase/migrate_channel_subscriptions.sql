-- ============================================================================
-- Canais no modelo YouTube: inscrições reais por canal.
-- Um canal passa a ser a identidade do criador; vídeos são posts.kind='video'
-- publicados pelo dono. Inscritos acompanham a grade de vídeos do canal.
-- Idempotente.
-- ============================================================================

create table if not exists public.channel_subscriptions (
  channel_id text not null references public.channels(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists channel_subscriptions_user_idx
  on public.channel_subscriptions(user_id);

alter table public.channel_subscriptions enable row level security;

drop policy if exists channel_subscriptions_read on public.channel_subscriptions;
create policy channel_subscriptions_read
on public.channel_subscriptions for select using (true);

drop policy if exists channel_subscriptions_insert on public.channel_subscriptions;
create policy channel_subscriptions_insert
on public.channel_subscriptions for insert to authenticated
with check (user_id = auth.uid()::text);

drop policy if exists channel_subscriptions_delete on public.channel_subscriptions;
create policy channel_subscriptions_delete
on public.channel_subscriptions for delete to authenticated
using (user_id = auth.uid()::text);

-- Contador de inscritos mantido por trigger (atômico, não confia no cliente).
create or replace function public.sync_channel_subscribers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.channels set followers = coalesce(followers, 0) + 1 where id = new.channel_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.channels set followers = greatest(0, coalesce(followers, 0) - 1) where id = old.channel_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists channel_subscriptions_count on public.channel_subscriptions;
create trigger channel_subscriptions_count
after insert or delete on public.channel_subscriptions
for each row execute function public.sync_channel_subscribers();

-- Realtime para inscrições.
do $$
begin
  alter publication supabase_realtime add table public.channel_subscriptions;
exception when duplicate_object then null;
end $$;

-- Garante que o dono do canal seja sempre membro (role owner) e normaliza tipos legados.
update public.channels set kind = 'palco' where kind in ('live', 'avisos', 'conversa');
