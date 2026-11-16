-- ============================================================================
-- Reações do feed: permite que cada like armazene o emoji escolhido.
-- Sem esta coluna, o setLike caía no fallback e todas as reações viravam ❤️.
-- Idempotente: pode ser executado várias vezes.
-- ============================================================================

alter table public.post_likes
  add column if not exists emoji text not null default '❤️';

-- Comentário para documentação do campo.
comment on column public.post_likes.emoji is 'Emoji da reação do usuário à publicação (padrão ❤️).';
