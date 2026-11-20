-- ============================================================================
-- Segurança de mídias e reações de mensagens (VibeFluxo / FluXo)
--
-- 1) Bucket PRIVADO para mídias de comunidades privadas.
--    Caminho no bucket: <community_id>/<user_id>/<arquivo>
--    (split_part(name,'/',1) = comunidade, 2 = usuário)
--    Leitura apenas para membros (ou owner/mod) da comunidade.
-- 2) Realtime de message_reactions (o chat passa a persistir reações).
-- 3) Colunas opcionais em direct_messages para metadados de áudio e
--    respostas/fixação — compatíveis com mensagens antigas (valor nulo).
--
-- Idempotente: pode ser reaplicado sem erro. Aplique no SQL Editor do Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Bucket privado
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-private',
  'community-private',
  false,
  5242880,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/heic',
    'video/mp4','video/quicktime','video/webm',
    'audio/mpeg','audio/mp3','audio/mp4','audio/m4a','audio/x-m4a',
    'audio/aac','audio/ogg','audio/webm','audio/wav','audio/x-wav',
    'audio/3gpp','audio/amr',
    'application/pdf','text/plain'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Verifica membro/owner/moderador da comunidade dona do objeto.
-- SECURITY DEFINER para não depender das policies de community_members.
create or replace function public.can_read_community_private_media(object_name text)
returns boolean
language sql
security definer
stable
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.community_members m
    where m.community_id = split_part(object_name, '/', 1)
      and m.user_id = auth.uid()::text
  ) or exists (
    select 1
    from public.communities c
    where c.id = split_part(object_name, '/', 1)
      and c.owner_id = auth.uid()::text
  );
$$;

revoke all on function public.can_read_community_private_media(text) from public;
grant execute on function public.can_read_community_private_media(text)
  to authenticated, service_role, postgres;

drop policy if exists "community_private_read" on storage.objects;
create policy "community_private_read"
on storage.objects for select to authenticated
using (bucket_id = 'community-private' and public.can_read_community_private_media(name));

drop policy if exists "community_private_insert" on storage.objects;
create policy "community_private_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'community-private'
  and split_part(name, '/', 2) = auth.uid()::text
  and public.can_read_community_private_media(name)
);

drop policy if exists "community_private_update" on storage.objects;
create policy "community_private_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'community-private'
  and split_part(name, '/', 2) = auth.uid()::text
)
with check (
  bucket_id = 'community-private'
  and split_part(name, '/', 2) = auth.uid()::text
);

drop policy if exists "community_private_delete" on storage.objects;
create policy "community_private_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'community-private'
  and split_part(name, '/', 2) = auth.uid()::text
);

-- ---------------------------------------------------------------------------
-- 2) Realtime de reações em mensagens
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Metadados opcionais de mensagens (não altera linhas existentes)
-- ---------------------------------------------------------------------------
alter table public.direct_messages add column if not exists reply_to text;
alter table public.direct_messages add column if not exists pinned boolean not null default false;
alter table public.direct_messages add column if not exists duration integer;
alter table public.direct_messages add column if not exists waves jsonb;

create index if not exists direct_messages_reply_to_idx
  on public.direct_messages (reply_to)
  where reply_to is not null;
