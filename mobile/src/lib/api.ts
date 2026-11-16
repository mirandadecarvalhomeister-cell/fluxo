import type {
  AppNotification,
  Channel,
  ChannelMessage,
  ChatThread,
  Comment,
  DirectMessage,
  Interactive,
  LivePoll,
  MediaItem,
  Post,
  Profile,
} from '../types';
import { durSeconds, parseRemoteMedia } from './media';
import { normalizeInteractive } from './interactive';
import { slug, uid } from './format';
import { supabase } from './supabase';

const PAGE_SIZE = 12;

type Row = Record<string, any>;

function fail(error: { message?: string } | null | undefined, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

function ts(value: unknown) {
  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function mapProfile(row: Row): Profile {
  return {
    id: String(row.user_id || row.id || ''),
    name: String(row.name || 'Sem nome'),
    handle: String(row.handle || ''),
    bio: String(row.bio || ''),
    city: String(row.city || ''),
    humor: String(row.humor || ''),
    interests: Array.isArray(row.interests) ? row.interests : [],
    avatar: row.avatar_url || null,
    followers: Number(row.followers) || 0,
    cover: row.cover || null,
  };
}

function baseMedia(row: Row): MediaItem[] {
  const media = parseRemoteMedia(row.media);
  if (!media.length && row.media_url) {
    media.push({
      kind: row.kind === 'video' ? 'video' : 'photo',
      src: row.media_url,
      seed: row.seed || row.id,
      dur: row.dur,
    });
  }
  return media;
}

export function mapPost(row: Row, extras?: {
  likes?: number;
  liked?: boolean;
  myReaction?: string | null;
  saved?: boolean;
  commentCount?: number;
  reactionCounts?: Record<string, number>;
}): Post {
  const media = baseMedia(row);
  return {
    id: String(row.id),
    authorId: String(row.author_id),
    createdAt: ts(row.created_at),
    text: String(row.text || ''),
    kind: row.kind === 'photo' || row.kind === 'video' ? row.kind : row.kind === 'story' ? 'story' : 'text',
    media,
    seed: String(row.seed || row.id),
    dur: row.dur ?? media[0]?.dur ?? null,
    likes: extras?.likes ?? (Number(row.likes) || 0),
    liked: Boolean(extras?.liked),
    myReaction: extras?.myReaction ?? null,
    saved: Boolean(extras?.saved),
    commentsDisabled: Boolean(row.comments_disabled),
    interactive: normalizeInteractive(row.interactive),
    commentCount: extras?.commentCount ?? 0,
    reactionCounts: extras?.reactionCounts ?? {},
    communityId: row.community_id || null,
  };
}

export async function ensureProfile(user: { id: string; email?: string; user_metadata?: Row }): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  fail(error, 'Não foi possível carregar o perfil.');

  if (data) return mapProfile(data);

  const name = String(user.user_metadata?.name || user.email?.split('@')[0] || 'Você');
  const row = {
    id: user.id,
    user_id: user.id,
    name,
    handle: (slug(name) || 'usuario') + user.id.slice(0, 4),
    bio: 'Novo por aqui. Bora fazer o fluxo rolar.',
    city: '',
    humor: '',
    interests: ['música', 'fotografia', 'cinema'],
    avatar_url: null,
    cover: { k: 'art', v: 'aurora' },
    followers: 0,
  };
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert(row)
    .select()
    .single();
  fail(insertError, 'Não foi possível criar o perfil.');
  return mapProfile(created);
}

async function profilesByIds(ids: string[]): Promise<Profile[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const { data, error } = await supabase.from('profiles').select('*').in('user_id', unique);
  if (error) return [];
  return (data || []).map(mapProfile);
}

export type FeedPage = { posts: Post[]; profiles: Profile[] };

export async function fetchFeedPage(uidValue: string, offset = 0): Promise<FeedPage> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  fail(error, 'Não foi possível carregar o feed.');
  return hydratePosts((data || []) as Row[], uidValue);
}

export async function fetchUserPosts(authorId: string, uidValue: string): Promise<FeedPage> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .limit(60);
  fail(error, 'Não foi possível carregar as publicações.');
  return hydratePosts((data || []) as Row[], uidValue);
}

export async function fetchReelsPage(uidValue: string, offset = 0): Promise<FeedPage> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('kind', 'video')
    .order('created_at', { ascending: false })
    .range(offset, offset + 9);
  fail(error, 'Não foi possível carregar os vídeos.');
  const page = await hydratePosts((data || []) as Row[], uidValue);
  return { ...page, posts: page.posts.filter((post) => post.media.some((item) => item.kind === 'video' && item.src)) };
}

export async function fetchPost(postId: string, uidValue: string): Promise<Post | null> {
  const { data, error } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const page = await hydratePosts([data as Row], uidValue, true);
  return page.posts[0] || null;
}

export async function hydratePosts(rows: Row[], uidValue: string, quiet = false): Promise<FeedPage> {
  if (!rows.length) return { posts: [], profiles: [] };
  const ids = rows.map((row) => String(row.id));
  const authorIds = rows.map((row) => String(row.author_id));

  const [profileList, likesResult, savesResult, commentsResult] = await Promise.all([
    profilesByIds(authorIds),
    supabase.from('post_likes').select('post_id,user_id,emoji').in('post_id', ids),
    supabase.from('post_saves').select('post_id').eq('user_id', uidValue).in('post_id', ids),
    supabase.from('comments').select('post_id').in('post_id', ids),
  ]);

  if (!quiet && likesResult.error && !/does not exist/i.test(likesResult.error.message || '')) {
    // Curtidas são um extra; não impedem o feed de abrir.
  }

  const likeRows = (likesResult.data || []) as Row[];
  const counts = new Map<string, number>();
  const mine = new Map<string, string>();
  const reactionCounts: Record<string, Record<string, number>> = {};
  likeRows.forEach((row) => {
    const postId = String(row.post_id);
    counts.set(postId, (counts.get(postId) || 0) + 1);
    if (row.user_id === uidValue) mine.set(postId, row.emoji || '❤️');
    reactionCounts[postId] ||= {};
    const emoji = row.emoji || '❤️';
    reactionCounts[postId][emoji] = (reactionCounts[postId][emoji] || 0) + 1;
  });

  const saved = new Set(((savesResult.data || []) as Row[]).map((row) => String(row.post_id)));
  const commentCounts = new Map<string, number>();
  ((commentsResult.data || []) as Row[]).forEach((row) => {
    const postId = String(row.post_id);
    commentCounts.set(postId, (commentCounts.get(postId) || 0) + 1);
  });

  return {
    posts: rows.map((row) =>
      mapPost(row, {
        likes: counts.get(String(row.id)) ?? (Number(row.likes) || 0),
        liked: mine.has(String(row.id)),
        myReaction: mine.get(String(row.id)) || null,
        saved: saved.has(String(row.id)),
        commentCount: commentCounts.get(String(row.id)) || 0,
        reactionCounts: reactionCounts[String(row.id)] || {},
      })
    ),
    profiles: profileList,
  };
}

export async function setLike(postId: string, uidValue: string, liked: boolean, emoji = '❤️') {
  if (liked) {
    const { error } = await supabase
      .from('post_likes')
      .upsert({ post_id: postId, user_id: uidValue, emoji });
    fail(error, 'Não foi possível curtir.');
  } else {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', uidValue);
    fail(error, 'Não foi possível remover a curtida.');
  }
}

export async function setSave(postId: string, uidValue: string, saved: boolean) {
  if (saved) {
    const { error } = await supabase.from('post_saves').upsert({ post_id: postId, user_id: uidValue });
    fail(error, 'Não foi possível salvar.');
  } else {
    const { error } = await supabase.from('post_saves').delete().eq('post_id', postId).eq('user_id', uidValue);
    fail(error, 'Não foi possível remover dos salvos.');
  }
}

export async function fetchComments(postId: string): Promise<{ comments: Comment[]; profiles: Profile[] }> {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(300);
  fail(error, 'Não foi possível carregar os comentários.');
  const rows = (data || []) as Row[];
  const profiles = await profilesByIds(rows.map((row) => String(row.author_id)));
  return {
    comments: rows.map((row) => ({
      id: String(row.id),
      postId: String(row.post_id),
      authorId: String(row.author_id),
      text: String(row.text || ''),
      createdAt: ts(row.created_at),
    })),
    profiles,
  };
}

export async function addComment(input: { postId: string; authorId: string; text: string }) {
  const row = {
    id: uid('c'),
    post_id: input.postId,
    author_id: input.authorId,
    text: input.text,
  };
  const { error } = await supabase.from('comments').insert(row);
  fail(error, 'Não foi possível comentar.');
  return row;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  fail(error, 'Não foi possível apagar o comentário.');
}

export type CreatePostInput = {
  authorId: string;
  text: string;
  media: MediaItem[];
  interactive: Interactive | null;
  kind?: 'text' | 'photo' | 'video';
};

export async function createPost(input: CreatePostInput): Promise<Post> {
  const id = uid('p');
  const first = input.media[0];
  const kind = input.kind || (first?.kind === 'video' ? 'video' : first ? 'photo' : 'text');
  const payload = {
    id,
    author_id: input.authorId,
    text: input.text,
    kind,
    media: input.media,
    media_url: first?.src && !String(first.src).startsWith('file:') ? first.src : null,
    seed: id,
    dur: first?.dur ?? null,
    likes: 0,
    comments_disabled: false,
    interactive: input.interactive,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('posts').insert(payload).select().single();
  fail(error, 'Não foi possível publicar.');
  return mapPost(data as Row, { commentCount: 0 });
}

export async function deletePost(postId: string) {
  await supabase.from('post_interactions').delete().eq('post_id', postId);
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  fail(error, 'Não foi possível apagar a publicação.');
}

export async function updatePost(postId: string, patch: { text?: string; commentsDisabled?: boolean }) {
  const payload: Row = {};
  if (patch.text !== undefined) payload.text = patch.text;
  if (patch.commentsDisabled !== undefined) payload.comments_disabled = patch.commentsDisabled;
  const { error } = await supabase.from('posts').update(payload).eq('id', postId);
  fail(error, 'Não foi possível salvar a edição.');
}

export async function saveInteraction(input: {
  id?: string;
  postId: string;
  userId: string;
  kind: 'vote' | 'answer' | 'join' | 'view';
  optionId?: string;
  text?: string;
}) {
  const { error } = await supabase.from('post_interactions').upsert({
    id: input.id || uid('i'),
    post_id: input.postId,
    user_id: input.userId,
    kind: input.kind,
    option_id: input.optionId || null,
    text: input.text || '',
  });
  fail(error, 'Não foi possível registrar sua participação.');
}

export async function fetchInteractions(postId: string) {
  const { data, error } = await supabase.from('post_interactions').select('*').eq('post_id', postId);
  fail(error, 'Não foi possível carregar as participações.');
  return (data || []) as Row[];
}

export async function setFollow(followerId: string, followingId: string, following: boolean) {
  if (following) {
    const { error } = await supabase.from('follows').upsert({ follower_id: followerId, following_id: followingId });
    fail(error, 'Não foi possível seguir.');
  } else {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId);
    fail(error, 'Não foi possível deixar de seguir.');
  }
}

export async function fetchFollowing(uidValue: string): Promise<string[]> {
  const { data, error } = await supabase.from('follows').select('following_id').eq('follower_id', uidValue);
  if (error) return [];
  return ((data || []) as Row[]).map((row) => String(row.following_id));
}

export async function fetchConnections(
  userId: string,
  mode: 'followers' | 'following'
): Promise<{ profiles: Profile[]; ids: string[] }> {
  const column = mode === 'followers' ? 'following_id' : 'follower_id';
  const select = mode === 'followers' ? 'follower_id' : 'following_id';
  const { data, error } = await supabase.from('follows').select(select).eq(column, userId).limit(300);
  if (error) return { profiles: [], ids: [] };
  const ids = ((data || []) as Row[]).map((row) => String(row[select]));
  return { profiles: await profilesByIds(ids), ids };
}

export async function saveProfile(profile: Profile, userId: string) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    user_id: userId,
    name: profile.name,
    handle: profile.handle,
    bio: profile.bio,
    city: profile.city,
    humor: profile.humor,
    interests: profile.interests,
    avatar_url: profile.avatar,
    cover: profile.cover,
    followers: profile.followers,
  });
  fail(error, 'Não foi possível salvar o perfil.');
}

export async function searchWorkspace(query: string, uidValue: string) {
  const term = query.trim();
  if (!term) return { profiles: [] as Profile[], posts: [] as Post[] };
  const [profileResult, postResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .or(`name.ilike.%${term}%,handle.ilike.%${term}%,bio.ilike.%${term}%`)
      .limit(30),
    supabase
      .from('posts')
      .select('*')
      .ilike('text', `%${term}%`)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  const page = await hydratePosts((postResult.data || []) as Row[], uidValue, true);
  return {
    profiles: (profileResult.data || []).map(mapProfile),
    posts: page.posts,
  };
}

export async function fetchRecentPosts(uidValue: string, limit = 80) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (await hydratePosts((data || []) as Row[], uidValue, true)).posts;
}

export async function fetchNotifications(uidValue: string, myPostIds: string[]): Promise<{ notifications: AppNotification[]; profiles: Profile[] }> {
  const ids = myPostIds.slice(0, 120);
  const [likes, comments, follows] = await Promise.all([
    ids.length
      ? supabase.from('post_likes').select('post_id,user_id,emoji,created_at').in('post_id', ids).order('created_at', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] as Row[], error: null }),
    ids.length
      ? supabase.from('comments').select('id,post_id,author_id,text,created_at').in('post_id', ids).order('created_at', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] as Row[], error: null }),
    supabase.from('follows').select('follower_id,created_at').eq('following_id', uidValue).order('created_at', { ascending: false }).limit(30),
  ]);

  const list: AppNotification[] = [];
  ((likes.data || []) as Row[]).forEach((row) => {
    if (String(row.user_id) === uidValue) return;
    list.push({
      id: `like:${row.post_id}:${row.user_id}`,
      type: 'like',
      actorId: String(row.user_id),
      postId: String(row.post_id),
      emoji: row.emoji || '❤️',
      createdAt: ts(row.created_at),
      read: false,
    });
  });
  ((comments.data || []) as Row[]).forEach((row) => {
    if (String(row.author_id) === uidValue) return;
    list.push({
      id: `comment:${row.id}`,
      type: 'comment',
      actorId: String(row.author_id),
      postId: String(row.post_id),
      text: String(row.text || ''),
      createdAt: ts(row.created_at),
      read: false,
    });
  });
  ((follows.data || []) as Row[]).forEach((row) => {
    list.push({
      id: `follow:${row.follower_id}`,
      type: 'follow',
      actorId: String(row.follower_id),
      createdAt: ts(row.created_at),
      read: false,
    });
  });

  list.sort((a, b) => b.createdAt - a.createdAt);
  return {
    notifications: list.slice(0, 80),
    profiles: await profilesByIds(list.map((item) => item.actorId)),
  };
}

export async function fetchConversations(uidValue: string): Promise<{ threads: ChatThread[]; profiles: Profile[]; unread: number }> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${uidValue},recipient_id.eq.${uidValue}`)
    .order('created_at', { ascending: false })
    .limit(600);
  if (error) return { threads: [], profiles: [], unread: 0 };

  const byUser = new Map<string, ChatThread>();
  let unread = 0;
  ((data || []) as Row[]).forEach((row) => {
    const other = row.sender_id === uidValue ? String(row.recipient_id) : String(row.sender_id);
    const current = byUser.get(other) || { userId: other, last: null, unread: 0 };
    if (!current.last) current.last = mapMessage(row);
    if (row.recipient_id === uidValue && !row.read) {
      current.unread += 1;
      unread += 1;
    }
    byUser.set(other, current);
  });

  const threads = [...byUser.values()].sort((a, b) => (b.last?.createdAt || 0) - (a.last?.createdAt || 0));
  return { threads, profiles: await profilesByIds(threads.map((thread) => thread.userId)), unread };
}

export function mapMessage(row: Row): DirectMessage {
  return {
    id: String(row.id),
    senderId: String(row.sender_id),
    recipientId: String(row.recipient_id),
    text: String(row.text || ''),
    attachment: row.attachment || null,
    read: Boolean(row.read),
    createdAt: ts(row.created_at),
    editedAt: row.edited_at ? ts(row.edited_at) : null,
  };
}

export async function fetchThread(uidValue: string, otherId: string): Promise<DirectMessage[]> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(
      `and(sender_id.eq.${uidValue},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${uidValue})`
    )
    .order('created_at', { ascending: true })
    .limit(500);
  fail(error, 'Não foi possível carregar a conversa.');
  return ((data || []) as Row[]).map(mapMessage);
}

export async function sendDirectMessage(input: {
  senderId: string;
  recipientId: string;
  text: string;
  attachment?: Record<string, any> | null;
}) {
  const row = {
    id: uid('m'),
    sender_id: input.senderId,
    recipient_id: input.recipientId,
    text: input.text,
    attachment: input.attachment || null,
    read: false,
  };
  const { error } = await supabase.from('direct_messages').insert(row);
  fail(error, 'Não foi possível enviar a mensagem.');
  return row;
}

export async function markThreadRead(uidValue: string, otherId: string) {
  const { error } = await supabase
    .from('direct_messages')
    .update({ read: true })
    .eq('recipient_id', uidValue)
    .eq('sender_id', otherId)
    .eq('read', false);
  if (error) {
    // Sem permissão de update, a conversa continua funcionando.
  }
}

export async function deleteDirectMessage(id: string) {
  const { error } = await supabase.from('direct_messages').delete().eq('id', id);
  fail(error, 'Não foi possível apagar a mensagem.');
}

export async function updateDirectMessage(id: string, text: string) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('A mensagem não pode ficar vazia.');
  const { data, error } = await supabase.rpc('edit_direct_message', {
    p_id: id,
    p_text: clean,
  });
  if (error) {
    // Backend antigo: tenta o update direto (a policy de edição já limita ao autor).
    const fallback = await supabase
      .from('direct_messages')
      .update({ text: clean, edited_at: new Date().toISOString() })
      .eq('id', id)
      .select('edited_at')
      .maybeSingle();
    if (fallback.error) throw new Error(error.message || 'Não foi possível editar a mensagem.');
    return fallback.data?.edited_at ? ts(fallback.data.edited_at) : Date.now();
  }
  if (data === false) throw new Error('Você só pode editar suas próprias mensagens.');
  return Date.now();
}

// ---------------------------------------------------------------------------
// Quiz BOOM! — ranking, cota, medalhas, desafios e convites.
// ---------------------------------------------------------------------------

const QUIZ_OFFLINE = { used: 0, bonus: 0, free_rounds: 3, remaining: 3, online: false };

export async function quizRoundStatus() {
  try {
    const { data, error } = await supabase.rpc('quiz_round_status');
    if (error) return QUIZ_OFFLINE;
    const row = (Array.isArray(data) ? data[0] : data) as Row | null;
    if (!row) return QUIZ_OFFLINE;
    return {
      used: Number(row.used) || 0,
      bonus: Number(row.bonus) || 0,
      free_rounds: Number(row.free_rounds) || 3,
      remaining: Number(row.remaining) || 0,
      online: true,
    };
  } catch {
    return QUIZ_OFFLINE;
  }
}

export async function quizBeginRun(input: { id: string; category: string; mode: string; total: number }) {
  try {
    const { error } = await supabase.rpc('quiz_begin_run', {
      p_id: input.id,
      p_category: input.category || 'todas',
      p_mode: input.mode === 'insane' ? 'insane' : 'classic',
      p_total: Number(input.total) || 10,
    });
    if (error) return { ok: false as const, error: error.message || 'error' };
    return { ok: true as const, error: null };
  } catch (error: any) {
    return { ok: false as const, error: error?.message || 'error' };
  }
}

export async function quizFinishRun(id: string, result: {
  score?: number;
  correct?: number;
  answered?: number;
  bestCombo?: number;
  durationMs?: number;
}) {
  if (!id) return false;
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
  return !error;
}

export async function quizSaveMedal(category: string) {
  if (!category) return false;
  const { error } = await supabase
    .from('quiz_medals')
    .upsert({ category, created_at: new Date().toISOString() });
  return !error;
}

export async function quizLoadMedals(): Promise<{ category: string; created_at?: string }[]> {
  const { data, error } = await supabase.from('quiz_medals').select('category,created_at');
  if (error) return [];
  return (data || []) as any;
}

export async function quizClaimInvite(inviter: string) {
  if (!inviter) return false;
  const { data, error } = await supabase.rpc('quiz_claim_invite', { p_inviter: inviter });
  if (error) return false;
  return data === true;
}

export async function quizSaveChallenge(challenge: {
  id: string;
  challengerId: string;
  challengerName?: string;
  category?: string;
  mode?: string;
  size?: number;
  targetScore?: number;
}) {
  if (!challenge?.id) return false;
  const { error } = await supabase.from('quiz_challenges').upsert({
    id: challenge.id,
    challenger_id: challenge.challengerId,
    challenger_name: challenge.challengerName || '',
    category: challenge.category || 'todas',
    mode: challenge.mode === 'insane' ? 'insane' : 'classic',
    size: Number(challenge.size) || 10,
    target_score: Math.max(0, Math.round(Number(challenge.targetScore) || 0)),
  });
  return !error;
}

export async function quizFetchChallenge(id: string) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('quiz_challenges')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row;
  return {
    id: String(row.id),
    challengerId: String(row.challenger_id || ''),
    challengerName: String(row.challenger_name || 'Um amigo'),
    category: String(row.category || 'todas'),
    mode: (row.mode === 'insane' ? 'insane' : 'classic') as 'classic' | 'insane',
    size: Number(row.size) || 10,
    targetScore: Number(row.target_score) || 0,
    createdAt: ts(row.created_at),
  };
}

function mapRanking(rows: unknown) {
  return (Array.isArray(rows) ? rows : []).map((raw) => {
    const row = raw as Row;
    return {
      position: Number(row.position) || 0,
      userId: String(row.user_id || ''),
      name: String(row.name || 'Jogador'),
      handle: String(row.handle || ''),
      avatar: row.avatar_url || null,
      score: Number(row.total_score) || 0,
      rounds: Number(row.rounds) || 0,
      bestCombo: Number(row.best_combo) || 0,
    };
  });
}

export async function quizRankings(limit = 50) {
  try {
    const [global, friends] = await Promise.all([
      supabase.rpc('quiz_weekly_ranking', { p_limit: limit }),
      supabase.rpc('quiz_friends_ranking', { p_limit: limit }),
    ]);
    return {
      global: mapRanking(global.data),
      friends: mapRanking(friends.data),
    };
  } catch {
    return { global: [], friends: [] };
  }
}

export function mapChannel(row: Row): Channel {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name || 'Live'),
    description: String(row.description || ''),
    kind: String(row.kind || 'conversa'),
    isLive: Boolean(row.is_live),
    livekit: Boolean(row.livekit),
    title: String(row.title || ''),
    viewers: Number(row.viewers) || 0,
    seed: row.seed || null,
    createdAt: ts(row.created_at),
  };
}

export async function fetchLiveChannels(): Promise<{ channels: Channel[]; profiles: Profile[] }> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('is_live', true)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) return { channels: [], profiles: [] };
  const channels = ((data || []) as Row[]).map(mapChannel);
  return { channels, profiles: await profilesByIds(channels.map((channel) => channel.ownerId)) };
}

export async function fetchChannel(channelId: string): Promise<{ channel: Channel; profile: Profile | null } | null> {
  const { data, error } = await supabase.from('channels').select('*').eq('id', channelId).maybeSingle();
  if (error || !data) return null;
  const channel = mapChannel(data as Row);
  const profiles = await profilesByIds([channel.ownerId]);
  return { channel, profile: profiles[0] || null };
}

export async function createLiveChannel(input: {
  ownerId: string;
  ownerName: string;
  title: string;
}): Promise<Channel> {
  const id = uid('live');
  const row = {
    id,
    owner_id: input.ownerId,
    name: input.ownerName,
    description: 'Live no Fluxo',
    kind: 'live',
    followers: 0,
    is_live: true,
    livekit: true,
    title: input.title || 'Ao vivo agora',
    viewers: 0,
    seed: id,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('channels').insert(row).select().single();
  fail(error, 'Não foi possível iniciar a live.');
  return mapChannel(data as Row);
}

export async function setChannelLive(channelId: string, live: boolean) {
  const { error } = await supabase
    .from('channels')
    .update({ is_live: live, viewers: live ? 0 : 0 })
    .eq('id', channelId);
  fail(error, 'Não foi possível atualizar a live.');
}

export async function fetchChannelMessages(channelId: string): Promise<{ messages: ChannelMessage[]; profiles: Profile[] }> {
  const { data, error } = await supabase
    .from('channel_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) return { messages: [], profiles: [] };
  const rows = (data || []) as Row[];
  return {
    messages: rows.map((row) => ({
      id: String(row.id),
      channelId: String(row.channel_id),
      authorId: String(row.author_id),
      text: String(row.text || ''),
      createdAt: ts(row.created_at),
    })),
    profiles: await profilesByIds(rows.map((row) => String(row.author_id))),
  };
}

export async function sendChannelMessage(input: { channelId: string; authorId: string; text: string }) {
  const row = {
    id: uid('cm'),
    channel_id: input.channelId,
    author_id: input.authorId,
    text: input.text,
  };
  const { error } = await supabase.from('channel_messages').insert(row);
  fail(error, 'Não foi possível enviar no chat.');
  return row;
}

export async function fetchLivePolls(channelId: string): Promise<LivePoll[]> {
  const [pollsResult, votesResult] = await Promise.all([
    supabase.from('channel_polls').select('*').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(20),
    supabase.from('channel_poll_votes').select('*'),
  ]);
  if (pollsResult.error) return [];
  const votes = (votesResult.data || []) as Row[];
  return ((pollsResult.data || []) as Row[]).map((row) => ({
    id: String(row.id),
    channelId: String(row.channel_id),
    createdBy: String(row.created_by),
    question: String(row.question || ''),
    options: Array.isArray(row.options) ? row.options : [],
    mode: row.mode === 'fluxo' ? 'fluxo' : 'chat',
    status: row.status === 'closed' ? 'closed' : 'open',
    postId: row.post_id || null,
    createdAt: ts(row.created_at),
    votes: votes
      .filter((vote) => vote.poll_id === row.id)
      .map((vote) => ({ id: String(vote.id), userId: String(vote.user_id), optionId: String(vote.option_id) })),
  }));
}

export async function createLivePoll(input: {
  channelId: string;
  createdBy: string;
  question: string;
  options: { id: string; label: string }[];
  mode: 'chat' | 'fluxo';
}): Promise<LivePoll> {
  const id = uid('poll');
  const { data, error } = await supabase
    .from('channel_polls')
    .insert({
      id,
      channel_id: input.channelId,
      created_by: input.createdBy,
      question: input.question,
      options: input.options,
      mode: input.mode,
      status: 'open',
    })
    .select()
    .single();
  fail(error, 'Não foi possível criar a enquete.');
  return {
    id,
    channelId: input.channelId,
    createdBy: input.createdBy,
    question: input.question,
    options: input.options,
    mode: input.mode,
    status: 'open',
    postId: null,
    createdAt: ts((data as Row)?.created_at),
    votes: [],
  };
}

export async function voteLivePoll(pollId: string, userId: string, optionId: string) {
  const { error } = await supabase
    .from('channel_poll_votes')
    .upsert({ poll_id: pollId, user_id: userId, option_id: optionId }, { onConflict: 'poll_id,user_id' });
  fail(error, 'Não foi possível votar.');
}

export async function closeLivePoll(pollId: string) {
  const { error } = await supabase
    .from('channel_polls')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', pollId);
  fail(error, 'Não foi possível encerrar a enquete.');
}

export async function uploadMedia(input: {
  uri: string;
  userId: string;
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<{ url: string; path: string }> {
  const response = await fetch(input.uri);
  const arrayBuffer = await response.arrayBuffer();
  const extension = String(input.fileName || input.uri).split('.').pop()?.toLowerCase() || 'bin';
  const path = `${input.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const { error } = await supabase.storage.from('media').upload(path, arrayBuffer, {
    cacheControl: '3600',
    upsert: false,
    contentType: input.mimeType || undefined,
  });
  fail(error, 'Não foi possível enviar o arquivo.');
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'fluxo://redefinir-senha',
  });
  fail(error, 'Não foi possível enviar o e-mail.');
}

export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_account');
  fail(error, 'Não foi possível excluir a conta.');
  await supabase.auth.signOut({ scope: 'local' });
}

// Atalhos usados pela interface nativa.
export const getConversation = (uidValue: string, otherId: string) => fetchThread(uidValue, otherId);

export async function getComments(postId: string) {
  const { comments } = await fetchComments(postId);
  return comments.map((comment) => ({
    id: comment.id,
    post_id: postId,
    author_id: comment.authorId,
    text: comment.text,
    created_at: new Date(comment.createdAt).toISOString(),
  }));
}

export const insertComment = addComment;

export async function getFollowers(userId: string) {
  const { ids } = await fetchConnections(userId, 'followers');
  return ids;
}

export async function getFollowing(userId: string) {
  const { ids } = await fetchConnections(userId, 'following');
  return ids;
}

export async function getChannel(channelId: string) {
  const result = await fetchChannel(channelId);
  return result?.channel || null;
}

export async function getChannelMessages(channelId: string) {
  const { messages } = await fetchChannelMessages(channelId);
  return messages;
}
