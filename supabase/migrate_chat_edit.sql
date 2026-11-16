-- ============================================================================
-- Chat: edição de mensagens enviadas + políticas restritas ao autor.
-- Idempotente.
-- ============================================================================

alter table public.direct_messages
  add column if not exists edited_at timestamptz;

-- Só quem enviou pode editar o texto. O "visto" continua permitido para o
-- destinatário (política separada abaixo).
drop policy if exists direct_messages_update on public.direct_messages;
create policy direct_messages_update on public.direct_messages
  for update to authenticated
  using (recipient_id = auth.uid()::text or sender_id = auth.uid()::text)
  with check (recipient_id = auth.uid()::text or sender_id = auth.uid()::text);

create or replace function public.edit_direct_message(p_id text, p_text text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_id is null or length(trim(coalesce(p_text, ''))) = 0 then
    raise exception 'empty_message';
  end if;

  update public.direct_messages
  set text = trim(p_text),
      edited_at = now()
  where id = p_id
    and sender_id = v_uid;

  return found;
end;
$$;

revoke all on function public.edit_direct_message(text, text) from public;
grant execute on function public.edit_direct_message(text, text) to authenticated;

-- Remove o auto-grant do Supabase para `anon` (concedido automaticamente ao
-- criar funções pela plataforma); só quem está logado pode editar mensagens.
revoke execute on function public.edit_direct_message(text, text) from anon;

-- Realtime: garante que o UPDATE chegue aos dois lados.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;
