-- Mensagens diretas: permitir que qualquer participante da conversa apague
-- mensagens (limpar histórico / apagar conversa), não só quem enviou.
-- Idempotente: pode rodar várias vezes.
drop policy if exists direct_messages_delete on public.direct_messages;
create policy direct_messages_delete on public.direct_messages
  for delete to authenticated using (
    sender_id = auth.uid()::text or recipient_id = auth.uid()::text
  );
