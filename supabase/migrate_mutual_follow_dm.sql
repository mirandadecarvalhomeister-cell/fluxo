-- Mensagens diretas apenas entre pessoas que se seguem (seguimento mútuo).
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()::text
    and recipient_id <> auth.uid()::text
    and exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()::text
        and f.following_id = recipient_id
    )
    and exists (
      select 1 from public.follows f
      where f.follower_id = recipient_id
        and f.following_id = auth.uid()::text
    )
  );
