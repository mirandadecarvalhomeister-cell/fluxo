-- Feed interativo: formato da publicação em posts.interactive e
-- participações (votos, respostas e entradas em desafios) em
-- public.post_interactions. Idempotente: pode rodar várias vezes.
alter table public.posts
  add column if not exists interactive jsonb;

create table if not exists public.post_interactions (
  id text primary key,
  post_id text not null,
  user_id text not null,
  kind text not null,
  option_id text,
  text text default '',
  created_at timestamptz default now()
);

create unique index if not exists post_interactions_unique
  on public.post_interactions (post_id, user_id, kind);
create index if not exists post_interactions_post_idx
  on public.post_interactions (post_id);
create index if not exists post_interactions_user_idx
  on public.post_interactions (user_id);

alter table public.post_interactions enable row level security;

drop policy if exists post_interactions_read on public.post_interactions;
create policy post_interactions_read on public.post_interactions
  for select to authenticated using (true);

drop policy if exists post_interactions_insert on public.post_interactions;
create policy post_interactions_insert on public.post_interactions
  for insert to authenticated with check (user_id = auth.uid()::text);

drop policy if exists post_interactions_update on public.post_interactions;
create policy post_interactions_update on public.post_interactions
  for update to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

drop policy if exists post_interactions_delete on public.post_interactions;
create policy post_interactions_delete on public.post_interactions
  for delete to authenticated using (user_id = auth.uid()::text);

-- Resultados ao vivo: publica INSERTs/UPDATEs das participações no realtime.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_interactions'
  ) then
    alter publication supabase_realtime add table public.post_interactions;
  end if;
end
$$;
