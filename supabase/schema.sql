create table if not exists public.profiles (
  id text primary key,
  user_id text not null unique,
  name text not null,
  handle text,
  bio text default '',
  city text default '',
  humor text default '',
  interests text[] default '{}',
  avatar_url text,
  cover jsonb default '{"k":"art","v":"aurora"}'::jsonb,
  followers integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.posts (
  id text primary key,
  author_id text not null,
  text text default '',
  kind text default 'text',
  media_url text,
  media jsonb default '[]'::jsonb,
  seed text,
  dur integer,
  likes integer default 0,
  comments_disabled boolean default false,
  created_at timestamptz default now()
);

alter table public.posts add column if not exists media jsonb default '[]'::jsonb;
alter table public.posts add column if not exists comments_disabled boolean default false;
alter table public.posts add column if not exists interactive jsonb;

create table if not exists public.post_interactions (
  id text primary key,
  post_id text not null,
  user_id text not null,
  kind text not null,
  option_id text,
  text text default '',
  created_at timestamptz default now()
);

create unique index if not exists post_interactions_unique
  on public.post_interactions (post_id, user_id, kind);
create index if not exists post_interactions_post_idx
  on public.post_interactions (post_id);
create index if not exists post_interactions_user_idx
  on public.post_interactions (user_id);

create table if not exists public.post_likes (
  post_id text not null,
  user_id text not null,
  emoji text not null default '❤️',
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes add column if not exists emoji text not null default '❤️';

create table if not exists public.post_saves (
  post_id text not null,
  user_id text not null,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id text primary key,
  post_id text not null,
  author_id text not null,
  text text not null,
  created_at timestamptz default now()
);

create table if not exists public.follows (
  follower_id text not null,
  following_id text not null,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);

create table if not exists public.communities (
  id text primary key,
  owner_id text not null,
  name text not null,
  category text default 'Outros',
  description text default '',
  cover_seed text,
  rules text[] default '{}',
  subs integer default 1,
  created_at timestamptz default now()
);

create table if not exists public.community_members (
  community_id text not null,
  user_id text not null,
  role text default 'member',
  created_at timestamptz default now(),
  primary key (community_id, user_id)
);

create table if not exists public.topics (
  id text primary key,
  community_id text not null,
  author_id text not null,
  title text not null,
  replies integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.channels (
  id text primary key,
  owner_id text not null,
  name text not null,
  description text default '',
  kind text default 'conversa',
  followers integer default 0,
  is_live boolean default false,
  livekit boolean not null default false,
  title text default '',
  viewers integer default 0,
  seed text,
  created_at timestamptz default now()
);

alter table public.channels add column if not exists livekit boolean not null default false;

create table if not exists public.channel_members (
  channel_id text not null,
  user_id text not null,
  created_at timestamptz default now(),
  primary key (channel_id, user_id)
);

create table if not exists public.channel_messages (
  id text primary key,
  channel_id text not null,
  author_id text not null,
  text text not null,
  created_at timestamptz default now()
);

create table if not exists public.message_reactions (
  message_id text not null,
  user_id text not null,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.scraps (
  id text primary key,
  profile_id text not null,
  author_id text not null,
  text text not null,
  created_at timestamptz default now()
);

create table if not exists public.direct_messages (
  id text primary key,
  sender_id text not null,
  recipient_id text not null,
  text text default '',
  attachment jsonb,
  read boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists direct_messages_sender_idx on public.direct_messages (sender_id);
create index if not exists direct_messages_recipient_idx on public.direct_messages (recipient_id);
create index if not exists direct_messages_created_idx on public.direct_messages (created_at);

create index if not exists posts_author_idx on public.posts (author_id);
create index if not exists comments_post_idx on public.comments (post_id);
create index if not exists comments_author_idx on public.comments (author_id);
create index if not exists topics_community_idx on public.topics (community_id);
create index if not exists channels_owner_idx on public.channels (owner_id);
create index if not exists channel_messages_channel_idx on public.channel_messages (channel_id);
create index if not exists channel_messages_author_idx on public.channel_messages (author_id);
create index if not exists scraps_profile_idx on public.scraps (profile_id);
create index if not exists scraps_author_idx on public.scraps (author_id);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.topics enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.scraps enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using (true);
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated with check (author_id = auth.uid()::text);
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated using (author_id = auth.uid()::text) with check (author_id = auth.uid()::text);
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using (author_id = auth.uid()::text);

alter table public.post_interactions enable row level security;

drop policy if exists post_interactions_read on public.post_interactions;
create policy post_interactions_read on public.post_interactions for select to authenticated using (true);
drop policy if exists post_interactions_insert on public.post_interactions;
create policy post_interactions_insert on public.post_interactions for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists post_interactions_update on public.post_interactions;
create policy post_interactions_update on public.post_interactions for update to authenticated using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
drop policy if exists post_interactions_delete on public.post_interactions;
create policy post_interactions_delete on public.post_interactions for delete to authenticated using (user_id = auth.uid()::text);
drop policy if exists post_interactions_post_author_delete on public.post_interactions;
create policy post_interactions_post_author_delete on public.post_interactions for delete to authenticated using (
  exists (
    select 1 from public.posts p
    where p.id = post_interactions.post_id and p.author_id = auth.uid()::text
  )
);

drop policy if exists post_likes_read on public.post_likes;
create policy post_likes_read on public.post_likes for select to authenticated using (true);
drop policy if exists post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists post_likes_delete on public.post_likes;
create policy post_likes_delete on public.post_likes for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists post_saves_read on public.post_saves;
create policy post_saves_read on public.post_saves for select to authenticated using (true);
drop policy if exists post_saves_insert on public.post_saves;
create policy post_saves_insert on public.post_saves for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists post_saves_delete on public.post_saves;
create policy post_saves_delete on public.post_saves for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated using (true);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check (author_id = auth.uid()::text);
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated using (author_id = auth.uid()::text) with check (author_id = auth.uid()::text);
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated using (author_id = auth.uid()::text);

drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid()::text);
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid()::text);

drop policy if exists communities_read on public.communities;
create policy communities_read on public.communities for select to authenticated using (true);
drop policy if exists communities_insert on public.communities;
create policy communities_insert on public.communities for insert to authenticated with check (owner_id = auth.uid()::text);
drop policy if exists communities_update on public.communities;
create policy communities_update on public.communities for update to authenticated using (owner_id = auth.uid()::text) with check (owner_id = auth.uid()::text);
drop policy if exists communities_delete on public.communities;
create policy communities_delete on public.communities for delete to authenticated using (owner_id = auth.uid()::text);

drop policy if exists community_members_read on public.community_members;
create policy community_members_read on public.community_members for select to authenticated using (true);
drop policy if exists community_members_insert on public.community_members;
create policy community_members_insert on public.community_members for insert to authenticated with check (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
);
drop policy if exists community_members_update on public.community_members;
create policy community_members_update on public.community_members for update to authenticated using (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
) with check (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
);
drop policy if exists community_members_delete on public.community_members;
create policy community_members_delete on public.community_members for delete to authenticated using (
  user_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
);

drop policy if exists topics_read on public.topics;
create policy topics_read on public.topics for select to authenticated using (true);
drop policy if exists topics_insert on public.topics;
create policy topics_insert on public.topics for insert to authenticated with check (author_id = auth.uid()::text);
drop policy if exists topics_update on public.topics;
create policy topics_update on public.topics for update to authenticated using (author_id = auth.uid()::text) with check (author_id = auth.uid()::text);
drop policy if exists topics_delete on public.topics;
create policy topics_delete on public.topics for delete to authenticated using (
  author_id = auth.uid()::text
  or exists (
    select 1 from public.communities c
    where c.id = community_id and c.owner_id = auth.uid()::text
  )
  or exists (
    select 1 from public.community_members m
    where m.community_id = community_id
      and m.user_id = auth.uid()::text
      and m.role in ('owner', 'moderator')
  )
);

drop policy if exists channels_read on public.channels;
create policy channels_read on public.channels for select to authenticated using (true);
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert to authenticated with check (owner_id = auth.uid()::text);
drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels for update to authenticated using (owner_id = auth.uid()::text) with check (owner_id = auth.uid()::text);
drop policy if exists channels_delete on public.channels;
create policy channels_delete on public.channels for delete to authenticated using (owner_id = auth.uid()::text);

drop policy if exists channel_members_read on public.channel_members;
create policy channel_members_read on public.channel_members for select to authenticated using (true);
drop policy if exists channel_members_insert on public.channel_members;
create policy channel_members_insert on public.channel_members for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists channel_members_delete on public.channel_members;
create policy channel_members_delete on public.channel_members for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists channel_messages_read on public.channel_messages;
create policy channel_messages_read on public.channel_messages for select to authenticated using (true);
drop policy if exists channel_messages_insert on public.channel_messages;
create policy channel_messages_insert on public.channel_messages for insert to authenticated with check (author_id = auth.uid()::text);
drop policy if exists channel_messages_update on public.channel_messages;
create policy channel_messages_update on public.channel_messages for update to authenticated using (author_id = auth.uid()::text) with check (author_id = auth.uid()::text);
drop policy if exists channel_messages_delete on public.channel_messages;
create policy channel_messages_delete on public.channel_messages for delete to authenticated using (author_id = auth.uid()::text);

drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions for select to authenticated using (true);
drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions for insert to authenticated with check (user_id = auth.uid()::text);
drop policy if exists message_reactions_delete on public.message_reactions;
create policy message_reactions_delete on public.message_reactions for delete to authenticated using (user_id = auth.uid()::text);

drop policy if exists direct_messages_read on public.direct_messages;
create policy direct_messages_read on public.direct_messages for select to authenticated using (
  sender_id = auth.uid()::text or recipient_id = auth.uid()::text
);
drop policy if exists direct_messages_insert on public.direct_messages;
create policy direct_messages_insert on public.direct_messages for insert to authenticated with check (
  sender_id = auth.uid()::text and recipient_id <> auth.uid()::text
);
drop policy if exists direct_messages_update on public.direct_messages;
create policy direct_messages_update on public.direct_messages for update to authenticated using (
  recipient_id = auth.uid()::text or sender_id = auth.uid()::text
) with check (
  recipient_id = auth.uid()::text or sender_id = auth.uid()::text
);
drop policy if exists direct_messages_delete on public.direct_messages;
create policy direct_messages_delete on public.direct_messages for delete to authenticated using (
  sender_id = auth.uid()::text
);

drop policy if exists scraps_read on public.scraps;
create policy scraps_read on public.scraps for select to authenticated using (true);
drop policy if exists scraps_insert on public.scraps;
create policy scraps_insert on public.scraps for insert to authenticated with check (author_id = auth.uid()::text);
drop policy if exists scraps_delete on public.scraps;
create policy scraps_delete on public.scraps for delete to authenticated using (
  author_id = auth.uid()::text or profile_id = auth.uid()::text
);

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (bucket_id = 'media');
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update to authenticated using (
  bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
);

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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_interactions'
  ) then
    alter publication supabase_realtime add table public.post_interactions;
  end if;
end $$;
