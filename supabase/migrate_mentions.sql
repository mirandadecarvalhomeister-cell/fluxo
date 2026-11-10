-- Notificações de menção (@handle): publica INSERTs de publicações no
-- realtime para avisar quem foi mencionado sem recarregar a página.
-- Idempotente: pode rodar várias vezes sem erro.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end
$$;
