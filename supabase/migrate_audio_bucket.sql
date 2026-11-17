-- ============================================================================
-- Áudio no chat: bucket real com leitura pública e escrita restrita ao dono.
-- O caminho dos objetos começa com o user_id (auth.uid()::text).
-- Idempotente: pode ser reaplicado sem erro.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  true,
  5242880,
  array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
    'audio/aac', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/x-wav',
    'audio/3gpp', 'audio/amr'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Leitura pública: necessário para o receptor ouvir o áudio sem autenticação de storage.
drop policy if exists "audio_public_read" on storage.objects;
create policy "audio_public_read"
on storage.objects for select
using (bucket_id = 'audio');

-- Escrita: somente o próprio usuário, dentro do seu prefixo.
drop policy if exists "audio_owner_insert" on storage.objects;
create policy "audio_owner_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'audio' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "audio_owner_update" on storage.objects;
create policy "audio_owner_update"
on storage.objects for update to authenticated
using (bucket_id = 'audio' and split_part(name, '/', 1) = auth.uid()::text)
with check (bucket_id = 'audio' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "audio_owner_delete" on storage.objects;
create policy "audio_owner_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'audio' and split_part(name, '/', 1) = auth.uid()::text);
