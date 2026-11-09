drop table if exists public.direct_messages cascade;
drop table if exists public.scraps cascade;
drop table if exists public.message_reactions cascade;
drop table if exists public.channel_messages cascade;
drop table if exists public.channel_members cascade;
drop table if exists public.channels cascade;
drop table if exists public.topics cascade;
drop table if exists public.community_members cascade;
drop table if exists public.communities cascade;
drop table if exists public.follows cascade;
drop table if exists public.comments cascade;
drop table if exists public.post_saves cascade;
drop table if exists public.post_likes cascade;
drop table if exists public.posts cascade;
drop table if exists public.profiles cascade;

drop policy if exists media_read on storage.objects;
drop policy if exists media_insert on storage.objects;
drop policy if exists media_update on storage.objects;
drop policy if exists media_delete on storage.objects;

update storage.buckets set public = true where id = 'media';
