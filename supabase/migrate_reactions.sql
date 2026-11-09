alter table public.post_likes
  add column if not exists emoji text not null default '❤️';
