-- ============================================================================
-- Comunidades v2: galeria coletiva, eventos, classificados, tópicos fixados
-- e notificações persistentes. Reaproveita posts/community_members/topics.
-- Idempotente e preserva dados existentes.
-- ============================================================================

-- Tópicos fixados: coluna nova, sem quebrar tópicos existentes.
alter table public.topics add column if not exists pinned boolean not null default false;

-- ---------------------------------------------------------------------------
-- Galeria coletiva: mídias compartaneadas por membros da comunidade.
-- ---------------------------------------------------------------------------
create table if not exists public.community_gallery (
  id text primary key,
  community_id text not null references public.communities(id) on delete cascade,
  author_id text not null,
  kind text not null default 'photo' check (kind in ('photo', 'video')),
  src text not null,
  title text,
  theme text,
  event_label text,
  created_at timestamptz not null default now()
);

create index if not exists community_gallery_community_idx
  on public.community_gallery(community_id, created_at desc);

alter table public.community_gallery enable row level security;

drop policy if exists community_gallery_read on public.community_gallery;
create policy community_gallery_read
on public.community_gallery for select using (true);

drop policy if exists community_gallery_insert on public.community_gallery;
create policy community_gallery_insert
on public.community_gallery for insert to authenticated
with check (
  author_id = auth.uid()::text
  and exists (
    select 1 from public.community_members m
    where m.community_id = community_gallery.community_id
      and m.user_id = auth.uid()::text
  )
);

drop policy if exists community_gallery_delete on public.community_gallery;
create policy community_gallery_delete
on public.community_gallery for delete to authenticated
using (
  author_id = auth.uid()::text
  or public.is_community_mod(community_id)
);

-- ---------------------------------------------------------------------------
-- Calendário de eventos da comunidade.
-- ---------------------------------------------------------------------------
create table if not exists public.community_events (
  id text primary key,
  community_id text not null references public.communities(id) on delete cascade,
  created_by text not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists community_events_community_idx
  on public.community_events(community_id, starts_at);

alter table public.community_events enable row level security;

drop policy if exists community_events_read on public.community_events;
create policy community_events_read
on public.community_events for select using (true);

drop policy if exists community_events_insert on public.community_events;
create policy community_events_insert
on public.community_events for insert to authenticated
with check (
  created_by = auth.uid()::text
  and exists (
    select 1 from public.community_members m
    where m.community_id = community_events.community_id
      and m.user_id = auth.uid()::text
  )
);

drop policy if exists community_events_update on public.community_events;
create policy community_events_update
on public.community_events for update to authenticated
using (created_by = auth.uid()::text or public.is_community_mod(community_id))
with check (created_by = auth.uid()::text or public.is_community_mod(community_id));

drop policy if exists community_events_delete on public.community_events;
create policy community_events_delete
on public.community_events for delete to authenticated
using (created_by = auth.uid()::text or public.is_community_mod(community_id));

-- Confirmação de presença.
create table if not exists public.community_event_rsvps (
  event_id text not null references public.community_events(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.community_event_rsvps enable row level security;

drop policy if exists community_event_rsvps_read on public.community_event_rsvps;
create policy community_event_rsvps_read
on public.community_event_rsvps for select using (true);

drop policy if exists community_event_rsvps_insert on public.community_event_rsvps;
create policy community_event_rsvps_insert
on public.community_event_rsvps for insert to authenticated
with check (user_id = auth.uid()::text);

drop policy if exists community_event_rsvps_delete on public.community_event_rsvps;
create policy community_event_rsvps_delete
on public.community_event_rsvps for delete to authenticated
using (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Classificados da comunidade.
-- ---------------------------------------------------------------------------
create table if not exists public.community_classifieds (
  id text primary key,
  community_id text not null references public.communities(id) on delete cascade,
  author_id text not null,
  category text not null,
  title text not null,
  description text,
  price text,
  contact text,
  images jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'sold', 'removed')),
  created_at timestamptz not null default now()
);

create index if not exists community_classifieds_community_idx
  on public.community_classifieds(community_id, created_at desc);

alter table public.community_classifieds enable row level security;

drop policy if exists community_classifieds_read on public.community_classifieds;
create policy community_classifieds_read
on public.community_classifieds for select using (true);

drop policy if exists community_classifieds_insert on public.community_classifieds;
create policy community_classifieds_insert
on public.community_classifieds for insert to authenticated
with check (
  author_id = auth.uid()::text
  and exists (
    select 1 from public.community_members m
    where m.community_id = community_classifieds.community_id
      and m.user_id = auth.uid()::text
  )
);

drop policy if exists community_classifieds_update on public.community_classifieds;
create policy community_classifieds_update
on public.community_classifieds for update to authenticated
using (author_id = auth.uid()::text or public.is_community_mod(community_id))
with check (author_id = auth.uid()::text or public.is_community_mod(community_id));

drop policy if exists community_classifieds_delete on public.community_classifieds;
create policy community_classifieds_delete
on public.community_classifieds for delete to authenticated
using (author_id = auth.uid()::text or public.is_community_mod(community_id));

-- ---------------------------------------------------------------------------
-- Notificações persistentes de comunidade.
-- ---------------------------------------------------------------------------
create table if not exists public.community_notifications (
  id text primary key,
  user_id text not null,
  community_id text not null references public.communities(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists community_notifications_user_idx
  on public.community_notifications(user_id, read, created_at desc);

alter table public.community_notifications enable row level security;

drop policy if exists community_notifications_read on public.community_notifications;
create policy community_notifications_read
on public.community_notifications for select using (user_id = auth.uid()::text);

drop policy if exists community_notifications_update on public.community_notifications;
create policy community_notifications_update
on public.community_notifications for update to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists community_notifications_delete on public.community_notifications;
create policy community_notifications_delete
on public.community_notifications for delete to authenticated
using (user_id = auth.uid()::text);

-- Fixar/desafixar tópicos: permitir também moderadores.
drop policy if exists topics_update on public.topics;
create policy topics_update
on public.topics for update to authenticated
using (
  author_id = auth.uid()::text
  or public.is_community_mod(community_id)
)
with check (
  author_id = auth.uid()::text
  or public.is_community_mod(community_id)
);

-- Realtime das novas tabelas.
do $$
begin
  alter publication supabase_realtime add table public.community_gallery;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.community_events;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.community_classifieds;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.community_notifications;
exception when duplicate_object then null;
end $$;
