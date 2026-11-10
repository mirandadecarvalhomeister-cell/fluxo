import { durSeconds, parseRemoteMedia } from './media';
import { isSupabaseEnabled, supabase } from './supabase';
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
    .select('post_id,user_id,emoji');
  if (!error) return data || [];
  warn(error);
  return safe(supabase.from('post_likes').select('post_id,user_id'));
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
  ] = await Promise.all([
    safe(
      supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
    ),
    loadPostLikes(),
    safe(supabase.from('post_saves').select('post_id').eq('user_id', uid)),
    safe(supabase.from('follows').select('follower_id,following_id')),
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
    localPostIds,
    localChanIds,
  };
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
      created_at: new Date(post.ts).toISOString(),
    };
    let row = { ...payload, media: media.length ? media : null };
    let { error } = await supabase.from('posts').upsert(row);
    if (error && /media|comments_disabled/i.test(error.message || '')) {
      const { media: _media, comments_disabled: _disabled, ...legacy } = payload;
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
    if (Array.isArray(post.media)) {
      patch.media = post.media.map((item) => ({
        kind: item.kind === 'video' ? 'video' : 'photo',
        src: item.src && !item.src.startsWith('blob:') ? item.src : null,
        seed: item.seed || post.seed || post.id,
        dur: durSeconds(item.dur),
      }));
    }
    let { error } = await supabase.from('posts').update(patch).eq('id', post.id);
    if (error && /media|comments_disabled/i.test(error.message || '')) {
      const { media: _media, comments_disabled: _disabled, ...legacy } = patch;
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
    const { error } = await supabase.from('posts').delete().eq('id', id);
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
    const { error } = await supabase.from('communities').upsert({
      id: community.id,
      name: community.name,
      category: community.cat,
      description: community.desc,
      cover_seed: community.seed,
      rules: community.rules,
      owner_id: uid,
    });
    if (error) warn(error);
    await setCommunityMembership(community.id, uid, true, 'owner');
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
