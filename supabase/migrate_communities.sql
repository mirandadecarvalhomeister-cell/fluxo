-- Comunidades espontaneas, preferencias do feed e controles de recomendacao.
-- Migracao idempotente: pode ser executada mais de uma vez sem perder dados.

alter table public.communities add column if not exists icon_url text;
alter table public.communities add column if not exists cover_url text;
alter table public.communities add column if not exists is_private boolean not null default false;
alter table public.communities add column if not exists rules text[] default '{}';
alter table public.posts add column if not exists community_id text;

create table if not exists public.community_join_requests (
  community_id text not null,
  user_id text not null,
  status text not null default 'pending',
  created_at timestamptz default now(),
  primary key (community_id, user_id)
);

create table if not exists public.community_invites (
  id text primary key,
  community_id text not null,
  inviter_id text not null,
  invitee_id text not null,
  status text not null default 'pending',
  created_at timestamptz default now(),
  unique (community_id, invitee_id)
);

create table if not exists public.community_channels (
  community_id text not null,
  channel_id text not null,
  created_at timestamptz default now(),
  primary key (community_id, channel_id)
);

create table if not exists public.feed_preferences (
  user_id text primary key,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.post_reports (
  id text primary key,
  post_id text not null,
  user_id text not null,
  reason text default '',
  created_at timestamptz default now()
);

create index if not exists community_join_requests_user_idx
  on public.community_join_requests (user_id);
create index if not exists community_invites_invitee_idx
  on public.community_invites (invitee_id);
create index if not exists community_channels_channel_idx
  on public.community_channels (channel_id);
create index if not exists posts_community_idx
  on public.posts (community_id);

alter table public.community_join_requests enable row level security;
alter table public.community_invites enable row level security;
alter table public.community_channels enable row level security;
alter table public.feed_preferences enable row level security;
alter table public.post_reports enable row level security;

drop policy if exists community_join_requests_read on public.community_join_requests;
create policy community_join_requests_read on public.community_join_requests for select to authenticated using (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or exists (
    select 1 from public.community_members m
    where m.community_id = community_join_requests.community_id
      and m.user_id = auth.uid()::text
      and m.role in ('owner', 'moderator')
  )
);
drop policy if exists community_join_requests_insert on public.community_join_requests;
create policy community_join_requests_insert on public.community_join_requests for insert to authenticated with check (
  user_id = auth.uid()::text
);
drop policy if exists community_join_requests_delete on public.community_join_requests;
create policy community_join_requests_delete on public.community_join_requests for delete to authenticated using (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or exists (
    select 1 from public.community_members m
    where m.community_id = community_join_requests.community_id
      and m.user_id = auth.uid()::text
      and m.role in ('owner', 'moderator')
  )
);

drop policy if exists community_invites_read on public.community_invites;
create policy community_invites_read on public.community_invites for select to authenticated using (
  invitee_id = auth.uid()::text
  or inviter_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
);
drop policy if exists community_invites_insert on public.community_invites;
create policy community_invites_insert on public.community_invites for insert to authenticated with check (
  inviter_id = auth.uid()::text
);
drop policy if exists community_invites_update on public.community_invites;
create policy community_invites_update on public.community_invites for update to authenticated using (
  invitee_id = auth.uid()::text
  or inviter_id = auth.uid()::text
) with check (
  invitee_id = auth.uid()::text
  or inviter_id = auth.uid()::text
);
drop policy if exists community_invites_delete on public.community_invites;
create policy community_invites_delete on public.community_invites for delete to authenticated using (
  inviter_id = auth.uid()::text
  or invitee_id = auth.uid()::text
);

drop policy if exists community_channels_read on public.community_channels;
create policy community_channels_read on public.community_channels for select to authenticated using (true);
drop policy if exists community_channels_insert on public.community_channels;
create policy community_channels_insert on public.community_channels for insert to authenticated with check (
  exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or exists (
    select 1 from public.community_members m
    where m.community_id = community_channels.community_id
      and m.user_id = auth.uid()::text
      and m.role in ('owner', 'moderator')
  )
);
drop policy if exists community_channels_delete on public.community_channels;
create policy community_channels_delete on public.community_channels for delete to authenticated using (
  exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or exists (
    select 1 from public.community_members m
    where m.community_id = community_channels.community_id
      and m.user_id = auth.uid()::text
      and m.role in ('owner', 'moderator')
  )
);

drop policy if exists feed_preferences_read on public.feed_preferences;
create policy feed_preferences_read on public.feed_preferences for select to authenticated using (
  user_id = auth.uid()::text
);
drop policy if exists feed_preferences_insert on public.feed_preferences;
create policy feed_preferences_insert on public.feed_preferences for insert to authenticated with check (
  user_id = auth.uid()::text
);
drop policy if exists feed_preferences_update on public.feed_preferences;
create policy feed_preferences_update on public.feed_preferences for update to authenticated using (
  user_id = auth.uid()::text
) with check (
  user_id = auth.uid()::text
);

drop policy if exists post_reports_read on public.post_reports;
create policy post_reports_read on public.post_reports for select to authenticated using (
  user_id = auth.uid()::text
);
drop policy if exists post_reports_insert on public.post_reports;
create policy post_reports_insert on public.post_reports for insert to authenticated with check (
  user_id = auth.uid()::text
);

drop policy if exists community_join_requests_update on public.community_join_requests;
create policy community_join_requests_update on public.community_join_requests for update to authenticated using (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or exists (
    select 1 from public.community_members m
    where m.community_id = community_join_requests.community_id
      and m.user_id = auth.uid()::text
      and m.role in ('owner', 'moderator')
  )
) with check (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or exists (
    select 1 from public.community_members m
    where m.community_id = community_join_requests.community_id
      and m.user_id = auth.uid()::text
      and m.role in ('owner', 'moderator')
  )
);

create table if not exists public.sticker_packs (
  id text primary key,
  user_id text not null,
  name text not null,
  icon text default '✨',
  created_at timestamptz default now()
);

create table if not exists public.stickers (
  id text primary key,
  pack_id text not null,
  user_id text not null,
  src text not null,
  created_at timestamptz default now()
);

create index if not exists sticker_packs_user_idx on public.sticker_packs (user_id);
create index if not exists stickers_pack_idx on public.stickers (pack_id);

alter table public.sticker_packs enable row level security;
alter table public.stickers enable row level security;

drop policy if exists sticker_packs_read on public.sticker_packs;
create policy sticker_packs_read on public.sticker_packs for select to authenticated using (true);
drop policy if exists sticker_packs_insert on public.sticker_packs;
create policy sticker_packs_insert on public.sticker_packs for insert to authenticated with check (
  user_id = auth.uid()::text
);
drop policy if exists sticker_packs_update on public.sticker_packs;
create policy sticker_packs_update on public.sticker_packs for update to authenticated using (
  user_id = auth.uid()::text
) with check (
  user_id = auth.uid()::text
);
drop policy if exists sticker_packs_delete on public.sticker_packs;
create policy sticker_packs_delete on public.sticker_packs for delete to authenticated using (
  user_id = auth.uid()::text
);

drop policy if exists stickers_read on public.stickers;
create policy stickers_read on public.stickers for select to authenticated using (true);
drop policy if exists stickers_insert on public.stickers;
create policy stickers_insert on public.stickers for insert to authenticated with check (
  user_id = auth.uid()::text
);
drop policy if exists stickers_delete on public.stickers;
create policy stickers_delete on public.stickers for delete to authenticated using (
  user_id = auth.uid()::text
);

-- Moderadores podem editar a comunidade e aprovar/remover participantes.
-- A funcao SECURITY DEFINER evita recursao de RLS ao consultar a propria tabela.
create or replace function public.is_community_mod(p_community_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = p_community_id
      and m.user_id = auth.uid()::text
      and m.role in ('owner', 'moderator')
  );
$$;

grant execute on function public.is_community_mod(text) to authenticated;

drop policy if exists communities_update on public.communities;
create policy communities_update on public.communities for update to authenticated using (
  owner_id = auth.uid()::text or public.is_community_mod(id)
) with check (
  owner_id = auth.uid()::text or public.is_community_mod(id)
);

drop policy if exists community_members_insert on public.community_members;
create policy community_members_insert on public.community_members for insert to authenticated with check (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or public.is_community_mod(community_id)
);
drop policy if exists community_members_update on public.community_members;
create policy community_members_update on public.community_members for update to authenticated using (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or public.is_community_mod(community_id)
) with check (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or public.is_community_mod(community_id)
);
drop policy if exists community_members_delete on public.community_members;
create policy community_members_delete on public.community_members for delete to authenticated using (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or public.is_community_mod(community_id)
);
