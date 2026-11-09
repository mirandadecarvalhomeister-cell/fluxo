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
