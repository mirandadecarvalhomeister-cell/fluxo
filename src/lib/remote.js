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
const warn = (error) => console.warn('[supabase]', error?.message || error);

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
    redirectTo: redirectTo || window.location.origin,
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
    options: { data: { name } },
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
    options: { redirectTo: window.location.origin },
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
        kind: item.kind === 'video' ? 'video' : 'photo',
        src: item.src && !item.src.startsWith('blob:') ? item.src : null,
        seed: item.seed || post.seed || post.id,
        dur: durSeconds(item.dur),
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
        kind: item.kind === 'video' ? 'video' : 'photo',
        src: item.src && !item.src.startsWith('blob:') ? item.src : null,
        seed: item.seed || post.seed || post.id,
        dur: durSeconds(item.dur),
        edit: item.edit && typeof item.edit === 'object' ? item.edit : null,
      }));
      const first = post.media[0];
      patch.media_url =
        first?.src && !first.src.startsWith('blob:') ? first.src : null;
      patch.kind = first?.kind === 'video' ? 'video' : first ? 'photo' : 'text';
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

export async function addComment(comment, postId, uid) {
  if (!enabled()) return;
  try {
    const { error } = await supabase.from('comments').insert({
      id: comment.id,
      post_id: postId,
      author_id: uid,
      text: comment.text,
      created_at: new Date(comment.ts).toISOString(),
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
