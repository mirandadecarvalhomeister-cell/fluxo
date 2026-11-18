-- ============================================================================
-- Emojis favoritos por usuário (sincronizados entre dispositivos).
-- Recent+: continua no navegador; favoritos passam a ter persistência real.
-- Idempotente.
-- ============================================================================

create table if not exists public.emoji_favorites (
  user_id text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, emoji)
);

alter table public.emoji_favorites enable row level security;

drop policy if exists emoji_favorites_read on public.emoji_favorites;
create policy emoji_favorites_read
on public.emoji_favorites for select using (user_id = auth.uid()::text);

drop policy if exists emoji_favorites_insert on public.emoji_favorites;
create policy emoji_favorites_insert
on public.emoji_favorites for insert to authenticated
with check (user_id = auth.uid()::text);

drop policy if exists emoji_favorites_delete on public.emoji_favorites;
create policy emoji_favorites_delete
on public.emoji_favorites for delete to authenticated
using (user_id = auth.uid()::text);

do $$
begin
  alter publication supabase_realtime add table public.emoji_favorites;
exception when duplicate_object then null;
end $$;
