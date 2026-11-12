-- Live em tempo real: o chat do canal e o encerramento da transmissão
-- precisam chegar sem refresh para quem está assistindo.
-- Estas tabelas existiam fora da publicação supabase_realtime.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channels'
  ) then
    alter publication supabase_realtime add table public.channels;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channel_messages'
  ) then
    alter publication supabase_realtime add table public.channel_messages;
  end if;
end $$;

alter table public.channels replica identity full;
alter table public.channel_messages replica identity full;

grant select on public.channels to anon, authenticated;
grant select on public.channel_messages to anon, authenticated;
