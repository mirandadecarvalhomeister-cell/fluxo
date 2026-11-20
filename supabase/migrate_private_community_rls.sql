-- ============================================================================
-- Hotfix de segurança: comunidades privadas (VibeFluxo 2.0 — Etapa 0)
--
-- Antes desta migration, posts/eventos/classificados/galeria/membros de
-- QUALQUER comunidade eram legíveis por qualquer usuário autenticado
-- (`USING (true)`), e qualquer pessoa podia inserir posts em uma comunidade
-- privada sem ser membro.
--
-- Estratégia:
--   1) funções SECURITY DEFINER `can_read_community` / `can_write_community`
--   2) policies de leitura passam a depender da visibilidade da comunidade
--   3) `posts_insert` valida associação do autor à comunidade
--   4) índices de apoio
--
-- Comunidades abertas continuam com o comportamento atual (qualquer
-- autenticado pode ler e publicar). Nenhuma linha existente é alterada.
-- Idempotente. Aplique no SQL Editor ou via `supabase db query --remote`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Helpers de autorização
-- ---------------------------------------------------------------------------
create or replace function public.can_read_community(p_community_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.communities c
    where c.id = p_community_id
      and (
        coalesce(c.is_private, false) = false
        or c.owner_id = auth.uid()::text
      )
  ) or exists (
    select 1 from public.community_members m
    where m.community_id = p_community_id
      and m.user_id = auth.uid()::text
      and m.role in ('member', 'owner', 'moderator', 'admin')
  );
$$;

create or replace function public.can_write_community(p_community_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.communities c
    where c.id = p_community_id
      and coalesce(c.is_private, false) = false
  ) or exists (
    select 1 from public.community_members m
    where m.community_id = p_community_id
      and m.user_id = auth.uid()::text
      and m.role in ('member', 'owner', 'moderator', 'admin')
  ) or exists (
    select 1 from public.communities c
    where c.id = p_community_id and c.owner_id = auth.uid()::text
  );
$$;

revoke all on function public.can_read_community(text) from public;
revoke all on function public.can_write_community(text) from public;
grant execute on function public.can_read_community(text) to authenticated, service_role, postgres;
grant execute on function public.can_write_community(text) to authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 2) Posts
-- ---------------------------------------------------------------------------
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated
using (
  community_id is null
  or public.can_read_community(community_id)
);

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
with check (
  author_id = auth.uid()::text
  and (
    community_id is null
    or public.can_write_community(community_id)
  )
);

-- ---------------------------------------------------------------------------
-- 3) Entidades ligadas a comunidades — leitura restrita
-- ---------------------------------------------------------------------------
drop policy if exists community_events_read on public.community_events;
create policy community_events_read on public.community_events for select to authenticated
using (public.can_read_community(community_id));

drop policy if exists community_classifieds_read on public.community_classifieds;
create policy community_classifieds_read on public.community_classifieds for select to authenticated
using (public.can_read_community(community_id));

drop policy if exists community_gallery_read on public.community_gallery;
create policy community_gallery_read on public.community_gallery for select to authenticated
using (public.can_read_community(community_id));

drop policy if exists community_channels_read on public.community_channels;
create policy community_channels_read on public.community_channels for select to authenticated
using (public.can_read_community(community_id));

drop policy if exists community_members_read on public.community_members;
create policy community_members_read on public.community_members for select to authenticated
using (public.can_read_community(community_id));

-- community_topics.community_id é uuid; as demais tabelas usam text.
drop policy if exists "ver topicos" on public.community_topics;
create policy "ver topicos" on public.community_topics for select to authenticated
using (public.can_read_community(community_id::text));

-- RSVPs não têm community_id: resolve pela comunidade do evento.
drop policy if exists community_event_rsvps_read on public.community_event_rsvps;
create policy community_event_rsvps_read on public.community_event_rsvps for select to authenticated
using (
  exists (
    select 1 from public.community_events e
    where e.id = community_event_rsvps.event_id
      and public.can_read_community(e.community_id)
  )
);

-- ---------------------------------------------------------------------------
-- 4) Índices de apoio (não alteram dados)
-- ---------------------------------------------------------------------------
create index if not exists community_members_user_idx
  on public.community_members (user_id);
create index if not exists posts_community_created_idx
  on public.posts (community_id, created_at desc);
