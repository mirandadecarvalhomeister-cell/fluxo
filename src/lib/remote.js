import { createClient } from '@supabase/supabase-js';
import { durSeconds, parseRemoteMedia } from './media';
import {
  isSupabaseEnabled,
  supabase,
  supabaseAnonKey,
  supabaseUrl,
} from './supabase';
import { slug } from './utils';

const enabled = () => isSupabaseEnabled && !!supabase;

// Verdadeiro apenas quando há um usuário autenticado no Supabase.
// Usado para não conceder bônus de convite a visitantes não cadastrados.
export async function hasSession() {
  if (!enabled()) return false;
  try {
    const { data } = await supabase.auth.getUser();
    return !!(data && data.user);
  } catch {
    return false;
  }
}
const warn = (error) => console.warn('[supabase]', error?.message || error);

// Domínio público usado nos links de confirmação de e-mail, recuperação de
// senha e OAuth. Sempre prioriza o domínio em que o site está aberto para não
// cair no endereço antigo da Netlify. Pode ser fixado em VITE_PUBLIC_SITE_URL.
export function publicSiteUrl() {
  const configured = String(import.meta.env.VITE_PUBLIC_SITE_URL || '').trim();
  const current =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  const base = configured || current;
  return base.replace(/\/+$/, '');
}

async function safe(promise, fallback = []) {
  try {
    const { data, error } = await promise;
    if (error) {
      warn(error);
      return fallback;
    }
    return data ?? fallback;
  } catch (error) {
    warn(error);
    return fallback;
  }
}

const dedupe = (rows) => {
  const map = new Map();
  rows.forEach((r) => r && map.set(r.id, r));
  return [...map.values()];
};

async function loadPostLikes() {
  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id,user_id,emoji,created_at');
  if (!error) return data || [];
  warn(error);
  return safe(supabase.from('post_likes').select('post_id,user_id,created_at'));
}

export async function getSession() {
  if (!enabled()) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session || null;
  } catch (error) {
    warn(error);
    return null;
  }
}

export async function getAccessToken() {
  if (!enabled()) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch (error) {
    warn(error);
    return null;
  }
}

export function onAuthChange(callback) {
  if (!enabled()) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) =>
    callback(session, event)
  );
  return () => data.subscription.unsubscribe();
}

export async function resetPassword(email, redirectTo) {
  if (!enabled()) throw new Error('Supabase não configurado.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo || publicSiteUrl(),
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  if (!enabled()) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

export async function signUp({ name, email, password }) {
  if (!enabled()) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: publicSiteUrl(),
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  if (!enabled()) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Confere a senha sem mexer na sessão principal: cria um cliente descartável.
export async function verifyPassword(email, password) {
  if (!enabled()) throw new Error('Supabase não configurado.');
  const probe = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  if (error) throw error;
  try {
    await probe.auth.signOut({ scope: 'local' });
  } catch {
    /* cliente descartável */
  }
}

export async function signOut() {
  if (!enabled()) return;
  try {
    await supabase.auth.signOut();
  } catch (error) {
    warn(error);
  }
}

export async function signInWithGoogle() {
  if (!enabled()) throw new Error('Supabase não configurado.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: publicSiteUrl() },
  });
  if (error) throw error;
}

async function removeUserStorage(uid) {
  if (!uid) return;
  for (const bucket of ['media', 'avatars', 'covers']) {
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(uid, { limit: 1000 });
      if (error || !data?.length) continue;
      const paths = data
        .filter((item) => item?.name)
        .map((item) => `${uid}/${item.name}`);
      if (paths.length) {
        const removed = await supabase.storage.from(bucket).remove(paths);
        if (removed.error) warn(removed.error);
      }
    } catch (error) {
      warn(error);
    }
  }
}

export async function deleteAccount() {
  if (!enabled()) throw new Error('Supabase não configurado.');
  const { data } = await supabase.auth.getUser();
  await removeUserStorage(data?.user?.id);
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (signOutError) {
    warn(signOutError);
  }
}

export async function ensureProfile(user) {
  if (!enabled()) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Você';
  const row = {
    id: user.id,
    user_id: user.id,
    name,
    handle: (slug(name).slice(0, 18) || 'usuario') + user.id.slice(0, 4),
    bio: 'Novo por aqui. Bora fazer o fluxo rolar.',
    city: '',
    humor: 'Animado para conhecer gente nova',
    interests: ['música', 'fotografia', 'cinema'],
    avatar_url: null,
    cover: { k: 'art', v: 'aurora' },
    followers: 12,
  };
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert(row)
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

export async function loadWorkspace(user, localPostIds = [], localChanIds = []) {
  if (!enabled()) return null;
  const uid = user.id;
  const profile = await ensureProfile(user);

  const [
    posts,
    likes,
    saves,
    allFollows,
    allCommMembers,
    allComms,
    allChanMembers,
    allChannels,
    comments,
    scraps,
    allProfiles,
    topics,
    chanMsgs,
    reactions,
    directMessages,
    postInteractions,
    feedPrefsRows,
    joinRequests,
    communityInvites,
    communityChannels,
    stickerPacks,
    stickerRows,
    channelPolls,
    channelPollVotes,
    channelSubscriptions,
  ] = await Promise.all([
    safe(
      supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
    ),
    loadPostLikes(),
    safe(supabase.from('post_saves').select('post_id').eq('user_id', uid)),
    safe(supabase.from('follows').select('follower_id,following_id,created_at')),
    safe(supabase.from('community_members').select('community_id,user_id,role')),
    safe(supabase.from('communities').select('*')),
    safe(supabase.from('channel_members').select('channel_id,user_id')),
    safe(supabase.from('channels').select('*')),
    safe(supabase.from('comments').select('*')),
    safe(
      supabase
        .from('scraps')
        .select('*')
        .eq('profile_id', uid)
        .order('created_at', { ascending: false })
    ),
    safe(supabase.from('profiles').select('*')),
    safe(supabase.from('topics').select('*')),
    safe(supabase.from('channel_messages').select('*')),
    safe(
      supabase
        .from('message_reactions')
        .select('*')
        .eq('user_id', uid)
    ),
    safe(
      supabase
        .from('direct_messages')
        .select('*')
        .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`)
        .order('created_at', { ascending: true })
    ),
    safe(supabase.from('post_interactions').select('*')),
    safe(supabase.from('feed_preferences').select('*').eq('user_id', uid)),
    safe(supabase.from('community_join_requests').select('*')),
    safe(supabase.from('community_invites').select('*')),
    safe(supabase.from('community_channels').select('*')),
    safe(supabase.from('sticker_packs').select('*').eq('user_id', uid)),
    safe(supabase.from('stickers').select('*')),
    safe(supabase.from('channel_polls').select('*')),
    safe(supabase.from('channel_poll_votes').select('*')),
    safe(supabase.from('channel_subscriptions').select('channel_id').eq('user_id', uid)),
  ]);

  const follows = allFollows
    .filter((row) => row.follower_id === uid)
    .map((row) => row.following_id);
  const commMembers = new Set(
    allCommMembers.filter((row) => row.user_id === uid).map((row) => row.community_id)
  );
  const chanMembers = new Set(
    allChanMembers.filter((row) => row.user_id === uid).map((row) => row.channel_id)
  );
  const liveChannels = allChannels.filter((channel) => channel.is_live);

  const likeCounts = new Map();
  const myLikes = new Map();
  likes.forEach((row) => {
    likeCounts.set(row.post_id, (likeCounts.get(row.post_id) || 0) + 1);
    if (row.user_id === uid) myLikes.set(row.post_id, row.emoji || '❤️');
  });

  return {
    profile,
    posts,
    comments,
    likes: { counts: likeCounts, mine: myLikes },
    likeRows: likes,
    saves: new Set(saves.map((r) => r.post_id)),
    follows,
    allFollows,
    commMembers,
    allComms,
    allCommMembers,
    topics,
    chanMembers,
    allChanMembers,
    allChannels,
    liveChannels,
    liveProfiles: allProfiles,
    chanMsgs,
    reactions,
    scraps,
    directMessages,
    postInteractions,
    feedPrefs: feedPrefsRows?.[0]?.prefs || null,
    joinRequests,
    communityInvites,
    communityChannels,
    stickerPacks,
    stickerRows,
    channelPolls,
    channelPollVotes,
    channelSubscriptions: (channelSubscriptions || []).map((row) => row.channel_id),
    communityExtras: await loadCommunityExtras((allComms || []).map((c) => c.id)),
    emojiFavorites: await loadEmojiFavorites(uid),
    commentLikes: await loadCommentLikes(),
    localPostIds,
    localChanIds,
  };
}

export async function saveFeedPreferences(uid, prefs) {
  if (!enabled() || !uid) return;
  try {
    const { error } = await supabase.from('feed_preferences').upsert({
      user_id: uid,
      prefs,
      updated_at: new Date().toISOString(),
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function saveProfile(me, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('profiles').upsert({
      id: uid,
      user_id: uid,
      name: me.name,
      handle: me.handle,
      bio: me.bio,
      city: me.city,
      humor: me.humor,
      interests: me.interests,
      avatar_url: me.avatar,
      cover: me.cover,
      followers: me.followers,
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function savePost(post, uid) {
  if (!enabled()) return;
  try {
    const media = (post.media || [])
      .map((item) => ({
        kind: ['video', 'audio'].includes(item.kind) ? item.kind : 'photo',
        src: item.src && !item.src.startsWith('blob:') ? item.src : null,
        seed: item.seed || post.seed || post.id,
        dur: durSeconds(item.dur),
        name: item.name || null,
        edit: item.edit && typeof item.edit === 'object' ? item.edit : null,
      }))
      .filter((item) => item.src || item.seed);
    const payload = {
      id: post.id,
      author_id: uid,
      text: post.text,
      kind: post.kind,
      media_url: post.src && !post.src.startsWith('blob:') ? post.src : null,
      seed: post.seed || post.id,
      dur: durSeconds(post.dur),
      likes: post.likes || 0,
      comments_disabled: !!post.commentsDisabled,
      interactive: post.interactive || null,
      community_id: post.communityId || null,
      created_at: new Date(post.ts).toISOString(),
    };
    let row = { ...payload, media: media.length ? media : null };
    let { error } = await supabase.from('posts').upsert(row);
    if (error && /community_id/i.test(error.message || '')) {
      const { community_id: _community, ...withoutCommunity } = row;
      row = withoutCommunity;
      ({ error } = await supabase.from('posts').upsert(row));
    }
    if (error && /media|comments_disabled|interactive|column/i.test(error.message || '')) {
      const {
        media: _media,
        comments_disabled: _disabled,
        interactive: _interactive,
        community_id: _community,
        ...legacy
      } = payload;
      row = legacy;
      ({ error } = await supabase.from('posts').upsert(row));
    }
    if (
      error &&
      post.kind === 'story' &&
      /kind|check|constraint/i.test(error.message || '')
    ) {
      row = { ...row, kind: 'text' };
      ({ error } = await supabase.from('posts').upsert(row));
    }
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function updatePost(post) {
  if (!enabled()) return;
  try {
    const patch = {
      text: post.text,
      comments_disabled: !!post.commentsDisabled,
    };
    if (post.interactive !== undefined) {
      patch.interactive = post.interactive || null;
    }
    if (Array.isArray(post.media)) {
      patch.media = post.media.map((item) => ({
        kind: ['video', 'audio'].includes(item.kind) ? item.kind : 'photo',
        src: item.src && !item.src.startsWith('blob:') ? item.src : null,
        seed: item.seed || post.seed || post.id,
        dur: durSeconds(item.dur),
        name: item.name || null,
        edit: item.edit && typeof item.edit === 'object' ? item.edit : null,
      }));
      const first = post.media[0];
      patch.media_url =
        first?.src && !first.src.startsWith('blob:') ? first.src : null;
      patch.kind = ['video', 'audio'].includes(first?.kind) ? first.kind : first ? 'photo' : 'text';
    }
    let { error } = await supabase.from('posts').update(patch).eq('id', post.id);
    if (error && /media|comments_disabled|interactive|column/i.test(error.message || '')) {
      const {
        media: _media,
        comments_disabled: _disabled,
        interactive: _interactive,
        ...legacy
      } = patch;
      ({ error } = await supabase.from('posts').update(legacy).eq('id', post.id));
    }
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function deletePost(id) {
  if (!enabled()) return;
  try {
    const interactions = await supabase
      .from('post_interactions')
      .delete()
      .eq('post_id', id);
    if (interactions.error) warn(interactions.error);
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function saveInteraction({ id, postId, userId, kind, optionId, text }) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('post_interactions').upsert(
      {
        id,
        post_id: postId,
        user_id: userId,
        kind,
        option_id: optionId || null,
        text: text || '',
        created_at: new Date().toISOString(),
      },
      { onConflict: 'post_id,user_id,kind' }
    );
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

// Recarrega participações já liberadas. O RLS só devolve os votos/respostas
// depois de resultsAt, então chamar antes do prazo não revela nada.
export async function fetchPostInteractions(postIds = []) {
  if (!enabled()) return [];
  try {
    let query = supabase.from('post_interactions').select('*');
    if (postIds.length) query = query.in('post_id', postIds);
    return await safe(query);
  } catch (error) {
    warn(error);
    return [];
  }
}

export async function setLike(postId, uid, emoji) {
  if (!enabled()) return;
  try {
    const removed = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', uid);
    if (removed.error) warn(removed.error);
    if (!emoji) return;
    let { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: uid, emoji });
    if (error && /emoji/i.test(error.message || '')) {
      ({ error } = await supabase
        .from('post_likes')
        .insert({ post_id: postId, user_id: uid }));
    }
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function setSave(postId, uid, saved) {
  if (!enabled()) return;
  try {
    if (saved) {
      const { error } = await supabase
        .from('post_saves')
        .upsert({ post_id: postId, user_id: uid });
      if (error) warn(error);
    } else {
      const { error } = await supabase
        .from('post_saves')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', uid);
      if (error) warn(error);
    }
  } catch (error) {
    warn(error);
  }
}

export async function reportPost(postId, uid, reason = '') {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('post_reports').insert({
      id: `${postId}:${uid}`,
      post_id: postId,
      user_id: uid,
      reason,
    });
    if (error && !/duplicate|unique/i.test(error.message || '')) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function addComment(comment, postId, uid, parentId = null) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('comments').insert({
      id: comment.id,
      post_id: postId,
      author_id: uid,
      text: comment.text,
      created_at: new Date(comment.ts).toISOString(),
      ...(parentId ? { parent_id: parentId } : {}),
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function deleteComment(id) {
  if (!enabled() || !id) return;
  try {
    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function setFollow(followerId, followingId, following) {
  if (!enabled()) return;
  try {
    if (following) {
      const { error } = await supabase
        .from('follows')
        .upsert({ follower_id: followerId, following_id: followingId });
      if (error) warn(error);
    } else {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);
      if (error) warn(error);
    }
  } catch (error) {
    warn(error);
  }
}

export async function saveCommunity(community, uid) {
  if (!enabled()) return;
  try {
    const payload = {
      id: community.id,
      name: community.name,
      category: community.cat,
      description: community.desc,
      cover_seed: community.seed,
      rules: community.rules,
      owner_id: uid,
      icon_url: community.iconUrl || null,
      cover_url: community.coverUrl || null,
      is_private: !!community.private,
    };
    let { error } = await supabase.from('communities').upsert(payload);
    if (error && /icon_url|cover_url|is_private|column/i.test(error.message || '')) {
      const {
        icon_url: _icon,
        cover_url: _cover,
        is_private: _private,
        ...legacy
      } = payload;
      ({ error } = await supabase.from('communities').upsert(legacy));
    }
    if (error) warn(error);
    await setCommunityMembership(community.id, uid, true, 'owner');
  } catch (error) {
    warn(error);
  }
}

export async function updateCommunity(community) {
  if (!enabled()) return;
  try {
    const { error } = await supabase
      .from('communities')
      .update({
        name: community.name,
        category: community.cat,
        description: community.desc,
        cover_seed: community.seed,
        rules: community.rules,
        icon_url: community.iconUrl || null,
        cover_url: community.coverUrl || null,
        is_private: !!community.private,
      })
      .eq('id', community.id);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function requestCommunityJoin(communityId, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase
      .from('community_join_requests')
      .upsert({
        community_id: communityId,
        user_id: uid,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function cancelCommunityJoin(communityId, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase
      .from('community_join_requests')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', uid);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function setJoinRequestStatus(communityId, userId, status) {
  if (!enabled()) return;
  try {
    const { error } = await supabase
      .from('community_join_requests')
      .update({ status })
      .eq('community_id', communityId)
      .eq('user_id', userId);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function saveCommunityInvite(invite, inviterId = invite.inviterId) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('community_invites').upsert(
      {
        id: invite.id,
        community_id: invite.communityId,
        inviter_id: inviterId === 'me' ? invite.inviterId : inviterId,
        invitee_id: invite.inviteeId,
        status: invite.status || 'pending',
        created_at: new Date().toISOString(),
      },
      { onConflict: 'community_id,invitee_id' }
    );
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function setCommunityInviteStatus(id, status) {
  if (!enabled()) return;
  try {
    const { error } = await supabase
      .from('community_invites')
      .update({ status })
      .eq('id', id);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function saveCommunityChannel(communityId, channelId) {
  if (!enabled()) return;
  try {
    const { error } = await supabase
      .from('community_channels')
      .upsert({ community_id: communityId, channel_id: channelId });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function deleteCommunityChannel(communityId, channelId) {
  if (!enabled()) return;
  try {
    const { error } = await supabase
      .from('community_channels')
      .delete()
      .eq('community_id', communityId)
      .eq('channel_id', channelId);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function saveStickerPack(pack, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('sticker_packs').upsert({
      id: pack.id,
      user_id: uid,
      name: pack.name,
      icon: pack.icon || '✨',
      created_at: new Date(pack.ts || Date.now()).toISOString(),
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function deleteStickerPackRemote(id) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('sticker_packs').delete().eq('id', id);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function saveStickerRow(sticker, packId, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('stickers').upsert({
      id: sticker.id,
      pack_id: packId,
      user_id: uid,
      src: sticker.src,
      created_at: new Date(sticker.ts || Date.now()).toISOString(),
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function deleteStickerRow(id) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('stickers').delete().eq('id', id);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function setCommunityMembership(communityId, uid, joined, role = 'member') {
  if (!enabled()) return;
  try {
    if (joined) {
      const { error } = await supabase
        .from('community_members')
        .upsert({ community_id: communityId, user_id: uid, role });
      if (error) warn(error);
    } else {
      const { error } = await supabase
        .from('community_members')
        .delete()
        .eq('community_id', communityId)
        .eq('user_id', uid);
      if (error) warn(error);
    }
  } catch (error) {
    warn(error);
  }
}

// Reações em comentários (tabela comment_likes).
export async function loadCommentLikes() {
  if (!enabled()) return { mine: {}, counts: {} };
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data, error } = await supabase.from('comment_likes').select('comment_id,user_id');
    if (error) { warn(error); return { mine: {}, counts: {} }; }
    const mine = {};
    const counts = {};
    (data || []).forEach((row) => {
      counts[row.comment_id] = (counts[row.comment_id] || 0) + 1;
      if (uid && row.user_id === uid) mine[row.comment_id] = true;
    });
    return { mine, counts };
  } catch (error) {
    warn(error);
    return { mine: {}, counts: {} };
  }
}

export async function toggleCommentLikeRemote(commentId, uid, like) {
  if (!enabled() || !uid) return false;
  try {
    const { error } = like
      ? await supabase.from('comment_likes').upsert({ comment_id: commentId, user_id: uid })
      : await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', uid);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

// Emojis favoritos (sincronizados por conta).
export async function loadEmojiFavorites(uid) {
  if (!enabled() || !uid) return [];
  try {
    const { data, error } = await supabase
      .from('emoji_favorites')
      .select('emoji')
      .eq('user_id', uid);
    if (error) { warn(error); return []; }
    return (data || []).map((row) => row.emoji);
  } catch (error) { warn(error); return []; }
}

export async function toggleEmojiFavorite(uid, emoji, favorite) {
  if (!enabled() || !uid) return false;
  try {
    const { error } = favorite
      ? await supabase.from('emoji_favorites').upsert({ user_id: uid, emoji })
      : await supabase.from('emoji_favorites').delete().eq('user_id', uid).eq('emoji', emoji);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

// --- Comunidades v2: galeria, eventos, classificados e notificações -------
export async function loadCommunityExtras(communityIds) {
  if (!enabled() || !communityIds?.length) {
    return { gallery: [], events: [], rsvps: [], classifieds: [], notifications: [] };
  }
  try {
    const [gallery, events, rsvps, classifieds, notifications] = await Promise.all([
      safe(supabase.from('community_gallery').select('*').in('community_id', communityIds)),
      safe(supabase.from('community_events').select('*').in('community_id', communityIds)),
      safe(supabase.from('community_event_rsvps').select('*')),
      safe(supabase.from('community_classifieds').select('*').in('community_id', communityIds)),
      safe(supabase.from('community_notifications').select('*')),
    ]);
    return {
      gallery: gallery || [], events: events || [], rsvps: rsvps || [],
      classifieds: classifieds || [], notifications: notifications || [],
    };
  } catch (error) {
    warn(error);
    return { gallery: [], events: [], rsvps: [], classifieds: [], notifications: [] };
  }
}

export async function addCommunityGallery(data) {
  if (!enabled()) return false;
  try {
    const { error } = await supabase.from('community_gallery').insert(data);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

export async function removeCommunityGallery(id) {
  if (!enabled()) return false;
  try {
    const { error } = await supabase.from('community_gallery').delete().eq('id', id);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

export async function addCommunityEvent(data) {
  if (!enabled()) return null;
  try {
    const { data: row, error } = await supabase.from('community_events').insert(data).select().single();
    if (error) { warn(error); return null; }
    return row;
  } catch (error) { warn(error); return null; }
}

export async function updateCommunityEvent(id, patch) {
  if (!enabled()) return false;
  try {
    const { error } = await supabase.from('community_events').update(patch).eq('id', id);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

export async function removeCommunityEvent(id) {
  if (!enabled()) return false;
  try {
    const { error } = await supabase.from('community_events').delete().eq('id', id);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

export async function toggleCommunityRsvp(eventId, uid, join) {
  if (!enabled()) return false;
  try {
    const { error } = join
      ? await supabase.from('community_event_rsvps').upsert({ event_id: eventId, user_id: uid })
      : await supabase.from('community_event_rsvps').delete().eq('event_id', eventId).eq('user_id', uid);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

export async function addCommunityClassified(data) {
  if (!enabled()) return null;
  try {
    const { data: row, error } = await supabase.from('community_classifieds').insert(data).select().single();
    if (error) { warn(error); return null; }
    return row;
  } catch (error) { warn(error); return null; }
}

export async function updateCommunityClassified(id, patch) {
  if (!enabled()) return false;
  try {
    const { error } = await supabase.from('community_classifieds').update(patch).eq('id', id);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

export async function removeCommunityClassified(id) {
  if (!enabled()) return false;
  try {
    const { error } = await supabase.from('community_classifieds').delete().eq('id', id);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

export async function setCommunityNotificationRead(id) {
  if (!enabled()) return;
  try {
    await supabase.from('community_notifications').update({ read: true }).eq('id', id);
  } catch (error) { warn(error); }
}

export async function setTopicPinned(id, pinned) {
  if (!enabled()) return false;
  try {
    const { error } = await supabase.from('topics').update({ pinned }).eq('id', id);
    if (error) { warn(error); return false; }
    return true;
  } catch (error) { warn(error); return false; }
}

// Inscrição em canais (modelo YouTube).
export async function loadChannelSubscriptions(uid) {
  if (!enabled() || !uid) return [];
  try {
    const { data, error } = await supabase
      .from('channel_subscriptions')
      .select('channel_id')
      .eq('user_id', uid);
    if (error) { warn(error); return []; }
    return (data || []).map((row) => row.channel_id);
  } catch (error) {
    warn(error);
    return [];
  }
}

export async function setChannelSubscription(channelId, uid, subscribe) {
  if (!enabled() || !uid) return false;
  try {
    if (subscribe) {
      const { error } = await supabase
        .from('channel_subscriptions')
        .upsert({ channel_id: channelId, user_id: uid });
      if (error) { warn(error); return false; }
    } else {
      const { error } = await supabase
        .from('channel_subscriptions')
        .delete()
        .eq('channel_id', channelId)
        .eq('user_id', uid);
      if (error) { warn(error); return false; }
    }
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

export async function saveTopic(topic, communityId, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('topics').insert({
      id: topic.id,
      community_id: communityId,
      author_id: uid,
      title: topic.title,
      replies: topic.replies || 0,
      created_at: new Date(topic.ts).toISOString(),
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function deleteTopic(id) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('topics').delete().eq('id', id);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function saveChannel(channel, uid) {
  if (!enabled()) return;
  try {
    const payload = {
      id: channel.id,
      owner_id: uid,
      name: channel.name,
      description: channel.desc,
      kind: channel.kind,
      followers: channel.followers || 0,
      is_live: !!channel.live,
      livekit: !!channel.livekit,
      title: channel.title || '',
      viewers: channel.viewers || 0,
      seed: channel.seed,
    };
    let { error } = await supabase.from('channels').upsert(payload);
    if (error && /livekit/i.test(error.message || '')) {
      const { livekit, ...legacy } = payload;
      ({ error } = await supabase.from('channels').upsert(legacy));
    }
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function setChannelMembership(channelId, uid, joined) {
  if (!enabled()) return;
  try {
    if (joined) {
      const { error } = await supabase
        .from('channel_members')
        .upsert({ channel_id: channelId, user_id: uid });
      if (error) warn(error);
    } else {
      const { error } = await supabase
        .from('channel_members')
        .delete()
        .eq('channel_id', channelId)
        .eq('user_id', uid);
      if (error) warn(error);
    }
  } catch (error) {
    warn(error);
  }
}

export async function deleteChannel(id) {
  if (!enabled()) return;
  try {
    const messages = await supabase
      .from('channel_messages')
      .delete()
      .eq('channel_id', id);
    if (messages.error) warn(messages.error);
    const members = await supabase
      .from('channel_members')
      .delete()
      .eq('channel_id', id);
    if (members.error) warn(members.error);
    const { error } = await supabase.from('channels').delete().eq('id', id);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

// Consultas usadas como reforço das assinaturas Realtime. Se a publicação
// Realtime ainda não foi aplicada no projeto, o canal aberto continua
// recebendo mensagens e mudanças de estado por polling.
export async function fetchChannelSnapshot(channelId) {
  if (!enabled() || !channelId) return null;
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle();
    if (error) {
      warn(error);
      return null;
    }
    return data || null;
  } catch (error) {
    warn(error);
    return null;
  }
}

export async function fetchChannelMessages(channelId, limit = 120) {
  if (!enabled() || !channelId) return [];
  try {
    const { data, error } = await supabase
      .from('channel_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      warn(error);
      return [];
    }
    return (data || []).slice().reverse();
  } catch (error) {
    warn(error);
    return [];
  }
}

export async function addChannelMessage(message, channelId, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('channel_messages').insert({
      id: message.id,
      channel_id: channelId,
      author_id: uid,
      text: message.text,
      created_at: new Date(message.ts).toISOString(),
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

// Enquetes de live/chat. As de modo "fluxo" também existem como publicação no
// feed (post_id) e os votos entram em post_interactions; as de modo "chat"
// só valem para quem está assistindo à transmissão.
export async function saveChannelPoll(poll, channelId, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('channel_polls').upsert({
      id: poll.id,
      channel_id: channelId,
      created_by: uid,
      question: poll.question,
      options: poll.options,
      mode: poll.mode === 'fluxo' ? 'fluxo' : 'chat',
      status: poll.status === 'closed' ? 'closed' : 'open',
      post_id: poll.postId || null,
      closes_at: poll.closesAt ? new Date(poll.closesAt).toISOString() : null,
      closed_at: poll.closedAt ? new Date(poll.closedAt).toISOString() : null,
      created_at: new Date(poll.ts || Date.now()).toISOString(),
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function fetchChannelPolls(channelId) {
  if (!enabled() || !channelId) return [];
  try {
    const polls = await safe(
      supabase
        .from('channel_polls')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
    );
    const pollIds = (polls || []).map((poll) => poll.id).filter(Boolean);
    const votes = pollIds.length
      ? await safe(
          supabase
            .from('channel_poll_votes')
            .select('*')
            .in('poll_id', pollIds)
            .order('created_at', { ascending: true })
        )
      : [];
    const byPoll = new Map();
    (votes || []).forEach((row) => {
      if (!row?.poll_id) return;
      if (!byPoll.has(row.poll_id)) byPoll.set(row.poll_id, []);
      byPoll.get(row.poll_id).push(row);
    });
    return (polls || []).map((row) => ({
      ...row,
      options:
        typeof row.options === 'string'
          ? (() => {
              try {
                return JSON.parse(row.options);
              } catch {
                return [];
              }
            })()
          : row.options || [],
      votes: byPoll.get(row.id) || [],
    }));
  } catch (error) {
    warn(error);
    return [];
  }
}

export async function castChannelPollVote({ pollId, userId, optionId }) {
  if (!enabled() || !pollId || !userId) return;
  try {
    const { error } = await supabase.from('channel_poll_votes').upsert(
      {
        poll_id: pollId,
        user_id: userId,
        option_id: optionId,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'poll_id,user_id' }
    );
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function closeChannelPoll(pollId) {
  if (!enabled() || !pollId) return;
  try {
    const { error } = await supabase
      .from('channel_polls')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', pollId);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export function subscribeChannelPolls(channelId, callback) {
  if (!enabled() || !channelId) return () => {};
  try {
    const channel = supabase
      .channel(`channel-polls-${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channel_polls', filter: `channel_id=eq.${channelId}` },
        (payload) => callback(payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channel_poll_votes' },
        (payload) => callback(payload)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  } catch (error) {
    warn(error);
    return () => {};
  }
}

export async function setReaction(messageId, uid, emoji, on) {
  if (!enabled()) return;
  try {
    if (on) {
      const { error } = await supabase
        .from('message_reactions')
        .upsert({ message_id: messageId, user_id: uid, emoji });
      if (error) warn(error);
    } else {
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', uid)
        .eq('emoji', emoji);
      if (error) warn(error);
    }
  } catch (error) {
    warn(error);
  }
}

export async function addScrap(scrap, profileId, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('scraps').insert({
      id: scrap.id,
      profile_id: profileId,
      author_id: uid,
      text: scrap.text,
      created_at: new Date(scrap.ts).toISOString(),
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function sendDirectMessage(message, senderId, recipientId) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('direct_messages').insert({
      id: message.id,
      sender_id: senderId,
      recipient_id: recipientId,
      text: message.text || '',
      attachment: message.attachment || null,
      read: false,
      created_at: new Date(message.ts).toISOString(),
    });
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

// ---------------------------------------------------------------------------
// Quiz BOOM! — modos, rodadas, medalhas, desafios e rankings.
// ---------------------------------------------------------------------------

export async function quizRoundStatus() {
  const fallback = { used: 0, bonus: 0, free_rounds: 3, remaining: 3, refresh_rounds: 0, online: false };
  if (!enabled()) return fallback;
  try {
    const { data, error } = await supabase.rpc('quiz_round_status');
    if (error) {
      warn(error);
      return fallback;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return fallback;
    return {
      used: Number(row.used) || 0,
      bonus: Number(row.bonus) || 0,
      free_rounds: Number(row.free_rounds) || 3,
      remaining: Number(row.remaining) || 0,
      refresh_rounds: Number(row.refresh_rounds) || 0,
      online: true,
    };
  } catch (error) {
    warn(error);
    return fallback;
  }
}

export async function quizBeginRun({ id, category, mode, total }) {
  if (!enabled()) return { ok: false, error: 'offline' };
  try {
    const { error } = await supabase.rpc('quiz_begin_run', {
      p_id: id,
      p_category: category || 'todas',
      p_mode: mode === 'insane' ? 'insane' : 'classic',
      p_total: Number(total) || 10,
    });
    if (error) return { ok: false, error: error.message || 'error' };
    return { ok: true };
  } catch (error) {
    warn(error);
    return { ok: false, error: error?.message || 'error' };
  }
}

export async function quizFinishRun(id, result = {}) {
  if (!enabled() || !id) return false;
  try {
    const { error } = await supabase
      .from('quiz_runs')
      .update({
        status: 'finished',
        score: Math.max(0, Math.round(Number(result.score) || 0)),
        correct: Math.max(0, Number(result.correct) || 0),
        answered: Math.max(0, Number(result.answered) || 0),
        best_combo: Math.max(0, Number(result.bestCombo) || 0),
        duration_ms: Math.max(0, Number(result.durationMs) || 0),
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      warn(error);
      return false;
    }
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

export async function quizSaveMedal(category) {
  if (!enabled() || !category) return false;
  try {
    const { error } = await supabase
      .from('quiz_medals')
      .upsert({ category, created_at: new Date().toISOString() });
    if (error) {
      warn(error);
      return false;
    }
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

export async function quizLoadMedals() {
  if (!enabled()) return [];
  const rows = await safe(supabase.from('quiz_medals').select('category,created_at'));
  return Array.isArray(rows) ? rows : [];
}

export async function quizClaimInvite(inviter) {
  if (!enabled() || !inviter) return false;
  try {
    const { data, error } = await supabase.rpc('quiz_claim_invite', { p_inviter: inviter });
    if (error) {
      warn(error);
      return false;
    }
    return data === true;
  } catch (error) {
    warn(error);
    return false;
  }
}

export async function quizSaveChallenge(challenge) {
  if (!enabled() || !challenge?.id) return false;
  try {
    const { error } = await supabase.from('quiz_challenges').upsert({
      id: challenge.id,
      challenger_id: challenge.challengerId,
      challenger_name: challenge.challengerName || '',
      category: challenge.category || 'todas',
      mode: challenge.mode === 'insane' ? 'insane' : 'classic',
      size: Number(challenge.size) || 10,
      target_score: Math.max(0, Math.round(Number(challenge.targetScore) || 0)),
    });
    if (error) {
      warn(error);
      return false;
    }
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

export async function quizFetchChallenge(id) {
  if (!enabled() || !id) return null;
  try {
    const { data, error } = await supabase
      .from('quiz_challenges')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      challengerId: data.challenger_id,
      challengerName: data.challenger_name || 'Um amigo',
      category: data.category || 'todas',
      mode: data.mode === 'insane' ? 'insane' : 'classic',
      size: Number(data.size) || 10,
      targetScore: Number(data.target_score) || 0,
      createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
    };
  } catch (error) {
    warn(error);
    return null;
  }
}

const mapRanking = (rows) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    position: Number(row.position) || 0,
    userId: row.user_id || '',
    name: row.name || 'Jogador',
    handle: row.handle || '',
    avatar: row.avatar_url || null,
    score: Number(row.total_score) || 0,
    rounds: Number(row.rounds) || 0,
    bestCombo: Number(row.best_combo) || 0,
  }));

export async function quizRankings(limit = 50) {
  if (!enabled()) return { global: [], friends: [] };
  try {
    const [global, friends] = await Promise.all([
      supabase.rpc('quiz_weekly_ranking', { p_limit: limit }),
      supabase.rpc('quiz_friends_ranking', { p_limit: limit }),
    ]);
    if (global.error) warn(global.error);
    if (friends.error) warn(friends.error);
    return {
      global: mapRanking(global.data),
      friends: mapRanking(friends.data),
    };
  } catch (error) {
    warn(error);
    return { global: [], friends: [] };
  }
}

export async function loadEnigmaRanking(limit = 20) {
  if (!enabled()) return [];
  try {
    const { data, error } = await supabase
      .from('enigma_scores')
      .select('user_id,name,level,score,hints,updated_at')
      .order('level', { ascending: false })
      .order('score', { ascending: false })
      .order('hints', { ascending: true })
      .limit(limit);
    if (error) { warn(error); return []; }
    return (data || []).map((row) => ({
      runId: row.user_id,
      name: row.name || 'Jogador',
      level: Number(row.level) || 1,
      score: Number(row.score) || 0,
      hints: Number(row.hints) || 0,
      ts: row.updated_at ? new Date(row.updated_at).getTime() : 0,
    }));
  } catch (error) {
    warn(error);
    return [];
  }
}

export async function saveEnigmaScore({ userId, name, level, score, hints }) {
  if (!enabled() || !userId) return false;
  try {
    const { error } = await supabase.from('enigma_scores').upsert(
      {
        user_id: userId,
        name: String(name || 'Jogador').slice(0, 40),
        level: Math.min(100, Math.max(1, Math.round(level) || 1)),
        score: Math.max(0, Math.round(score) || 0),
        hints: Math.max(0, Math.round(hints) || 0),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) { warn(error); return false; }
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

export async function updateDirectMessage(id, text) {
  if (!enabled() || !id) return false;
  const clean = String(text || '').trim();
  if (!clean) return false;
  try {
    // A função no servidor valida que quem edita é o autor da mensagem.
    const { error } = await supabase.rpc('edit_direct_message', {
      p_id: id,
      p_text: clean,
    });
    if (error) {
      warn(error);
      return false;
    }
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

export async function deleteDirectMessage(id) {
  if (!enabled() || !id) return;
  try {
    const { error } = await supabase.from('direct_messages').delete().eq('id', id);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export async function deleteDirectMessagesWith(uid, otherId) {
  if (!enabled() || !uid || !otherId) return;
  try {
    const first = await supabase
      .from('direct_messages')
      .delete()
      .eq('sender_id', uid)
      .eq('recipient_id', otherId);
    if (first.error) warn(first.error);
    const second = await supabase
      .from('direct_messages')
      .delete()
      .eq('sender_id', otherId)
      .eq('recipient_id', uid);
    if (second.error) warn(second.error);
  } catch (error) {
    warn(error);
  }
}

export async function markDirectMessagesRead(uid, otherId) {
  if (!enabled()) return;
  try {
    const { error } = await supabase
      .from('direct_messages')
      .update({ read: true })
      .eq('recipient_id', uid)
      .eq('sender_id', otherId);
    if (error) warn(error);
  } catch (error) {
    warn(error);
  }
}

export function subscribeDirectMessages(uid, callback) {
  if (!enabled()) return () => {};
  try {
    const channel = supabase
      .channel(`direct-messages-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${uid}`,
        },
        (payload) => callback(payload.new, 'INSERT')
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'direct_messages',
          filter: `sender_id=eq.${uid}`,
        },
        (payload) => callback(payload.new, 'UPDATE')
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'direct_messages',
        },
        (payload) => callback(payload.old, 'DELETE')
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  } catch (error) {
    warn(error);
    return () => {};
  }
}

// "Fulano começou a seguir você": novas linhas em follows com following_id = eu.
export function subscribeFollows(uid, callback) {
  if (!enabled() || !uid) return () => {};
  try {
    const channel = supabase
      .channel(`follows-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'follows',
          filter: `following_id=eq.${uid}`,
        },
        (payload) => callback(payload.new)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  } catch (error) {
    warn(error);
    return () => {};
  }
}

export function subscribeChannelMessages(channelId, callback) {
  if (!enabled() || !channelId) return () => {};
  try {
    const channel = supabase
      .channel(`channel-messages-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => callback(payload.new)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  } catch (error) {
    warn(error);
    return () => {};
  }
}

export function subscribeChannels(callback) {
  if (!enabled()) return () => {};
  try {
    const channel = supabase
      .channel('channels-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channels' },
        (payload) => callback(payload)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  } catch (error) {
    warn(error);
    return () => {};
  }
}

export function subscribeNotifications(uid, callback) {
  if (!enabled()) return () => {};
  try {
    const channel = supabase
      .channel(`notifications-${uid}`)
      // Novos seguidores: dá para filtrar no servidor.
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'follows',
          filter: `following_id=eq.${uid}`,
        },
        (payload) => callback('follow', payload.new)
      )
      // Curtidas e comentários: sem filtro de "posts meus" no servidor,
      // então filtramos no cliente pelos ids que a gente já conhece.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_likes' },
        (payload) => callback('like', payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'post_likes' },
        (payload) => callback('unlike', payload.old)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        (payload) => callback('comment', payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments' },
        (payload) => callback('comment-delete', payload.old)
      )
      // Participações em enquetes, perguntas, votações e desafios.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_interactions' },
        (payload) => callback('interaction', payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'post_interactions' },
        (payload) => callback('interaction', payload.new)
      )
      // Novas publicações: usadas para avisar quem foi mencionado com @ ou
      // convidado para um desafio. Updates cobrem convites feitos depois.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => callback('post', payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload) => callback('post', payload.new)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  } catch (error) {
    warn(error);
    return () => {};
  }
}

export function joinPresence(uid, handlers = {}) {
  if (!enabled() || !uid) return null;
  try {
    const channel = supabase.channel('fluxo-online', {
      config: { presence: { key: uid } },
    });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() || {};
      handlers.onSync?.(Object.keys(state));
    });
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload?.from || payload.from === uid) return;
      handlers.onTyping?.(payload);
    });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.track({ online_at: new Date().toISOString() }).catch(() => {});
      }
    });
    return {
      sendTyping(to) {
        if (!to) return;
        channel
          .send({
            type: 'broadcast',
            event: 'typing',
            payload: { from: uid, to },
          })
          .catch(() => {});
      },
      leave() {
        supabase.removeChannel(channel).catch(() => {});
      },
    };
  } catch (error) {
    warn(error);
    return null;
  }
}

export async function uploadMedia(file, uid) {
  if (!enabled()) return null;
  try {
    const ext = (file.name || 'arquivo').split('.').pop()?.toLowerCase() || 'bin';
    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) {
      warn(error);
      return null;
    }
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  } catch (error) {
    warn(error);
    return null;
  }
}

/**
 * Áudio de mensagens no bucket dedicado (`audio`), com o mesmo contrato de
 * caminho do aplicativo mobile: `<user_id>/<timestamp>-<random>.<ext>`.
 * Retorna { url, path, mimeType } ou null quando não há sessão/falha.
 */
export async function uploadAudio(blob, uid, mimeType) {
  if (!enabled() || !uid || !blob) return null;
  try {
    const mime = mimeType || blob.type || 'audio/webm';
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await supabase.storage.from('audio').upload(path, blob, {
      cacheControl: '3600',
      contentType: mime,
      upsert: false,
    });
    if (error) {
      warn(error);
      return null;
    }
    const { data } = supabase.storage.from('audio').getPublicUrl(path);
    return { url: data.publicUrl, path, mimeType: mime };
  } catch (error) {
    warn(error);
    return null;
  }
}

/**
 * Áudio de comunidade. Comunidades privadas usam o bucket `community-private`
 * (leitura restrita por RLS); as abertas continuam no bucket público `audio`.
 * Caminho no bucket privado: <community_id>/<user_id>/<arquivo>.
 */
export async function uploadCommunityAudio(blob, communityId, uid, mime, isPrivate) {
  if (!enabled() || !blob || !communityId || !uid) return null;
  try {
    const normalized = mime || blob.type || 'audio/webm';
    const ext = normalized.includes('mp4')
      ? 'm4a'
      : normalized.includes('ogg')
        ? 'ogg'
        : 'webm';
    const file = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const path = isPrivate
      ? `${communityId}/${uid}/${file}`
      : `${uid}/${file}`;
    const bucket = isPrivate ? 'community-private' : 'audio';
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      cacheControl: '3600',
      contentType: normalized,
      upsert: false,
    });
    if (error) {
      warn(error);
      return null;
    }
    let url = null;
    if (!isPrivate) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      url = data.publicUrl;
    }
    return { url, path, bucket, private: !!isPrivate };
  } catch (error) {
    warn(error);
    return null;
  }
}

/** Upload genérico de mídia para o bucket privado da comunidade. */
export async function uploadPrivateMedia(file, communityId, uid) {
  if (!enabled() || !file || !communityId || !uid) return null;
  try {
    const ext = (file.name || 'arquivo').split('.').pop()?.toLowerCase() || 'bin';
    const path = `${communityId}/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await supabase.storage.from('community-private').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) {
      warn(error);
      return null;
    }
    return { path, bucket: 'community-private', private: true };
  } catch (error) {
    warn(error);
    return null;
  }
}

/** URL assinada de curta duração para mídia de comunidade privada. */
export async function createSignedMediaUrl(bucket, path, expiresIn = 3600) {
  if (!enabled() || !bucket || !path) return null;
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error) {
      warn(error);
      return null;
    }
    return data?.signedUrl || null;
  } catch (error) {
    warn(error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Arena do Caos: estatísticas, histórico e ranking lidos das tabelas reais
// gravadas pelo servidor da Arena (game_matches / game_match_players).
// ---------------------------------------------------------------------------

const EMPTY_ARENA_STATS = {
  matches: 0,
  wins: 0,
  kills: 0,
  damage: 0,
  best: null,
  points: 0,
};

function arenaPoints(row) {
  const placement = Number(row.placement) || 8;
  return Math.max(0, 11 - placement) + (row.is_winner ? 5 : 0) + (Number(row.kills) || 0) * 2;
}

function aggregateArenaRows(rows) {
  const stats = { ...EMPTY_ARENA_STATS };
  rows.forEach((row) => {
    stats.matches += 1;
    if (row.is_winner) stats.wins += 1;
    stats.kills += Number(row.kills) || 0;
    stats.damage += Number(row.damage) || 0;
    const placement = Number(row.placement) || 0;
    if (placement > 0 && (stats.best === null || placement < stats.best)) {
      stats.best = placement;
    }
    stats.points += arenaPoints(row);
  });
  return stats;
}

export async function loadArenaProfile(userId) {
  if (!enabled() || !userId) {
    return { stats: { ...EMPTY_ARENA_STATS }, weekly: { ...EMPTY_ARENA_STATS }, history: [], hasData: false };
  }
  try {
    const rows = await safe(
      supabase
        .from('game_match_players')
        .select('match_id,placement,kills,damage,survived_ms,is_winner,played_at')
        .eq('user_id', userId)
        .order('played_at', { ascending: false })
        .limit(300)
    );
    const list = Array.isArray(rows) ? rows : [];
    const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyRows = list.filter(
      (row) => new Date(row.played_at || 0).getTime() >= weekStart
    );
    const ids = [...new Set(list.slice(0, 12).map((row) => row.match_id).filter(Boolean))];
    let matches = [];
    if (ids.length) {
      matches = await safe(
        supabase
          .from('game_matches')
          .select('id,room_code,visibility,player_count,winner_id,winner_name,duration_ms,ended_at')
          .in('id', ids)
          .order('ended_at', { ascending: false })
      );
    }
    const matchMap = new Map((matches || []).map((match) => [match.id, match]));
    const history = list.slice(0, 12).map((row) => {
      const match = matchMap.get(row.match_id) || {};
      return {
        matchId: row.match_id,
        placement: row.placement || null,
        kills: row.kills || 0,
        damage: row.damage || 0,
        survivedMs: row.survived_ms || 0,
        isWinner: !!row.is_winner,
        playedAt: new Date(row.played_at || Date.now()).getTime(),
        playerCount: match.player_count || null,
        durationMs: match.duration_ms || 0,
        visibility: match.visibility || 'public',
        winnerName: match.winner_name || '',
      };
    });
    return {
      stats: aggregateArenaRows(list),
      weekly: aggregateArenaRows(weeklyRows),
      history,
      hasData: list.length > 0,
    };
  } catch (error) {
    warn(error);
    return { stats: { ...EMPTY_ARENA_STATS }, weekly: { ...EMPTY_ARENA_STATS }, history: [], hasData: false };
  }
}

export async function loadArenaRanking(period = 'week') {
  if (!enabled()) return [];
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let query = supabase
      .from('game_match_players')
      .select('user_id,name,handle,placement,kills,is_winner,played_at')
      .not('user_id', 'is', null)
      .order('played_at', { ascending: false })
      .limit(4000);
    if (period === 'week') query = query.gte('played_at', since);
    const rows = await safe(query);
    const map = new Map();
    (rows || []).forEach((row) => {
      if (!row.user_id) return;
      const entry =
        map.get(row.user_id) || {
          userId: row.user_id,
          name: row.name || 'Jogador',
          handle: row.handle || '',
          matches: 0,
          wins: 0,
          kills: 0,
          points: 0,
        };
      entry.matches += 1;
      entry.wins += row.is_winner ? 1 : 0;
      entry.kills += Number(row.kills) || 0;
      entry.points += arenaPoints(row);
      if (row.name) entry.name = row.name;
      if (row.handle) entry.handle = row.handle;
      map.set(row.user_id, entry);
    });
    return [...map.values()]
      .sort((a, b) => b.points - a.points || b.wins - a.wins || b.kills - a.kills)
      .slice(0, 50);
  } catch (error) {
    warn(error);
    return [];
  }
}

