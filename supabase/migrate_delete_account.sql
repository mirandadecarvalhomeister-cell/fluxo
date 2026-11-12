-- Exclusão de conta feita pela própria sessão autenticada.
-- A função roda como SECURITY DEFINER para apagar os dados do usuário e,
-- por último, a própria conta em auth.users.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, storage, auth, pg_temp
as $$
declare
  uid uuid := auth.uid();
  uid_text text;
  post_ids text[] := '{}';
  comm_ids text[] := '{}';
  chan_ids text[] := '{}';
  chan_msg_ids text[] := '{}';
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  uid_text := uid::text;

  select coalesce(array_agg(id), '{}') into post_ids
  from public.posts
  where author_id = uid_text;

  select coalesce(array_agg(id), '{}') into comm_ids
  from public.communities
  where owner_id = uid_text;

  select coalesce(array_agg(id), '{}') into chan_ids
  from public.channels
  where owner_id = uid_text;

  select coalesce(array_agg(id), '{}') into chan_msg_ids
  from public.channel_messages
  where author_id = uid_text or channel_id = any(chan_ids);

  -- Interações e conteúdo ligados às publicações do usuário.
  delete from public.post_interactions
  where user_id = uid_text or post_id = any(post_ids);
  delete from public.post_likes
  where user_id = uid_text or post_id = any(post_ids);
  delete from public.post_saves
  where user_id = uid_text or post_id = any(post_ids);
  delete from public.post_reports
  where user_id = uid_text or post_id = any(post_ids);
  delete from public.comments
  where author_id = uid_text or post_id = any(post_ids);
  delete from public.post_comments
  where author_id = uid or post_id::text = any(post_ids);

  -- Relações sociais.
  delete from public.follows
  where follower_id = uid_text or following_id = uid_text;

  -- Comunidades: remove as do usuário e a participação dele nas demais.
  delete from public.community_channels
  where community_id = any(comm_ids) or channel_id = any(chan_ids);
  delete from public.community_invites
  where community_id = any(comm_ids)
     or inviter_id = uid_text
     or invitee_id = uid_text;
  delete from public.community_join_requests
  where community_id = any(comm_ids) or user_id = uid_text;
  delete from public.community_members
  where community_id = any(comm_ids) or user_id = uid_text;
  delete from public.topics
  where community_id = any(comm_ids) or author_id = uid_text;
  delete from public.community_topics
  where community_id::text = any(comm_ids) or author_id = uid;

  -- Publicações de outras pessoas em comunidades excluídas continuam no feed.
  update public.posts
  set community_id = null
  where community_id = any(comm_ids) and author_id <> uid_text;

  -- Canais e mensagens.
  delete from public.message_reactions
  where user_id = uid_text or message_id = any(chan_msg_ids);
  delete from public.channel_messages
  where id = any(chan_msg_ids);
  delete from public.channel_members
  where channel_id = any(chan_ids) or user_id = uid_text;

  -- Recados e mensagens diretas (enviadas e recebidas).
  delete from public.scraps
  where profile_id = uid_text
     or author_id = uid_text
     or profile_id in (select id from public.profiles where user_id = uid_text);
  delete from public.direct_messages
  where sender_id = uid_text or recipient_id = uid_text;
  delete from public.messages
  where sender_id = uid or recipient_id = uid;

  -- Figurinhas, preferências e relatos.
  delete from public.stickers
  where user_id = uid_text
     or pack_id in (select id from public.sticker_packs where user_id = uid_text);
  delete from public.sticker_packs where user_id = uid_text;
  delete from public.feed_preferences where user_id = uid_text;

  -- Publicações, comunidades, canais e perfil.
  delete from public.posts where id = any(post_ids);
  delete from public.communities where id = any(comm_ids);
  delete from public.channels where id = any(chan_ids);
  delete from public.profiles where user_id = uid_text or id = uid_text;

  -- Os arquivos do Storage são removidos pelo cliente via Storage API antes
  -- desta chamada (o Supabase bloqueia DELETE direto em storage.objects).

  -- Por último, a conta de autenticação. Sessões, identidades e tokens são
  -- removidos pelas chaves de integridade do Supabase Auth.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_account() from public;
revoke all on function public.delete_account() from anon;
grant execute on function public.delete_account() to authenticated;
