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

// Texto pt-BR de uma notificação: "curtiu a sua foto", "começou a seguir você"...
export function notificationText(notification, post) {
  if (!notification) return '';
  if (notification.type === 'follow') return 'começou a seguir você';
  const kind = post?.kind;
  if (notification.type === 'comment') {
    if (kind === 'story') return 'comentou no seu story';
    if (kind === 'video') return 'comentou no seu vídeo';
    if (kind === 'photo') return 'comentou na sua foto';
    return 'comentou na sua publicação';
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

export function unreadNotifications(data, seenTs = 0) {
  return (data?.notifications || []).filter((n) => (n.ts || 0) > seenTs);
}
