-- Comunicados oficiais das comunidades (VibeFluxo 2.0 — Etapa 3).
-- Somente owner/admin/moderator podem escrever; leitura segue a visibilidade
-- da comunidade (pública ou membro). Idempotente; não apaga dados existentes.

create table if not exists public.community_announcements (
  id text primary key,
  community_id text not null references public.communities(id) on delete cascade,
  author_id text not null,
  title text not null,
  body text not null default '',
  image_url text,
  priority integer not null default 0,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists community_announcements_comm_idx
  on public.community_announcements (community_id, pinned desc, priority desc, created_at desc);

alter table public.community_announcements enable row level security;

drop policy if exists community_announcements_read on public.community_announcements;
create policy community_announcements_read on public.community_announcements
  for select to authenticated
  using (public.can_read_community(community_id));

drop policy if exists community_announcements_insert on public.community_announcements;
create policy community_announcements_insert on public.community_announcements
  for insert to authenticated
  with check (
    author_id = auth.uid()::text
    and (
      exists (select 1 from public.communities c where c.id = community_id and c.owner_id = auth.uid()::text)
      or exists (
        select 1 from public.community_members m
        where m.community_id = community_announcements.community_id
          and m.user_id = auth.uid()::text
          and m.role in ('owner', 'admin', 'moderator')
      )
    )
  );

drop policy if exists community_announcements_update on public.community_announcements;
create policy community_announcements_update on public.community_announcements
  for update to authenticated
  using (
    exists (select 1 from public.communities c where c.id = community_id and c.owner_id = auth.uid()::text)
    or exists (
      select 1 from public.community_members m
      where m.community_id = community_announcements.community_id
        and m.user_id = auth.uid()::text
        and m.role in ('owner', 'admin', 'moderator')
    )
  );

drop policy if exists community_announcements_delete on public.community_announcements;
create policy community_announcements_delete on public.community_announcements
  for delete to authenticated
  using (
    author_id = auth.uid()::text
    or exists (select 1 from public.communities c where c.id = community_id and c.owner_id = auth.uid()::text)
    or exists (
      select 1 from public.community_members m
      where m.community_id = community_announcements.community_id
        and m.user_id = auth.uid()::text
        and m.role in ('owner', 'admin', 'moderator')
    )
  );

-- Registro de leitura (audiência do comunicado).
create table if not exists public.community_announcement_reads (
  announcement_id text not null references public.community_announcements(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.community_announcement_reads enable row level security;
drop policy if exists community_announcement_reads_read on public.community_announcement_reads;
create policy community_announcement_reads_read on public.community_announcement_reads
  for select to authenticated using (user_id = auth.uid()::text or exists (
    select 1 from public.community_announcements a
    where a.id = community_announcement_reads.announcement_id
      and public.can_read_community(a.community_id)
  ));
drop policy if exists community_announcement_reads_insert on public.community_announcement_reads;
create policy community_announcement_reads_insert on public.community_announcement_reads
  for insert to authenticated with check (user_id = auth.uid()::text);

-- Realtime para atualizar a lista ao vivo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'community_announcements'
  ) then
    alter publication supabase_realtime add table public.community_announcements;
  end if;
end $$;
