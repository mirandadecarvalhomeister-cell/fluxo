import { splitTags } from './utils';

export function userOf(data, id) {
  if (!data) return { id, name: id, handle: id, avatar: null, followers: 0 };
  if (id === 'me') return data.me;
  return (
    data.users[id] || {
      id,
      name: id,
      handle: id,
      bio: '',
      city: '',
      followers: 0,
      avatar: null,
    }
  );
}

export function isLive(data, id) {
  return !!data?.chans?.some((c) => c.owner === id && c.live);
}

export function unreadTotal(data) {
  return data?.chats?.reduce((acc, c) => acc + (c.unread || 0), 0) || 0;
}

export function roleOf(community) {
  if (!community) return '';
  if (community.owner === 'me') return 'Criador';
  if (community.mods?.includes('me')) return 'Moderador';
  return '';
}

// Corta um texto para caber numa prévia (sem quebras de linha).
export function clipText(text, max = 70) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean;
}

// O texto menciona @handle? Usa a mesma tokenização da renderização (TagText).
export function mentionsHandle(text, handle) {
  const target = String(handle || '').toLowerCase();
  if (!target) return false;
  return splitTags(text).some(
    (part) => part.mention && part.mention.toLowerCase() === target
  );
}

// Texto pt-BR de uma notificação: "curtiu a sua foto", "começou a seguir você"...
export function notificationText(notification, post) {
  if (!notification) return '';
  if (notification.type === 'follow') return 'começou a seguir você';
  if (notification.type === 'challenge') return 'te convidou para um desafio';
  if (notification.type === 'interaction') {
    if (notification.interactionKind === 'answer') return 'respondeu à sua pergunta';
    if (notification.interactionKind === 'join') return 'participou do seu desafio';
    if (post?.interactive?.format === 'imageVote') return 'votou na sua votação';
    return 'votou na sua enquete';
  }
  if (notification.type === 'mention') {
    if (notification.source === 'comment') return 'mencionou você em um comentário';
    if (post?.kind === 'story') return 'mencionou você em um story';
    return 'mencionou você em uma publicação';
  }
  const kind = post?.kind;
  if (notification.type === 'comment') {
    const base =
      kind === 'story'
        ? 'comentou no seu story'
        : kind === 'video'
          ? 'comentou no seu vídeo'
          : kind === 'photo'
            ? 'comentou na sua foto'
            : 'comentou na sua publicação';
    const preview = clipText(notification.text);
    return preview ? `${base}: “${preview}”` : base;
  }
  const what =
    kind === 'story'
      ? 'o seu story'
      : kind === 'video'
        ? 'o seu vídeo'
        : kind === 'photo'
          ? 'a sua foto'
          : 'a sua publicação';
  if (notification.type === 'like') {
    const reacted = notification.emoji && notification.emoji !== '❤️';
    return `${reacted ? `reagiu ${notification.emoji}` : 'curtiu'} ${what}`;
  }
  return 'interagiu com você';
}

// Várias curtidas na mesma publicação viram uma linha só:
// { kind: 'likes', postId, count, latest, items } ou { kind: 'single', notification }.
export function groupNotifications(notifications) {
  const groups = [];
  const likesByPost = new Map();
  (notifications || []).forEach((n) => {
    if (!n) return;
    if (n.type === 'like' && n.postId) {
      const group = likesByPost.get(n.postId);
      if (group) {
        group.count += 1;
        group.items.push(n);
        return;
      }
      const entry = {
        kind: 'likes',
        postId: n.postId,
        count: 1,
        latest: n,
        items: [n],
      };
      likesByPost.set(n.postId, entry);
      groups.push(entry);
      return;
    }
    groups.push({ kind: 'single', notification: n });
  });
  return groups;
}

// Texto no plural para um grupo de curtidas: "curtiram a sua foto".
export function likesGroupText(notification, post) {
  const kind = post?.kind;
  const what =
    kind === 'story'
      ? 'o seu story'
      : kind === 'video'
        ? 'o seu vídeo'
        : kind === 'photo'
          ? 'a sua foto'
          : 'a sua publicação';
  const emoji =
    notification?.emoji && notification.emoji !== '❤️' ? notification.emoji : null;
  return `${emoji ? `reagiram ${emoji}` : 'curtiram'} ${what}`;
}

export function unreadNotifications(data, seenTs = 0) {
  return (data?.notifications || []).filter((n) => (n.ts || 0) > seenTs);
}
