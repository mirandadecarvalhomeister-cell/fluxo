-- Etapa 4: compartilhamento autorizado de posts de comunidades públicas no
-- feed e suporte a paginação por cursor. Idempotente, sem apagar dados.

alter table public.posts
  add column if not exists share_to_feed boolean not null default false;

create index if not exists posts_feed_cursor_idx
  on public.posts (created_at desc, id desc)
  where community_id is null;

-- Posts de comunidade compartilhados no feed.
create index if not exists posts_shared_feed_idx
  on public.posts (created_at desc)
  where share_to_feed = true;

-- RLS: somente o autor pode optar por compartilhar; leitura já é filtrada por
-- can_read_community(). Nenhuma policy existente é removida.
