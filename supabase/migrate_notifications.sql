-- Notificações em tempo real: publica curtidas, seguidores e comentários
-- no canal realtime do Supabase para o sino do FluXo funcionar ao vivo.
-- Execute este script no SQL Editor do projeto Supabase.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_likes'
  ) then
    alter publication supabase_realtime add table public.post_likes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'follows'
  ) then
    alter publication supabase_realtime add table public.follows;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;
