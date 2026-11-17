-- ============================================================================
-- Respostas e curtidas em comentários.
-- comments.parent_id  -> resposta encadeada (cascade apaga filhos)
-- comment_likes       -> curtidas por comentário, RLS por usuário
-- Idempotente.
-- ============================================================================

alter table public.comments
  add column if not exists parent_id text references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx on public.comments(parent_id);

create table if not exists public.comment_likes (
  comment_id text not null references public.comments(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_comment_idx on public.comment_likes(comment_id);

alter table public.comment_likes enable row level security;

drop policy if exists comment_likes_read on public.comment_likes;
create policy comment_likes_read
on public.comment_likes for select using (true);

drop policy if exists comment_likes_insert on public.comment_likes;
create policy comment_likes_insert
on public.comment_likes for insert to authenticated
with check (user_id = auth.uid()::text);

drop policy if exists comment_likes_delete on public.comment_likes;
create policy comment_likes_delete
on public.comment_likes for delete to authenticated
using (user_id = auth.uid()::text);

-- Realtime para curtidas em comentários.
do $$
begin
  alter publication supabase_realtime add table public.comment_likes;
exception
  when duplicate_object then null;
end $$;
