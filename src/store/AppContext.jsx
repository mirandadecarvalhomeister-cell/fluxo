import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { isRecoveryLink, isSupabaseEnabled } from '../lib/supabase';
import { isLiveKitEnabled } from '../lib/livekit';
import * as remote from '../lib/remote';
import {
  MAX_MEDIA_BYTES,
  MAX_POST_MEDIA,
  MAX_VIDEO_SECONDS,
  fileVideoDuration,
  mediaKind,
  mediaOf,
  mb,
  parseRemoteMedia,
} from '../lib/media';
import {
  DEFAULT_REACTIONS,
  buildInteractive,
  normalizeInteractive,
  optionsForFormat,
  syncImageVoteOptions,
} from '../lib/interactive';
import { COVERS, STATE_VERSION, newState } from '../lib/seed';
import { mentionsHandle, notificationText } from '../lib/selectors';
import { DEFAULT_FEED_PREFS, feedPrefs } from '../lib/feed';
import { showDeviceNotification } from '../lib/notify';
import { playMessageSound, playSentSound } from '../lib/sound';
import {
  fileToDataURL,
  fileToRawDataURL,
  fmt,
  fmtDur,
  lsGet,
  lsSet,
  sha256,
  shareLink,
  uid,
} from '../lib/utils';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const THEME_KEY = 'fluxo.theme';
const SETTINGS_KEY = 'fluxo.settings';
const SESSION_KEY = 'fluxo.session';
const ACCOUNTS_KEY = 'fluxo.accounts';
const DATA_PREFIX = 'fluxo.data.';

const DEFAULT_SETTINGS = {
  messageSound: true,
  notifications: false,
  reduceMotion: false,
  soundOnSend: false,
  mutedChats: [],
  liveChannels: [],
  chatWalls: {},
  feed: DEFAULT_FEED_PREFS,
};

const readSettings = () => {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(lsGet(SETTINGS_KEY) || '{}') || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const cacheKey = (email) => DATA_PREFIX + email;
const notifSeenKey = (id) => `fluxo.notifs.seen.${id}`;
const dropBlob = (_k, v) =>
  typeof v === 'string' && (v.startsWith('blob:') || v.length > 2_000_000)
    ? null
    : v;

function readCache(email) {
  try {
    const raw = lsGet(cacheKey(email));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.v === STATE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(email, data) {
  try {
    lsSet(cacheKey(email), JSON.stringify(data, dropBlob));
  } catch (error) {
    console.warn('[cache]', error);
  }
}

function mergeWorkspace(base, ws, user) {
  const uidv = user.id;
  const asPerson = (id) => (id === uidv ? 'me' : id);

  const followerCounts = new Map();
  (ws.allFollows || []).forEach((row) => {
    followerCounts.set(
      row.following_id,
      (followerCounts.get(row.following_id) || 0) + 1
    );
  });

  const users = {};
  (ws.liveProfiles || []).forEach((p) => {
    if (!p.user_id || p.user_id === uidv) return;
    users[p.user_id] = {
      id: p.user_id,
      name: p.name || p.user_id,
      handle: p.handle || '',
      bio: p.bio || '',
      city: p.city || '',
      humor: p.humor || '',
      interests: p.interests || [],
      followers: followerCounts.get(p.user_id) || 0,
      avatar: p.avatar_url || null,
      cover: p.cover || { k: 'art', v: 'aurora' },
    };
  });

  const me = {
    ...base.me,
    name: ws.profile.name || base.me.name,
    handle: ws.profile.handle || base.me.handle,
    bio: ws.profile.bio ?? base.me.bio,
    city: ws.profile.city ?? base.me.city,
    humor: ws.profile.humor ?? base.me.humor,
    interests: ws.profile.interests ?? base.me.interests,
    avatar: ws.profile.avatar_url ?? base.me.avatar,
    cover: ws.profile.cover ?? base.me.cover,
    followers: followerCounts.get(uidv) || 0,
    since: ws.profile.created_at
      ? new Date(ws.profile.created_at).getTime()
      : base.me.since,
  };

  const commentsByPost = {};
  (ws.comments || []).forEach((c) => {
    const entry = {
      id: c.id,
      by: asPerson(c.author_id),
      text: c.text,
      ts: new Date(c.created_at).getTime(),
    };
    (commentsByPost[c.post_id] ||= []).push(entry);
  });

  const interactionsByPost = {};
  (ws.postInteractions || []).forEach((row) => {
    if (!row?.post_id) return;
    (interactionsByPost[row.post_id] ||= []).push({
      id: row.id,
      by: asPerson(row.user_id),
      kind: row.kind,
      optionId: row.option_id || null,
      text: row.text || '',
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });

  const reactionCountsByPost = {};
  (ws.likeRows || []).forEach((row) => {
    if (!row?.post_id) return;
    const emoji = row.emoji || '❤️';
    (reactionCountsByPost[row.post_id] ||= {})[emoji] =
      (reactionCountsByPost[row.post_id][emoji] || 0) + 1;
  });

  const posts = (ws.posts || [])
    .map((p) => {
      const myReaction = ws.likes.mine.get(p.id) || null;
      const media = parseRemoteMedia(p.media);
      if (!media.length && p.media_url) {
        media.push({
          kind: p.kind === 'video' ? 'video' : 'photo',
          src: p.media_url,
          seed: p.seed || p.id,
          dur: p.dur,
        });
      }
      if (!media.length && (p.kind === 'photo' || p.kind === 'video')) {
        media.push({ kind: p.kind, seed: p.seed || p.id, dur: p.dur });
      }
      const isStory =
        p.kind === 'story' || String(p.seed || '').startsWith('story:');
      const normalizedInteractive = normalizeInteractive(p.interactive);
      return {
        id: p.id,
        by: asPerson(p.author_id),
        ts: new Date(p.created_at).getTime(),
        text: p.text || '',
        kind: isStory ? 'story' : p.kind || 'text',
        seed: p.seed || p.id,
        src: p.media_url || media[0]?.src,
        media,
        communityId: p.community_id || null,
        dur: p.dur ?? undefined,
        likes: ws.likes.counts.get(p.id) || 0,
        liked: !!myReaction,
        myReaction,
        reactionCounts: reactionCountsByPost[p.id] || {},
        saved: ws.saves.has(p.id),
        commentsDisabled: !!p.comments_disabled,
        comments: (commentsByPost[p.id] || []).sort((a, b) => a.ts - b.ts),
        interactive: normalizedInteractive
          ? {
              ...normalizedInteractive,
              invited: normalizedInteractive.invited.map(asPerson),
            }
          : null,
        interactions: (interactionsByPost[p.id] || []).sort((a, b) => a.ts - b.ts),
        views: (interactionsByPost[p.id] || []).filter((row) => row.kind === 'view').length,
        viewed: (interactionsByPost[p.id] || []).some(
          (row) => row.kind === 'view' && row.by === 'me'
        ),
      };
    })
    .sort((a, b) => b.ts - a.ts);

  const commMemberCounts = new Map();
  (ws.allCommMembers || []).forEach((row) => {
    commMemberCounts.set(
      row.community_id,
      (commMemberCounts.get(row.community_id) || 0) + 1
    );
  });
  const myCommRoles = new Map(
    (ws.allCommMembers || [])
      .filter((row) => row.user_id === uidv)
      .map((row) => [row.community_id, row.role])
  );

  const comms = (ws.allComms || [])
    .map((c) => {
      const owner = asPerson(c.owner_id);
      const memberRows = (ws.allCommMembers || []).filter(
        (row) => row.community_id === c.id
      );
      const modIds = memberRows
        .filter((row) => row.role === 'owner' || row.role === 'moderator')
        .map((row) => asPerson(row.user_id));
      const mods = [...new Set([owner, ...modIds])];
      const channelIds = (ws.communityChannels || [])
        .filter((row) => row.community_id === c.id)
        .map((row) => row.channel_id);
      const requests = (ws.joinRequests || [])
        .filter(
          (row) =>
            row.community_id === c.id &&
            (row.status || 'pending') === 'pending' &&
            row.user_id !== uidv
        )
        .map((row) => ({
          id: row.user_id,
          userId: asPerson(row.user_id),
          ts: new Date(row.created_at || Date.now()).getTime(),
        }));
      const myRequest = (ws.joinRequests || []).find(
        (row) =>
          row.community_id === c.id &&
          row.user_id === uidv &&
          (row.status || 'pending') === 'pending'
      );
      const invite = (ws.communityInvites || []).find(
        (row) =>
          row.community_id === c.id &&
          row.invitee_id === uidv &&
          (row.status || 'pending') === 'pending'
      );
      return {
        id: c.id,
        name: c.name,
        cat: c.category || 'Outros',
        desc: c.description || '',
        subs: memberRows.length,
        owner,
        mods,
        joined: memberRows.some((row) => row.user_id === uidv),
        pending: !!myRequest,
        invited: invite ? invite.id : null,
        private: !!c.is_private,
        iconUrl: c.icon_url || null,
        coverUrl: c.cover_url || null,
        seed: c.cover_seed || c.id + '-capa',
        rules: c.rules?.length ? c.rules : ['Respeite todo mundo no fluxo.'],
        members: memberRows.map((row) => asPerson(row.user_id)),
        requests,
        channelIds,
        topics: (ws.topics || [])
          .filter((t) => t.community_id === c.id)
          .map((t) => ({
            id: t.id,
            by: asPerson(t.author_id),
            title: t.title,
            replies: t.replies || 0,
            ts: new Date(t.created_at).getTime(),
          }))
          .sort((a, b) => b.ts - a.ts),
      };
    })
    .sort((a, b) => b.subs - a.subs);

  const chanMemberCounts = new Map();
  (ws.allChanMembers || []).forEach((row) => {
    chanMemberCounts.set(
      row.channel_id,
      (chanMemberCounts.get(row.channel_id) || 0) + 1
    );
  });

  const reactsByMsg = {};
  (ws.reactions || []).forEach((r) => {
    (reactsByMsg[r.message_id] ||= {})[r.emoji] = true;
  });

  const chans = (ws.allChannels || [])
    .map((c) => ({
      id: c.id,
      owner: asPerson(c.owner_id),
      name: c.name,
      desc: c.description || '',
      kind: c.kind || 'conversa',
      followers: chanMemberCounts.get(c.id) || 0,
      live: !!c.is_live,
      livekit: !!c.livekit,
      title: c.title || '',
      viewers: c.viewers || 0,
      joined: ws.chanMembers.has(c.id),
      seed: c.seed || c.id + '-palco',
      msgs: (ws.chanMsgs || [])
        .filter((m) => m.channel_id === c.id)
        .map((m) => {
          const entry = {
            id: m.id,
            by: asPerson(m.author_id),
            text: m.text,
            ts: new Date(m.created_at).getTime(),
          };
          const mine = reactsByMsg[m.id];
          return mine ? { ...entry, mine: { ...mine } } : entry;
        })
        .sort((a, b) => a.ts - b.ts),
    }))
    .sort((a, b) => Number(b.live) - Number(a.live) || b.followers - a.followers);

  const chatsByPerson = new Map();
  (ws.directMessages || []).forEach((m) => {
    const mine = m.sender_id === uidv;
    const other = asPerson(mine ? m.recipient_id : m.sender_id);
    if (!other || other === 'me') return;
    if (!chatsByPerson.has(other)) {
      chatsByPerson.set(other, { id: other, with: other, unread: 0, msgs: [] });
    }
    const chat = chatsByPerson.get(other);
    chat.msgs.push({
      id: m.id,
      me: mine,
      text: m.text || '',
      ts: new Date(m.created_at).getTime(),
      st: mine ? (m.read ? 'read' : 'sent') : '',
      ...(m.attachment ? { attachment: m.attachment } : {}),
    });
    if (!mine && !m.read) chat.unread += 1;
  });

  const chats = [...chatsByPerson.values()].map((chat) => ({
    ...chat,
    msgs: chat.msgs.sort((a, b) => a.ts - b.ts),
  }));

  const scraps = (ws.scraps || []).map((s) => ({
    id: s.id,
    by: asPerson(s.author_id),
    text: s.text,
    ts: new Date(s.created_at).getTime(),
  }));

  const followers = (ws.allFollows || [])
    .filter((row) => row.following_id === uidv)
    .map((row) => asPerson(row.follower_id))
    .filter((id) => id !== 'me');

  // Notificações: curtidas e comentários nos meus posts e quem começou
  // a me seguir — derivadas dos dados que já carregamos.
  const myPostIds = new Set(
    (ws.posts || []).filter((p) => p.author_id === uidv).map((p) => p.id)
  );
  const notifications = [];
  (ws.likeRows || []).forEach((row) => {
    if (row.user_id === uidv || !myPostIds.has(row.post_id)) return;
    notifications.push({
      id: `like:${row.post_id}:${row.user_id}`,
      type: 'like',
      actorId: row.user_id,
      postId: row.post_id,
      emoji: row.emoji || '❤️',
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });
  (ws.comments || []).forEach((c) => {
    if (c.author_id === uidv || !myPostIds.has(c.post_id)) return;
    notifications.push({
      id: `comment:${c.id}`,
      type: 'comment',
      actorId: c.author_id,
      postId: c.post_id,
      text: c.text || '',
      ts: new Date(c.created_at || Date.now()).getTime(),
    });
  });
  // Participações nas minhas publicações interativas (voto, resposta ou
  // entrada em desafio) e convites recebidos em desafios.
  const postsById = new Map(posts.map((post) => [post.id, post]));
  (ws.postInteractions || []).forEach((row) => {
    if (!row?.post_id || row.user_id === uidv) return;
    if (row.kind === 'view') return; // visualizações não geram notificação
    const post = postsById.get(row.post_id);
    if (!post || post.by !== 'me') return;
    notifications.push({
      id: `interaction:${row.id}`,
      type: 'interaction',
      actorId: row.user_id,
      postId: row.post_id,
      interactionKind: row.kind,
      optionId: row.option_id || null,
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });
  (ws.posts || []).forEach((post) => {
    const interactive = normalizeInteractive(post.interactive);
    if (post.author_id === uidv || interactive?.format !== 'challenge') return;
    if (!interactive.invited?.includes(uidv)) return;
    notifications.push({
      id: `challenge:${post.id}`,
      type: 'challenge',
      actorId: post.author_id,
      postId: post.id,
      ts: new Date(post.created_at || Date.now()).getTime(),
    });
  });
  (ws.allFollows || []).forEach((row) => {
    if (row.following_id !== uidv || row.follower_id === uidv) return;
    notifications.push({
      id: `follow:${row.follower_id}`,
      type: 'follow',
      actorId: row.follower_id,
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });

  // Menções (@handle) em publicações e comentários de outras pessoas.
  const myHandle = String(ws.profile?.handle || '').toLowerCase();
  if (myHandle) {
    (ws.posts || []).forEach((p) => {
      if (p.author_id === uidv || !mentionsHandle(p.text, myHandle)) return;
      notifications.push({
        id: `mention:post:${p.id}`,
        type: 'mention',
        source: 'post',
        actorId: p.author_id,
        postId: p.id,
        ts: new Date(p.created_at || Date.now()).getTime(),
      });
    });
    (ws.comments || []).forEach((c) => {
      if (
        c.author_id === uidv ||
        myPostIds.has(c.post_id) || // comentário no meu post já notifica
        !mentionsHandle(c.text, myHandle)
      ) {
        return;
      }
      notifications.push({
        id: `mention:comment:${c.id}`,
        type: 'mention',
        source: 'comment',
        actorId: c.author_id,
        postId: c.post_id,
        ts: new Date(c.created_at || Date.now()).getTime(),
      });
    });
  }
  // Convites e solicitações de comunidades.
  (ws.communityInvites || []).forEach((row) => {
    if (row.invitee_id !== uidv || (row.status || 'pending') !== 'pending') return;
    notifications.push({
      id: `cInvite:${row.id}`,
      type: 'communityInvite',
      actorId: row.inviter_id,
      communityId: row.community_id,
      inviteId: row.id,
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });
  const myManagedComms = new Set(
    (ws.allComms || [])
      .filter((row) => row.owner_id === uidv)
      .map((row) => row.id)
  );
  (ws.allCommMembers || []).forEach((row) => {
    if (
      row.user_id === uidv &&
      (row.role === 'owner' || row.role === 'moderator')
    ) {
      myManagedComms.add(row.community_id);
    }
  });
  (ws.joinRequests || []).forEach((row) => {
    if (
      !myManagedComms.has(row.community_id) ||
      row.user_id === uidv ||
      (row.status || 'pending') !== 'pending'
    ) {
      return;
    }
    notifications.push({
      id: `cRequest:${row.community_id}:${row.user_id}`,
      type: 'communityRequest',
      actorId: row.user_id,
      communityId: row.community_id,
      ts: new Date(row.created_at || Date.now()).getTime(),
    });
  });

  notifications.sort((a, b) => b.ts - a.ts);
  const trimmedNotifications = notifications.slice(0, 80);

  const customStickerPacks = (ws.stickerPacks || []).map((pack) => ({
    id: pack.id,
    name: pack.name,
    icon: pack.icon || '✨',
    ts: new Date(pack.created_at || Date.now()).getTime(),
    custom: true,
    stickers: (ws.stickerRows || [])
      .filter((row) => row.pack_id === pack.id)
      .map((row) => ({
        id: row.id,
        src: row.src,
        ts: new Date(row.created_at || 0).getTime(),
      }))
      .sort((a, b) => a.ts - b.ts),
  }));

  return {
    ...base,
    me: { ...me, scraps },
    users,
    follows: ws.follows || [],
    followers,
    posts,
    comms,
    chans,
    chats,
    customStickerPacks,
    notifications: trimmedNotifications,
  };
}

const demoAccounts = () => {
  try {
    return JSON.parse(lsGet(ACCOUNTS_KEY) || '{}');
  } catch {
    return {};
  }
};

const readHash = () => {
  const raw = (location.hash || '#feed').slice(1);
  const [route, param, extra] = raw.split('/');
  const valid = ['feed', 'perfil', 'mensagens', 'conexoes'].includes(route)
    ? route
    : 'feed';
  let room = null;
  let arenaCode = null;
  if (valid === 'conexoes' && param) {
    if (param === 'arena') {
      arenaCode = extra
        ? (() => {
            try {
              return decodeURIComponent(extra).trim().toUpperCase();
            } catch {
              return extra.trim().toUpperCase();
            }
          })()
        : '';
    } else {
      try {
        room = decodeURIComponent(param);
      } catch {
        room = param;
      }
    }
  }
  return { route: valid, room, arenaCode };
};

const initialUi = () => {
  const { route, room, arenaCode } = readHash();
  return {
    route,
    draft: {
      text: '',
      media: [],
      format: 'classic',
      options: [],
      reactions: DEFAULT_REACTIONS,
      invited: [],
      communityId: null,
    },
    open: {},
    profTab: 'posts',
    chat: null,
    chatOpen: false,
    chatQ: '',
    typing: {},
    room,
    arenaCode,
    chanFilter: 'all',
    myLive: null,
    authTab: 'in',
    modal: null,
    commSeed: COVERS[0],
    commDraft: null,
    settings: readSettings(),
    theme:
      lsGet(THEME_KEY) ||
      (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'),
  };
};

export function AppProvider({ children }) {
  const [data, setData] = useState(null);
  const [ui, setUi] = useState(initialUi);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [recovery, setRecovery] = useState(isRecoveryLink);
  const [toastMsg, setToastMsg] = useState('');
  const [canInstall, setCanInstall] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [onlinePeople, setOnlinePeople] = useState([]);
  const [typingPeople, setTypingPeople] = useState({});

  const installPrompt = useRef(null);
  const toastTimer = useRef();
  const timers = useRef({});
  const lastUserId = useRef(null);
  const recoveryRef = useRef(isRecoveryLink);
  const uiRef = useRef(ui);
  const dataRef = useRef(data);
  const sessionRef = useRef(session);
  const presenceRef = useRef(null);
  const typingTimersRef = useRef({});
  const lastTypingRef = useRef({});
  const viewedRef = useRef(new Set());
  uiRef.current = ui;
  dataRef.current = data;
  sessionRef.current = session;

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  }, []);

  useEffect(() => {
    // Login, cadastro e recuperação de senha usam sempre o modo claro,
    // independentemente do tema salvo na conta.
    document.documentElement.dataset.theme = data ? ui.theme : 'light';
    lsSet(THEME_KEY, ui.theme);
  }, [ui.theme, data]);

  useEffect(() => {
    lsSet(SETTINGS_KEY, JSON.stringify(ui.settings));
    document.documentElement.dataset.motion = ui.settings.reduceMotion ? 'reduce' : 'full';
  }, [ui.settings]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPrompt = (event) => {
      event.preventDefault();
      installPrompt.current = event;
      setCanInstall(true);
    };
    const onInstalled = () => {
      installPrompt.current = null;
      setCanInstall(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleOnline = () => {
      setOnline(true);
      toast('Conexão restabelecida.');
    };
    const handleOffline = () => {
      setOnline(false);
      toast('Você está offline. O conteúdo local continua disponível.');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  useEffect(() => {
    const onHash = () => {
      const { route, room, arenaCode } = readHash();
      setUi((u) =>
        u.route === route && u.room === room && u.arenaCode === arenaCode
          ? u
          : { ...u, route, room, arenaCode }
      );
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (data?.email) writeCache(data.email, data);
  }, [data]);

  const startLocal = useCallback((email, name) => {
    const cached = readCache(email);
    const state = cached || newState(name || email.split('@')[0], email);
    if (!cached) writeCache(email, state);
    setSession({ email, name: state.me.name, demo: true });
    setData(state);
    const deep = readHash();
    setUi((u) => ({
      ...u,
      chat: state.chats[0]?.id || null,
      chatOpen: false,
      room: deep.route === 'conexoes' ? deep.room : null,
      myLive: null,
      modal: null,
      typing: {},
    }));
    setReady(true);
  }, []);

  const startSupabase = useCallback(
    async (user) => {
      if (lastUserId.current === user.id && dataRef.current) return;
      lastUserId.current = user.id;
      setSession(user);
      const email = user.email || 'conta';
      const cached = readCache(email);
      const base = cached || newState(user.user_metadata?.name || email.split('@')[0], email);
      const localPostIds = base.posts.map((p) => p.id);
      const localChanIds = base.chans.map((c) => c.id);
      let workspace = null;
      try {
        workspace = await remote.loadWorkspace(user, localPostIds, localChanIds);
      } catch (error) {
        console.warn(error);
        toast('Não foi possível carregar o Supabase. Seguindo com os dados locais.');
      }
      const merged = workspace ? mergeWorkspace(base, workspace, user) : base;
      setData(merged);
      const deep = readHash();
      setUi((u) => ({
        ...u,
        chat: merged.chats[0]?.id || null,
        chatOpen: false,
        room: deep.route === 'conexoes' ? deep.room : null,
        myLive: null,
        modal: null,
        typing: {},
        settings: workspace?.feedPrefs
          ? {
              ...u.settings,
              feed: { ...feedPrefs(u.settings), ...workspace.feedPrefs },
            }
          : u.settings,
      }));
      writeCache(email, merged);
      setReady(true);
    },
    [toast]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isSupabaseEnabled) {
        if (isRecoveryLink) {
          if (!cancelled) setReady(true);
          return;
        }
        const s = await remote.getSession();
        if (cancelled) return;
        if (s?.user) await startSupabase(s.user);
        else setReady(true);
      } else {
        const email = lsGet(SESSION_KEY);
        if (email) startLocal(email);
        else setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startLocal, startSupabase]);

  useEffect(() => {
    if (!isSupabaseEnabled) return undefined;
    return remote.onAuthChange((s, event) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRef.current = true;
        setRecovery(true);
        setReady(true);
        return;
      }
      if (recoveryRef.current) return;
      if (s?.user) startSupabase(s.user);
      else {
        lastUserId.current = null;
        setSession(null);
        setData(null);
      }
    });
  }, [startSupabase]);

  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    return remote.subscribeDirectMessages(session.id, (row, event) => {
      if (!row) return;
      if (event === 'UPDATE') {
        if (!row.id || !row.read) return;
        // O "visto" do outro lado chega em tempo real: marca os meus envios.
        setData((cur) =>
          cur
            ? {
                ...cur,
                chats: cur.chats.map((chat) => ({
                  ...chat,
                  msgs: chat.msgs.map((item) =>
                    item.id === row.id ? { ...item, st: 'read' } : item
                  ),
                })),
              }
            : cur
        );
        return;
      }
      if (event === 'DELETE') {
        if (!row.id) return;
        setData((cur) =>
          cur
            ? {
                ...cur,
                chats: cur.chats.map((chat) =>
                  chat.msgs.some((item) => item.id === row.id)
                    ? { ...chat, msgs: chat.msgs.filter((item) => item.id !== row.id) }
                    : chat
                ),
              }
            : cur
        );
        return;
      }
      if (!row.sender_id) return;
      const settings = uiRef.current.settings || DEFAULT_SETTINGS;
      const viewing =
        uiRef.current.route === 'mensagens' && uiRef.current.chat === row.sender_id;
      const message = {
        id: row.id,
        me: false,
        text: row.text || '',
        ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        st: '',
        ...(row.attachment ? { attachment: row.attachment } : {}),
      };
      setData((cur) => {
        if (!cur) return cur;
        const exists = cur.chats.some((chat) => chat.with === row.sender_id);
        const chats = exists
          ? cur.chats.map((chat) =>
              chat.with === row.sender_id
                ? {
                    ...chat,
                    msgs: chat.msgs.some((item) => item.id === message.id)
                      ? chat.msgs
                      : [...chat.msgs, message],
                    unread: viewing ? chat.unread : (chat.unread || 0) + 1,
                  }
                : chat
            )
          : [
              {
                id: row.sender_id,
                with: row.sender_id,
                unread: 1,
                msgs: [message],
              },
              ...cur.chats,
            ];
        return { ...cur, chats };
      });
      if (viewing) {
        remote.markDirectMessagesRead(session.id, row.sender_id);
      }
      const muted = (settings.mutedChats || []).includes(row.sender_id);
      if (settings.messageSound && !muted) playMessageSound();
      if (
        settings.notifications &&
        !muted &&
        document.hidden &&
        row.sender_id !== session.id
      ) {
        showDeviceNotification('Nova mensagem no FluXo', {
          body: row.text || 'Você recebeu um anexo.',
          tag: `dm:${row.sender_id}`,
          data: { url: '/#mensagens' },
        });
      }
    });
  }, [session?.id]);

  // Novos seguidores em tempo real: atualiza o sino e avisa no celular.
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    return remote.subscribeFollows(session.id, (row) => {
      const followerId = row?.follower_id;
      if (!followerId || followerId === session.id) return;
      const settings = uiRef.current.settings || DEFAULT_SETTINGS;
      setData((cur) => {
        if (!cur) return cur;
        const alreadyFollower = (cur.followers || []).includes(followerId);
        const entry = {
          id: `follow:${followerId}`,
          type: 'follow',
          actorId: followerId,
          ts: Date.now(),
        };
        const already = (cur.notifications || []).some(
          (item) => item.id === entry.id
        );
        return {
          ...cur,
          followers: alreadyFollower
            ? cur.followers
            : [...(cur.followers || []), followerId],
          me: cur.me
            ? {
                ...cur.me,
                followers: (cur.me.followers || 0) + (alreadyFollower ? 0 : 1),
              }
            : cur.me,
          notifications: already
            ? cur.notifications
            : [entry, ...(cur.notifications || [])].slice(0, 80),
        };
      });
      const person = dataRef.current?.users?.[followerId];
      const label = person?.name || 'Alguém';
      if (settings.notifications && document.hidden) {
        showDeviceNotification('Novo seguidor no FluXo', {
          body: `${label} começou a seguir você`,
          tag: `follow:${followerId}`,
          data: { url: '/#perfil' },
        });
      } else {
        toast(`${label} começou a seguir você`);
      }
    });
  }, [session?.id, toast]);

  // Presença online e "digitando…" via Realtime (presence + broadcast).
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    const client = remote.joinPresence(session.id, {
      onSync: (ids) => setOnlinePeople(ids),
      onTyping: (payload) => {
        const from = payload?.from;
        if (!from || !payload?.to || payload.to !== session.id) return;
        setTypingPeople((current) => ({ ...current, [from]: payload.to }));
        clearTimeout(typingTimersRef.current[from]);
        typingTimersRef.current[from] = window.setTimeout(() => {
          delete typingTimersRef.current[from];
          setTypingPeople((current) => {
            if (!(from in current)) return current;
            const next = { ...current };
            delete next[from];
            return next;
          });
        }, 4200);
      },
    });
    presenceRef.current = client;
    return () => {
      presenceRef.current = null;
      Object.values(typingTimersRef.current).forEach((id) => clearTimeout(id));
      typingTimersRef.current = {};
      lastTypingRef.current = {};
      setTypingPeople({});
      setOnlinePeople([]);
      client?.leave();
    };
  }, [session?.id]);

  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id || !ui.room) return undefined;
    return remote.subscribeChannelMessages(ui.room, (row) => {
      if (!row || !row.id || !row.channel_id) return;
      const message = {
        id: row.id,
        by: row.author_id === session.id ? 'me' : row.author_id,
        text: row.text || '',
        ts: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      };
      setData((cur) => {
        if (!cur) return cur;
        const channel = cur.chans.find((item) => item.id === row.channel_id);
        if (!channel) return cur;
        if (channel.msgs.some((item) => item.id === message.id)) return cur;
        return {
          ...cur,
          chans: cur.chans.map((item) =>
            item.id === row.channel_id
              ? { ...item, msgs: [...item.msgs, message] }
              : item
          ),
        };
      });
    });
  }, [session?.id, ui.room]);

  // Reforço por polling para o canal aberto. O Realtime depende de a
  // publicação estar habilitada nas tabelas; o polling garante que mensagens
  // da live e o encerramento apareçam para quem assiste mesmo sem isso.
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id || !ui.room) return undefined;
    const channelId = ui.room;
    let cancelled = false;
    let running = false;

    const merge = async () => {
      if (cancelled || running || document.hidden) return;
      running = true;
      try {
        const [row, rows] = await Promise.all([
          remote.fetchChannelSnapshot(channelId),
          remote.fetchChannelMessages(channelId),
        ]);
        if (cancelled) return;
        setData((cur) => {
          if (!cur) return cur;
          const channel = cur.chans.find((item) => item.id === channelId);
          if (!channel) return cur;
          let next = channel;
          if (row) {
            next = {
              ...next,
              name: row.name || next.name,
              desc: row.description ?? next.desc,
              kind: row.kind || next.kind,
              live: !!row.is_live,
              livekit: !!row.livekit,
              title: row.title || '',
              viewers: row.viewers || 0,
              seed: row.seed || next.seed,
            };
          }
          const known = new Set(next.msgs.map((item) => item.id));
          const incoming = rows
            .filter((item) => item && item.id && !known.has(item.id))
            .map((item) => ({
              id: item.id,
              by: item.author_id === session.id ? 'me' : item.author_id,
              text: item.text || '',
              ts: item.created_at
                ? new Date(item.created_at).getTime()
                : Date.now(),
            }));
          if (incoming.length) {
            next = {
              ...next,
              msgs: [...next.msgs, ...incoming].sort((a, b) => a.ts - b.ts),
            };
          }
          return {
            ...cur,
            chans: cur.chans.map((item) =>
              item.id === channelId ? next : item
            ),
          };
        });
      } finally {
        running = false;
      }
    };

    merge();
    const timer = window.setInterval(merge, 4500);
    const onVisible = () => {
      if (!document.hidden) merge();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session?.id, ui.room]);

  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    return remote.subscribeChannels((payload) => {
      const row = payload.new || payload.old;
      if (!row?.id) return;
      const settings = uiRef.current.settings || DEFAULT_SETTINGS;
      const goingLive =
        payload.eventType === 'UPDATE' && payload.new?.is_live && !payload.old?.is_live;
      setData((cur) => {
        if (!cur) return cur;
        if (payload.eventType === 'DELETE') {
          return {
            ...cur,
            chans: cur.chans.filter((item) => item.id !== row.id),
          };
        }
        const exists = cur.chans.some((item) => item.id === row.id);
        if (!exists) {
          if (!row.is_live) return cur;
          const channel = {
            id: row.id,
            owner: row.owner_id === session.id ? 'me' : row.owner_id,
            name: row.name || 'Canal',
            desc: row.description || '',
            kind: row.kind || 'palco',
            followers: row.followers || 0,
            live: true,
            livekit: !!row.livekit,
            title: row.title || '',
            viewers: row.viewers || 0,
            joined: false,
            seed: row.seed || `${row.id}-palco`,
            msgs: [],
          };
          return { ...cur, chans: [channel, ...cur.chans] };
        }
        return {
          ...cur,
          chans: cur.chans.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  live: !!row.is_live,
                  livekit: !!row.livekit,
                  title: row.title || item.title,
                  viewers: row.viewers ?? item.viewers,
                }
              : item
          ),
        };
      });
      if (!goingLive) return;
      if (payload.new.owner_id === session.id) return;
      const interested =
        (dataRef.current?.follows || []).includes(payload.new.owner_id) ||
        (settings.liveChannels || []).includes(row.id);
      if (!settings.notifications || !interested) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        new Notification('Live no ar no FluXo', {
          body: `${payload.new.title || payload.new.name || 'Um canal'} está ao vivo agora.`,
          icon: '/assets/icon-192.png',
          tag: `live-${row.id}`,
        });
      } catch {
        /* notification is best-effort */
      }
    });
  }, [session?.id]);

  // Sino de notificações: curtidas nos meus posts, comentários e seguidores.
  useEffect(() => {
    if (!isSupabaseEnabled || !session?.id) return undefined;
    return remote.subscribeNotifications(session.id, (kind, row) => {
      if (!row) return;
      const uidv = session.id;
      const ts = row.created_at ? new Date(row.created_at).getTime() : Date.now();
      const cur = dataRef.current;
      if (!cur) return;

      if (kind === 'comment-delete') {
        if (!row?.id) return;
        setData((state) =>
          state
            ? {
                ...state,
                posts: state.posts.map((post) => ({
                  ...post,
                  comments: (post.comments || []).filter(
                    (comment) => comment.id !== row.id
                  ),
                })),
              }
            : state
        );
        return;
      }

      let notification = null;
      const rowInteractive = normalizeInteractive(row.interactive);
      if (kind === 'interaction') {
        const post = cur.posts.find((p) => p.id === row.post_id);
        if (!post || !row.id) return;
        const entry = {
          id: row.id,
          by: row.user_id === uidv ? 'me' : row.user_id,
          kind: row.kind,
          optionId: row.option_id || null,
          text: row.text || '',
          ts,
        };
        setData((state) => {
          if (!state) return state;
          return {
            ...state,
            posts: state.posts.map((p) => {
              if (p.id !== row.post_id) return p;
              const kept = (p.interactions || []).filter(
                (item) =>
                  item.id !== entry.id &&
                  !(item.by === entry.by && item.kind === entry.kind)
              );
              return {
                ...p,
                interactions: [...kept, entry].sort((a, b) => a.ts - b.ts),
              };
            }),
          };
        });
        if (row.user_id !== uidv && post.by === 'me') {
          notification = {
            id: `interaction:${row.id}`,
            type: 'interaction',
            actorId: row.user_id,
            postId: row.post_id,
            interactionKind: row.kind,
            optionId: row.option_id || null,
            ts,
          };
        }
      } else if (kind === 'follow') {
        if (row.following_id === uidv && row.follower_id !== uidv) {
          notification = {
            id: `follow:${row.follower_id}`,
            type: 'follow',
            actorId: row.follower_id,
            ts,
          };
        }
      } else if (kind === 'like') {
        const post = cur.posts.find((p) => p.id === row.post_id);
        if (row.user_id !== uidv && post && post.by === 'me') {
          notification = {
            id: `like:${row.post_id}:${row.user_id}`,
            type: 'like',
            actorId: row.user_id,
            postId: row.post_id,
            emoji: row.emoji || '❤️',
            ts,
          };
        }
      } else if (kind === 'comment') {
        const post = cur.posts.find((p) => p.id === row.post_id);
        const mine = post?.by === 'me';
        if (row.author_id !== uidv && mine) {
          notification = {
            id: `comment:${row.id}`,
            type: 'comment',
            actorId: row.author_id,
            postId: row.post_id,
            text: row.text || '',
            ts,
          };
        } else if (
          row.author_id !== uidv &&
          !mine &&
          mentionsHandle(row.text, cur.me?.handle)
        ) {
          notification = {
            id: `mention:comment:${row.id}`,
            type: 'mention',
            source: 'comment',
            actorId: row.author_id,
            postId: row.post_id,
            ts,
          };
        }
      } else if (kind === 'post') {
        const interactive = rowInteractive;
        const challenged =
          interactive?.format === 'challenge' &&
          interactive.invited?.includes(uidv);
        const mentioned = mentionsHandle(row.text, cur.me?.handle);
        if (row.author_id === uidv || (!mentioned && !challenged)) {
          return;
        }
        notification = challenged
          ? {
              id: `challenge:${row.id}`,
              type: 'challenge',
              actorId: row.author_id,
              postId: row.id,
              ts,
            }
          : {
              id: `mention:post:${row.id}`,
              type: 'mention',
              source: 'post',
              actorId: row.author_id,
              postId: row.id,
              ts,
            };
      }
      if (!notification) return;

      setData((state) => {
        if (!state) return state;
        const notifications = state.notifications || [];
        if (notifications.some((n) => n.id === notification.id)) return state;
        const next = {
          ...state,
          notifications: [notification, ...notifications].slice(0, 80),
        };
        if (kind === 'follow') {
          const followers = state.followers || [];
          if (!followers.includes(row.follower_id)) {
            next.followers = [row.follower_id, ...followers];
          }
          next.me = { ...state.me, followers: (state.me.followers || 0) + 1 };
        } else if (kind === 'like') {
          next.posts = state.posts.map((p) => {
            if (p.id !== row.post_id) return p;
            const emoji = row.emoji || '❤️';
            const counts = { ...(p.reactionCounts || {}) };
            counts[emoji] = (counts[emoji] || 0) + 1;
            return {
              ...p,
              likes: (p.likes || 0) + 1,
              reactionCounts: counts,
            };
          });
        } else if (kind === 'comment') {
          const comment = { id: row.id, by: row.author_id, text: row.text || '', ts };
          next.posts = state.posts.map((p) =>
            p.id === row.post_id
              ? p.comments.some((c) => c.id === comment.id)
                ? p
                : { ...p, comments: [...p.comments, comment] }
              : p
          );
        } else if (kind === 'post') {
          // Convites e edições chegam por UPDATE. Se o post já está no feed,
          // atualiza o formato interativo (convites) e o texto.
          const existing = state.posts.find((p) => p.id === row.id);
          if (existing) {
            next.posts = state.posts.map((p) =>
              p.id === row.id
                ? {
                    ...p,
                    text: row.text ?? p.text,
                    commentsDisabled: !!row.comments_disabled,
                    interactive: rowInteractive
                      ? {
                          ...rowInteractive,
                          invited: rowInteractive.invited.map((id) =>
                            id === uidv ? 'me' : id
                          ),
                        }
                      : p.interactive,
                  }
                : p
            );
            return next;
          }
          // A publicação mencionada ainda não estava no feed: entra agora,
          // senão a notificação abriria um post inexistente.
          if (!state.posts.some((p) => p.id === row.id)) {
            const media = parseRemoteMedia(row.media);
            if (!media.length && row.media_url) {
              media.push({
                kind: row.kind === 'video' ? 'video' : 'photo',
                src: row.media_url,
                seed: row.seed || row.id,
                dur: row.dur,
              });
            }
            if (!media.length && (row.kind === 'photo' || row.kind === 'video')) {
              media.push({ kind: row.kind, seed: row.seed || row.id, dur: row.dur });
            }
            const isStory =
              row.kind === 'story' || String(row.seed || '').startsWith('story:');
            next.posts = [
              {
                id: row.id,
                by: row.author_id,
                ts,
                text: row.text || '',
                kind: isStory ? 'story' : row.kind || 'text',
                seed: row.seed || row.id,
                src: row.media_url || media[0]?.src,
                media,
                dur: row.dur ?? undefined,
                likes: row.likes || 0,
                liked: false,
                myReaction: null,
                reactionCounts: {},
                saved: false,
                commentsDisabled: !!row.comments_disabled,
                comments: [],
                interactive: rowInteractive
                  ? {
                      ...rowInteractive,
                      invited: rowInteractive.invited.map((id) =>
                        id === uidv ? 'me' : id
                      ),
                    }
                  : null,
                interactions: [],
              },
              ...state.posts,
            ];
          }
        }
        return next;
      });

      const settings = uiRef.current.settings || DEFAULT_SETTINGS;
      if (
        !settings.notifications ||
        typeof Notification === 'undefined' ||
        Notification.permission !== 'granted' ||
        !document.hidden
      ) {
        return;
      }
      const actor = (cur.users || {})[notification.actorId];
      const post = notification.postId
        ? cur.posts.find((p) => p.id === notification.postId)
        : null;
      try {
        new Notification('FluXo', {
          body: `${actor?.name || 'Alguém'} ${notificationText(notification, post)}`,
          icon: '/assets/icon-192.png',
          tag: notification.id,
        });
      } catch {
        /* notification is best-effort */
      }
    });
  }, [session?.id]);

  // Guarda quando a pessoa viu as notificações pela última vez (por conta).
  useEffect(() => {
    if (!session?.id) return;
    const seen = Number(lsGet(notifSeenKey(session.id))) || 0;
    setUi((u) => (u.notifSeen === seen ? u : { ...u, notifSeen: seen }));
  }, [session?.id]);

  function markNotifsSeen() {
    const id = sessionRef.current?.id;
    const now = Date.now();
    if (id) lsSet(notifSeenKey(id), String(now));
    setUi((u) => ({ ...u, notifSeen: now }));
  }

  useEffect(() => {
    return () => {
      clearTimeout(toastTimer.current);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  async function submitAuth({ tab, name, email, password, confirm }) {
    const mail = email.trim().toLowerCase();
    if (tab === 'up' && name.trim().length < 2) return 'Digite seu nome.';
    if (!/^\S+@\S+\.\S+$/.test(mail)) return 'Digite um e-mail válido.';
    if (password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (tab === 'up' && password !== confirm) return 'As senhas não coincidem.';

    try {
      if (isSupabaseEnabled) {
        if (tab === 'up') {
          const res = await remote.signUp({ name: name.trim(), email: mail, password });
          if (res.session?.user) {
            await startSupabase(res.session.user);
            toast('Conta criada. Bem-vindo ao fluxo!');
          } else {
            toast('Conta criada! Confirme seu e-mail para entrar.');
          }
        } else {
          const res = await remote.signIn({ email: mail, password });
          await startSupabase(res.user);
        }
      } else {
        if (tab === 'up') {
          const accounts = demoAccounts();
          if (accounts[mail]) throw new Error('Este e-mail já tem conta. Use a aba Entrar.');
          accounts[mail] = { name: name.trim(), h: await sha256(password) };
          lsSet(ACCOUNTS_KEY, JSON.stringify(accounts));
          lsSet(SESSION_KEY, mail);
          startLocal(mail, name.trim());
        } else {
          const accounts = demoAccounts();
          if (!accounts[mail] || accounts[mail].h !== (await sha256(password))) {
            throw new Error('E-mail ou senha incorretos.');
          }
          lsSet(SESSION_KEY, mail);
          startLocal(mail, accounts[mail].name);
        }
      }
      return null;
    } catch (error) {
      return error.message || 'Não foi possível entrar.';
    }
  }

  async function google() {
    if (!isSupabaseEnabled) {
      startLocal('visitante.google@demo.fluxo', 'Visitante Google');
      toast('Modo demonstração: login com Google simulado.');
      return;
    }
    try {
      await remote.signInWithGoogle();
    } catch (error) {
      toast(error.message || 'Não foi possível entrar com Google.');
    }
  }

  async function requestPasswordReset(email) {
    const mail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return 'Digite um e-mail válido.';
    if (!isSupabaseEnabled) {
      return 'A recuperação de senha precisa do Supabase configurado.';
    }
    try {
      await remote.resetPassword(mail, window.location.origin);
      return null;
    } catch (error) {
      return error.message || 'Não foi possível enviar o e-mail.';
    }
  }

  async function finishRecovery({ password, confirm }) {
    if (password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (password !== confirm) return 'As senhas não coincidem.';
    if (!isSupabaseEnabled) {
      return 'A recuperação de senha precisa do Supabase configurado.';
    }
    try {
      const result = await remote.updatePassword(password);
      recoveryRef.current = false;
      setRecovery(false);
      const user = result?.user || (await remote.getSession())?.user;
      if (user) await startSupabase(user);
      toast('Senha atualizada. Você já está conectado.');
      return null;
    } catch (error) {
      return error.message || 'Não foi possível atualizar a senha.';
    }
  }

  async function cancelRecovery() {
    recoveryRef.current = false;
    setRecovery(false);
    if (isSupabaseEnabled) await remote.signOut();
    setSession(null);
    setData(null);
    setReady(true);
    if (location.hash) history.replaceState(null, '', location.pathname);
  }

  function requestConfirm({ title, text, confirmLabel = 'Confirmar', tone = 'primary', action }) {
    setUi((u) => ({
      ...u,
      modal: { type: 'confirm', title, text, confirmLabel, tone, action },
    }));
  }

  async function logout() {
    if (liveChannelOfMine()) finishLive({ silent: true });
    if (isSupabaseEnabled) await remote.signOut();
    else lsSet(SESSION_KEY, '');
    lastUserId.current = null;
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    setData(null);
    setSession(null);
    setUi((u) => ({
      ...u,
      chat: null,
      chatOpen: false,
      room: null,
      myLive: null,
      modal: null,
      typing: {},
    }));
    if (location.hash) history.replaceState(null, '', location.pathname);
  }

  async function deleteAccount(password) {
    const email = session?.email || data?.email || '';
    const typed = String(password || '');

    try {
      if (isSupabaseEnabled) {
        // Contas criadas com e-mail/senha pedem a senha atual. Contas só com
        // Google não têm senha, então exigem a confirmação digitada.
        const hasPassword = (
          session?.app_metadata?.providers ||
          (session?.identities || []).map((identity) => identity.provider)
        ).includes('email');
        if (hasPassword) {
          if (!typed) return 'Digite a senha da sua conta para confirmar.';
          try {
            await remote.verifyPassword(email, typed);
          } catch {
            return 'Senha incorreta. A conta não foi excluída.';
          }
        } else if (typed.trim().toUpperCase() !== 'EXCLUIR') {
          return 'Digite EXCLUIR para confirmar a exclusão.';
        }
        if (liveChannelOfMine()) finishLive({ silent: true });
        await remote.deleteAccount();
      } else {
        const accounts = demoAccounts();
        if (email && accounts[email]) {
          if (!typed || accounts[email].h !== (await sha256(typed))) {
            return 'Senha incorreta. A conta não foi excluída.';
          }
          delete accounts[email];
          lsSet(ACCOUNTS_KEY, JSON.stringify(accounts));
        }
        if (liveChannelOfMine()) finishLive({ silent: true });
        lsSet(SESSION_KEY, '');
      }
    } catch (error) {
      return error.message || 'Não foi possível excluir a conta.';
    }

    if (email) {
      try {
        localStorage.removeItem(cacheKey(email));
        localStorage.removeItem(notifSeenKey(session?.id || email));
      } catch {
        /* cache é melhor esforço */
      }
    }

    lastUserId.current = null;
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    setData(null);
    setSession(null);
    setUi((u) => ({
      ...u,
      chat: null,
      chatOpen: false,
      room: null,
      myLive: null,
      modal: null,
      typing: {},
    }));
    if (location.hash) history.replaceState(null, '', location.pathname);
    toast('Sua conta foi excluída.');
    return null;
  }

  const go = (route, skipLiveGuard = false) => {
    const live = liveChannelOfMine();
    if (!skipLiveGuard && live && route !== 'conexoes') {
      requestConfirm({
        title: 'Encerrar a live?',
        text: 'Para sair do palco e navegar pelo FluXo, a transmissão precisa ser encerrada.',
        confirmLabel: 'Encerrar e sair',
        tone: 'hot',
        action: () => {
          finishLive({ silent: true, id: live.id });
          go(route, true);
        },
      });
      return;
    }
    const target = '#' + route;
    if (location.hash !== target) location.hash = target;
    setUi((u) => ({ ...u, route, room: route === 'conexoes' ? null : u.room }));
    window.scrollTo(0, 0);
  };

  async function attachMedia(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    const current = uiRef.current.draft.media || [];
    const room = MAX_POST_MEDIA - current.length;
    if (room <= 0) {
      toast(`Você pode anexar até ${MAX_POST_MEDIA} itens por publicação.`);
      return;
    }
    const selected = list.slice(0, room);
    let kept = 0;
    let cloudFailed = 0;
    try {
      for (const file of selected) {
        const kind = mediaKind(file);
        if (kind === 'video') {
          const seconds = await fileVideoDuration(file);
          if (seconds != null && seconds > MAX_VIDEO_SECONDS + 1) {
            toast(
              `“${file.name}” tem ${fmtDur(seconds)}. Os vídeos devem ter no máximo 3 minutos.`
            );
            continue;
          }
        }
        if (isSupabaseEnabled && file.size > MAX_MEDIA_BYTES) {
          toast(
            `“${file.name}” tem ${mb(file.size)}. O limite de envio é 50 MB${
              kind === 'video' ? ' — corte o vídeo ou reduza a qualidade' : ''
            }.`
          );
          continue;
        }
        let src = kind === 'photo' ? await fileToDataURL(file, 1080) : URL.createObjectURL(file);
        if (isSupabaseEnabled && sessionRef.current?.id) {
          const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
          if (uploaded) src = uploaded;
          else cloudFailed += 1;
        }
        setUi((u) => {
          const nextMedia = [...(u.draft.media || []), { kind, src, name: file.name }];
          return {
            ...u,
            draft: {
              ...u.draft,
              media: nextMedia,
              ...(u.draft.format === 'imageVote'
                ? { options: syncImageVoteOptions(nextMedia, u.draft.options) }
                : {}),
            },
          };
        });
        kept += 1;
      }
      if (kept && cloudFailed) {
        toast(
          'Não foi possível enviar ' +
            (cloudFailed > 1 ? `${cloudFailed} mídias` : 'uma mídia') +
            ' para a nuvem. Ela pode não aparecer depois de recarregar.'
        );
      }
      if (list.length > room) {
        toast(`Adicionamos ${kept} de ${list.length}. O limite é ${MAX_POST_MEDIA}.`);
      }
    } catch {
      toast('Não foi possível processar um dos arquivos.');
    }
  }

  function removeDraftMedia(index) {
    setUi((u) => {
      const nextMedia = (u.draft.media || []).filter((_, i) => i !== index);
      return {
        ...u,
        draft: {
          ...u.draft,
          media: nextMedia,
          ...(u.draft.format === 'imageVote'
            ? { options: syncImageVoteOptions(nextMedia, u.draft.options) }
            : {}),
        },
      };
    });
  }

  function setDraftFormat(format) {
    setUi((u) => {
      const media = u.draft.media || [];
      let options = optionsForFormat(format, media, u.draft.options);
      if (format === 'imageVote' && media.length < 2) {
        options = syncImageVoteOptions(media, u.draft.options);
      }
      return {
        ...u,
        draft: {
          ...u.draft,
          format,
          options,
          invited: format === 'challenge' ? u.draft.invited || [] : [],
        },
      };
    });
  }

  function setDraftOption(index, label) {
    setUi((u) => ({
      ...u,
      draft: {
        ...u.draft,
        options: (u.draft.options || []).map((option, i) =>
          i === index ? { ...option, label } : option
        ),
      },
    }));
  }

  function addDraftOption() {
    setUi((u) => {
      const options = u.draft.options || [];
      if (options.length >= 6) return u;
      return {
        ...u,
        draft: { ...u.draft, options: [...options, { id: uid(), label: '' }] },
      };
    });
  }

  function removeDraftOption(index) {
    setUi((u) => {
      const options = u.draft.options || [];
      if (options.length <= 2) return u;
      return {
        ...u,
        draft: {
          ...u.draft,
          options: options.filter((_, i) => i !== index),
        },
      };
    });
  }

  function toggleDraftReaction(emoji) {
    setUi((u) => {
      const current = u.draft.reactions || DEFAULT_REACTIONS;
      const has = current.includes(emoji);
      const next = has ? current.filter((item) => item !== emoji) : [...current, emoji];
      if (!next.length) {
        toast('Mantenha ao menos uma reação disponível.');
        return u;
      }
      return {
        ...u,
        draft: { ...u.draft, reactions: next.slice(0, 8) },
      };
    });
  }

  function toggleDraftInvite(id) {
    setUi((u) => {
      const current = u.draft.invited || [];
      const has = current.includes(id);
      if (!has && current.length >= 20) {
        toast('Você pode convidar até 20 pessoas por desafio.');
        return u;
      }
      return {
        ...u,
        draft: {
          ...u.draft,
          invited: has ? current.filter((item) => item !== id) : [...current, id],
        },
      };
    });
  }

  // Aplica o resultado do editor de mídia ao item do rascunho: fotos vêm com
  // a edição "queimada" em um novo arquivo; vídeos (ou fotos que não puderam
  // ser queimadas) mantêm o objeto de edição para ser aplicado na exibição.
  async function applyMediaEdit(index, { file = null, edit = null } = {}) {
    const current = uiRef.current.draft.media || [];
    if (!current[index]) return;
    if (file) {
      try {
        let src = await fileToDataURL(file, 1080);
        if (isSupabaseEnabled && sessionRef.current?.id) {
          const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
          if (uploaded) src = uploaded;
        }
        setUi((u) => ({
          ...u,
          draft: {
            ...u.draft,
            media: (u.draft.media || []).map((item, i) =>
              i === index ? { ...item, src, edit: null } : item
            ),
          },
        }));
        toast('Edição aplicada à mídia.');
      } catch {
        toast('Não foi possível aplicar a edição à mídia.');
      }
      return;
    }
    setUi((u) => ({
      ...u,
      draft: {
        ...u.draft,
        media: (u.draft.media || []).map((item, i) =>
          i === index ? { ...item, edit: edit || null } : item
        ),
      },
    }));
  }

  // Adiciona novas mídias a uma publicação já existente (mesmas regras do
  // rascunho: limite de itens, 3 minutos de vídeo e 50 MB por arquivo).
  async function attachPostMedia(postId, files) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post) return;
    const current = mediaOf(post);
    const room = MAX_POST_MEDIA - current.length;
    if (room <= 0) {
      toast(`Você pode anexar até ${MAX_POST_MEDIA} itens por publicação.`);
      return;
    }
    const list = Array.from(files || []).filter(Boolean).slice(0, room);
    let added = [];
    let cloudFailed = 0;
    try {
      for (const file of list) {
        const kind = mediaKind(file);
        if (kind === 'video') {
          const seconds = await fileVideoDuration(file);
          if (seconds != null && seconds > MAX_VIDEO_SECONDS + 1) {
            toast(
              `“${file.name}” tem ${fmtDur(seconds)}. Os vídeos devem ter no máximo 3 minutos.`
            );
            continue;
          }
        }
        if (isSupabaseEnabled && file.size > MAX_MEDIA_BYTES) {
          toast(
            `“${file.name}” tem ${mb(file.size)}. O limite de envio é 50 MB${
              kind === 'video' ? ' — corte o vídeo ou reduza a qualidade' : ''
            }.`
          );
          continue;
        }
        let src =
          kind === 'photo'
            ? await fileToDataURL(file, 1080)
            : URL.createObjectURL(file);
        if (isSupabaseEnabled && sessionRef.current?.id) {
          const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
          if (uploaded) src = uploaded;
          else cloudFailed += 1;
        }
        added.push({ kind, src, name: file.name });
      }
      if (added.length) {
        updatePost(
          postId,
          { media: [...current, ...added].slice(0, MAX_POST_MEDIA) },
          { keepModal: true, message: 'Mídia adicionada' }
        );
      }
      if (cloudFailed) {
        toast(
          'Não foi possível enviar ' +
            (cloudFailed > 1 ? `${cloudFailed} mídias` : 'uma mídia') +
            ' para a nuvem. Ela pode não aparecer depois de recarregar.'
        );
      }
      if (list.length < Array.from(files || []).length) {
        toast(`Adicionamos ${added.length}. O limite é ${MAX_POST_MEDIA}.`);
      }
    } catch {
      toast('Não foi possível processar um dos arquivos.');
    }
  }

  // Remove uma mídia da publicação. Sem mídia e sem texto, a publicação não
  // pode ficar vazia.
  function removePostMedia(postId, index) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post) return;
    const media = mediaOf(post).filter((_, i) => i !== index);
    if (!media.length && !String(post.text || '').trim()) {
      toast('A publicação precisa ter texto ou ao menos uma mídia.');
      return;
    }
    updatePost(postId, { media }, { keepModal: true, message: 'Mídia removida' });
  }

  // Aplica o editor de mídia (ajustes, texto, desenho, giro) a um item de uma
  // publicação existente. Fotos vêm com a edição queimada; vídeos guardam o
  // objeto para ser aplicado na exibição.
  async function applyPostMediaEdit(postId, index, { file = null, edit = null } = {}) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const media = mediaOf(post);
    const item = media[index];
    if (!post || !item) return;
    let nextItem = { ...item, edit: edit || null };
    if (file) {
      try {
        let src = await fileToDataURL(file, 1080);
        if (isSupabaseEnabled && sessionRef.current?.id) {
          const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
          if (uploaded) src = uploaded;
        }
        nextItem = { ...nextItem, src, edit: null };
      } catch {
        toast('Não foi possível aplicar a edição à mídia.');
        return;
      }
    }
    updatePost(
      postId,
      {
        media: media.map((entry, i) => (i === index ? nextItem : entry)),
      },
      { keepModal: true, message: 'Mídia atualizada' }
    );
  }

  function publish(text) {
    const draft = uiRef.current.draft;
    const trimmed = text.trim();
    const media = draft.media || [];
    const format = draft.format || 'classic';
    const communityId = draft.communityId || null;
    const interactive = buildInteractive(format, draft, media);

    if (format === 'poll' && (interactive?.options?.length || 0) < 2) {
      toast('Escreva pelo menos duas alternativas para a enquete.');
      return;
    }
    if (format === 'imageVote' && media.length < 2) {
      toast('A votação com imagens precisa de pelo menos duas mídias.');
      return;
    }
    if (!trimmed && !media.length && format !== 'poll') {
      toast('Escreva algo ou adicione uma foto ou vídeo.');
      return;
    }
    const post = {
      id: uid(),
      by: 'me',
      ts: Date.now(),
      text: trimmed,
      kind: media[0]?.kind || 'text',
      media,
      src: media[0]?.src,
      seed: media[0]?.seed || undefined,
      likes: 0,
      liked: false,
      myReaction: null,
      reactionCounts: {},
      saved: false,
      commentsDisabled: false,
      comments: [],
      interactive: interactive || null,
      interactions: [],
      communityId,
    };
    setData((cur) => ({ ...cur, posts: [post, ...cur.posts] }));
    setUi((u) => ({
      ...u,
      draft: {
        text: '',
        media: [],
        format: 'classic',
        options: [],
        reactions: DEFAULT_REACTIONS,
        invited: [],
        communityId: null,
      },
    }));
    if (sessionRef.current?.id) remote.savePost(post, sessionRef.current.id);
    toast('Publicado');
  }

  function saveInteraction(postId, kind, fields = {}) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post) return null;
    const uidv = sessionRef.current?.id || null;
    const id = uidv ? `${postId}:${uidv}:${kind}` : `local:${postId}:${kind}`;
    const entry = {
      id,
      by: 'me',
      kind,
      optionId: fields.optionId || null,
      text: fields.text || '',
      ts: Date.now(),
    };
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) => {
        if (p.id !== postId) return p;
        const kept = (p.interactions || []).filter(
          (row) => row.id !== id && !(row.by === 'me' && row.kind === kind)
        );
        const interactions = [...kept, entry].sort((a, b) => a.ts - b.ts);
        return {
          ...p,
          interactions,
          views: interactions.filter((row) => row.kind === 'view').length,
          viewed: kind === 'view' ? true : p.viewed,
        };
      }),
    }));
    if (uidv) {
      remote.saveInteraction({
        id,
        postId,
        userId: uidv,
        kind,
        optionId: entry.optionId,
        text: entry.text,
      });
    }
    return entry;
  }

  // Visualização de foto/vídeo: registra uma vez por pessoa e por publicação.
  function viewPost(postId) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post) return;
    // O autor não conta a própria visualização.
    if (post.by === 'me') return;
    if (viewedRef.current.has(postId)) return;
    if ((post.interactions || []).some((row) => row.kind === 'view' && row.by === 'me')) {
      viewedRef.current.add(postId);
      return;
    }
    viewedRef.current.add(postId);
    saveInteraction(postId, 'view');
  }

  function votePost(postId, optionId) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const interactive = normalizeInteractive(post?.interactive);
    if (!interactive || !interactive.options.some((option) => option.id === optionId)) {
      toast('Essa alternativa não está mais disponível.');
      return;
    }
    saveInteraction(postId, 'vote', { optionId });
    toast('Voto registrado');
  }

  function answerPost(postId, text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      toast('Escreva a sua resposta.');
      return;
    }
    saveInteraction(postId, 'answer', { text: trimmed.slice(0, 280) });
    toast('Resposta enviada');
  }

  function joinChallenge(postId) {
    saveInteraction(postId, 'join');
    toast('Você entrou no desafio');
  }

  function inviteToChallenge(postId, ids) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (!post || post.interactive?.format !== 'challenge') return;
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return;
    const uidv = sessionRef.current?.id;
    const current = (post.interactive.invited || []).map((id) =>
      id === 'me' && uidv ? uidv : id
    );
    const next = [...new Set([...current, ...list])].slice(0, 20);
    if (next.length === current.length) return;
    updatePost(
      postId,
      { interactive: { ...post.interactive, invited: next } },
      { keepModal: true, message: 'Convite enviado' }
    );
  }

  function reactPost(id, emoji = '❤️') {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const previous = post.myReaction;
    const next = previous === emoji ? null : emoji;
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) => {
        if (p.id !== id) return p;
        const counts = { ...(p.reactionCounts || {}) };
        if (previous) counts[previous] = Math.max(0, (counts[previous] || 0) - 1);
        if (next) counts[next] = (counts[next] || 0) + 1;
        return {
          ...p,
          myReaction: next,
          liked: !!next,
          likes: Math.max(0, (p.likes || 0) + (next ? 1 : 0) - (previous ? 1 : 0)),
          reactionCounts: counts,
        };
      }),
    }));
    if (sessionRef.current?.id) remote.setLike(id, sessionRef.current.id, next);
  }

  function toggleLike(id) {
    reactPost(id, '❤️');
  }

  function toggleComments(id) {
    setUi((u) => ({ ...u, open: { ...u.open, [id]: !u.open[id] } }));
  }

  function openPost(id) {
    setUi((u) => ({
      ...u,
      open: { ...u.open, [id]: false },
      modal: { type: 'post', id },
    }));
  }

  function openUser(id) {
    if (!id) return;
    if (id === 'me') {
      setUi((u) => ({ ...u, modal: null, route: 'perfil' }));
      if (location.hash !== '#perfil') location.hash = '#perfil';
      return;
    }
    setUi((u) => ({ ...u, modal: { type: 'user', id } }));
  }

  function reportPost(postId) {
    const post = dataRef.current?.posts.find((item) => item.id === postId);
    if (!post) return;
    requestConfirm({
      title: 'Denunciar publicação?',
      text: 'A denúncia é diferente de ocultar ou deixar de seguir. Ela será registrada para análise.',
      confirmLabel: 'Denunciar',
      tone: 'hot',
      action: () => {
        if (sessionRef.current?.id) {
          remote.reportPost(postId, sessionRef.current.id, 'conteudo');
        }
        feedFeedback(postId, 'notInterested');
        toast('Denúncia registrada. O conteúdo foi ocultado do seu feed.');
      },
    });
  }

  function addComment(postId, text) {    const trimmed = text.trim();
    if (!trimmed) return;
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    if (post?.commentsDisabled) {
      toast('Os comentários desta publicação estão desativados.');
      return;
    }
    const comment = { id: uid(), by: 'me', text: trimmed, ts: Date.now() };
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) =>
        p.id === postId ? { ...p, comments: [...p.comments, comment] } : p
      ),
    }));
    if (sessionRef.current?.id) remote.addComment(comment, postId, sessionRef.current.id);
  }

  function deleteComment(postId, commentId) {
    if (!postId || !commentId) return;
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const comment = post?.comments?.find((c) => c.id === commentId);
    if (!comment || comment.by !== 'me') return;
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) =>
        p.id === postId
          ? { ...p, comments: (p.comments || []).filter((c) => c.id !== commentId) }
          : p
      ),
    }));
    remote.deleteComment(commentId);
    toast('Comentário apagado');
  }

  function openEditPost(id) {
    setUi((u) => ({ ...u, modal: { type: 'editpost', id } }));
  }

  function updatePost(id, fields, options = {}) {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const updated = {
      ...post,
      ...fields,
      text: (fields.text ?? post.text).trim(),
      commentsDisabled:
        fields.commentsDisabled === undefined
          ? !!post.commentsDisabled
          : !!fields.commentsDisabled,
    };
    // Mantém os campos derivados coerentes quando a mídia muda.
    if (Array.isArray(fields.media)) {
      const first = fields.media[0];
      updated.src = first?.src;
      updated.kind = first?.kind || 'text';
      if (first?.seed) updated.seed = first.seed;
    }
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) => (p.id === id ? updated : p)),
    }));
    if (!options.keepModal) setUi((u) => ({ ...u, modal: null }));
    if (sessionRef.current?.id) remote.updatePost(updated);
    toast(options.message || 'Publicação atualizada');
  }

  function toggleCommentsDisabled(id) {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const disabled = !post.commentsDisabled;
    updatePost(
      id,
      { commentsDisabled: disabled },
      {
        keepModal: true,
        message: disabled ? 'Comentários desativados' : 'Comentários ativados',
      }
    );
  }

  function deletePost(id) {
    requestConfirm({
      title: 'Excluir publicação?',
      text: 'Essa ação não pode ser desfeita. Os comentários e reações também sairão do seu perfil.',
      confirmLabel: 'Excluir',
      tone: 'hot',
      action: () => removePost(id),
    });
  }

  function removePost(id) {
    setData((cur) => ({ ...cur, posts: cur.posts.filter((p) => p.id !== id) }));
    setUi((u) => ({
      ...u,
      open: { ...u.open, [id]: false },
      modal: u.modal?.type === 'post' && u.modal.id === id ? null : u.modal,
    }));
    if (sessionRef.current?.id) remote.deletePost(id);
    toast('Publicação excluída');
  }

  function toggleSave(id) {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const saved = !post.saved;
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) => (p.id === id ? { ...p, saved } : p)),
    }));
    if (sessionRef.current?.id) remote.setSave(id, sessionRef.current.id, saved);
    toast(saved ? 'Publicação salva' : 'Removida dos salvos');
  }

  function share() {
    const url = location.href.split('#')[0];
    try {
      navigator.clipboard.writeText(url).then(
        () => toast('Link copiado'),
        () => toast('Não foi possível copiar o link.')
      );
    } catch {
      toast('Não foi possível copiar o link.');
    }
  }

  async function sharePost(id) {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const url = location.href.split('#')[0] + '#feed';
    const text = post.text
      ? `${post.text}\n\nVeja no FluXo:`
      : 'Veja esta publicação no FluXo:';
    const result = await shareLink({ title: 'FluXo', text, url });
    if (result === 'copied') toast('Link da publicação copiado');
    else if (result === 'shared') toast('Publicação compartilhada');
    else if (result === 'error') toast('Não foi possível compartilhar.');
  }

  function openSharePost(id) {
    setUi((u) => ({ ...u, modal: { type: 'share', id } }));
  }

  function openNewChat() {
    setUi((u) => ({ ...u, modal: { type: 'newchat' } }));
  }

  function ensureChat(otherId) {
    const cur = dataRef.current;
    if (!cur || !otherId) return null;
    const existing = cur.chats.find((chat) => chat.with === otherId);
    if (existing) return existing;
    const chat = { id: otherId, with: otherId, unread: 0, msgs: [] };
    setData((state) => ({ ...state, chats: [chat, ...state.chats] }));
    return chat;
  }

  function startChat(otherId) {
    ensureChat(otherId);
    setUi((u) => ({
      ...u,
      modal: null,
      route: 'mensagens',
      chat: otherId,
      chatOpen: true,
    }));
    if (location.hash !== '#mensagens') location.hash = '#mensagens';
  }

  function sharePostTo(postId, userIds) {
    const post = dataRef.current?.posts.find((p) => p.id === postId);
    const targets = (userIds || []).filter(Boolean);
    if (!post || !targets.length) return;
    const attachment = {
      kind: 'post',
      postId: post.id,
      authorId: post.by,
      text: (post.text || '').slice(0, 180),
      media: post.media?.[0]?.src || post.src || null,
    };
    const ts = Date.now();
    targets.forEach((userId, index) => {
      ensureChat(userId);
      const message = {
        id: uid(),
        me: true,
        text: '',
        ts: ts + index,
        st: 'sent',
        attachment,
      };
      setData((cur) => ({
        ...cur,
        chats: cur.chats.map((chat) =>
          chat.with === userId ? { ...chat, msgs: [...chat.msgs, message] } : chat
        ),
      }));
      if (sessionRef.current?.id) {
        remote.sendDirectMessage(message, sessionRef.current.id, userId);
      }
    });
    if (uiRef.current.settings?.soundOnSend) playSentSound();
    setUi((u) => ({ ...u, modal: null }));
    toast(
      targets.length === 1
        ? 'Publicação compartilhada'
        : `Publicação compartilhada com ${targets.length} pessoas`
    );
  }

  async function shareChannel(id) {
    const channel = dataRef.current?.chans.find((c) => c.id === id);
    if (!channel) return;
    const url =
      location.href.split('#')[0] + '#conexoes/' + encodeURIComponent(id);
    const text = channel.live
      ? `Assista à live "${channel.title || channel.name}" no FluXo:`
      : `Participe do canal "${channel.name}" no FluXo:`;
    const result = await shareLink({ title: 'FluXo', text, url });
    if (result === 'copied') toast('Link do canal copiado');
    else if (result === 'shared') toast('Canal compartilhado');
    else if (result === 'error') toast('Não foi possível compartilhar.');
  }

  // -------------------------------------------------------------------------
  // Arena do Caos (Conexões → Jogos Online)
  // -------------------------------------------------------------------------

  function openArena(code = '') {
    const clean = String(code || '').trim().toUpperCase();
    const hash = clean
      ? `#conexoes/arena/${encodeURIComponent(clean)}`
      : '#conexoes/arena';
    setUi((u) => ({
      ...u,
      route: 'conexoes',
      room: null,
      arenaCode: clean,
    }));
    if (location.hash !== hash) location.hash = hash;
  }

  function openArenaCode(code) {
    openArena(code);
  }

  function closeArena() {
    setUi((u) => ({ ...u, arenaCode: null }));
    if (location.hash !== '#conexoes') location.hash = '#conexoes';
  }

  function inviteToArena(userId, code) {
    const clean = String(code || '').trim().toUpperCase();
    if (!userId || !clean) return false;
    const chat = ensureChat(userId);
    if (!chat) return false;
    const meName = dataRef.current?.me?.name || 'Um amigo';
    sendMessageTo(
      chat.id,
      `${meName} te chamou para a Arena do Caos!`,
      {
        kind: 'arena',
        code: clean,
        title: 'Arena do Caos',
        host: meName,
      }
    );
    toast('Convite enviado no chat');
    return true;
  }

  function shareArenaResult(result = {}) {
    const placement = Number(result.placement) || 0;
    const total = Number(result.total) || 0;
    const kills = Number(result.kills) || 0;
    const damage = Number(result.damage) || 0;
    const winner = result.winnerName || '';
    const title =
      placement === 1
        ? '🏆 Venci a Arena do Caos!'
        : placement > 0
          ? `🎮 Fiquei em ${placement}º na Arena do Caos`
          : '🎮 Joguei a Arena do Caos';
    const lines = [title];
    if (kills || damage) {
      lines.push(`${kills} eliminação${kills === 1 ? '' : 'ões'} • ${damage} de dano`);
    }
    if (total) lines.push(`${total} jogadores na partida`);
    if (placement !== 1 && winner) lines.push(`Campeão: ${winner}`);
    if (result.code) lines.push(`Sala ${result.code}`);
    const post = {
      id: uid(),
      by: 'me',
      ts: Date.now(),
      text: lines.join('\n'),
      kind: 'text',
      media: [],
      src: undefined,
      seed: undefined,
      likes: 0,
      liked: false,
      myReaction: null,
      reactionCounts: {},
      saved: false,
      commentsDisabled: false,
      comments: [],
      interactive: null,
      interactions: [],
      communityId: null,
    };
    setData((cur) => ({ ...cur, posts: [post, ...cur.posts] }));
    if (sessionRef.current?.id) remote.savePost(post, sessionRef.current.id);
    toast('Resultado compartilhado no Feed');
    return post.id;
  }

  function follow(id) {
    const cur = dataRef.current;
    if (!cur) return;
    const following = cur.follows.includes(id);
    const users = { ...cur.users };
    if (users[id]) {
      users[id] = {
        ...users[id],
        followers: Math.max(0, users[id].followers + (following ? -1 : 1)),
      };
    }
    setData({
      ...cur,
      follows: following ? cur.follows.filter((x) => x !== id) : [...cur.follows, id],
      users,
    });
    if (sessionRef.current?.id) remote.setFollow(sessionRef.current.id, id, !following);
    toast(following ? 'Você deixou de seguir ' + (users[id]?.name || id) : 'Seguindo ' + (users[id]?.name || id));
  }

  function saveProfile(fields) {
    const newMe = { ...dataRef.current.me, ...fields };
    setData((cur) => ({ ...cur, me: newMe }));
    if (sessionRef.current?.id) remote.saveProfile(newMe, sessionRef.current.id);
    setUi((u) => ({ ...u, modal: null }));
    toast('Perfil atualizado');
  }

  function pickCover(value) {
    const newMe = { ...dataRef.current.me, cover: { k: 'art', v: value } };
    setData((cur) => ({ ...cur, me: newMe }));
    if (sessionRef.current?.id) remote.saveProfile(newMe, sessionRef.current.id);
  }

  async function uploadAvatar(file) {
    if (!file) return;
    try {
      let src = await fileToDataURL(file, 512);
      if (isSupabaseEnabled && sessionRef.current?.id) {
        const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
        if (uploaded) src = uploaded;
      }
      const newMe = { ...dataRef.current.me, avatar: src };
      setData((cur) => ({ ...cur, me: newMe }));
      if (sessionRef.current?.id) remote.saveProfile(newMe, sessionRef.current.id);
      toast('Foto de perfil atualizada');
    } catch {
      toast('Não foi possível usar essa imagem.');
    }
  }

  async function uploadCover(file) {
    if (!file) return;
    try {
      let src = await fileToDataURL(file, 1400);
      if (isSupabaseEnabled && sessionRef.current?.id) {
        const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
        if (uploaded) src = uploaded;
      }
      const newMe = { ...dataRef.current.me, cover: { k: 'img', v: src } };
      setData((cur) => ({ ...cur, me: newMe }));
      if (sessionRef.current?.id) remote.saveProfile(newMe, sessionRef.current.id);
      toast('Capa atualizada');
    } catch {
      toast('Não foi possível usar essa imagem.');
    }
  }

  function addScrap(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const scrap = { id: uid(), by: 'me', text: trimmed, ts: Date.now() };
    setData((cur) => ({
      ...cur,
      me: { ...cur.me, scraps: [scrap, ...cur.me.scraps] },
    }));
    if (sessionRef.current?.id) remote.addScrap(scrap, sessionRef.current.id, sessionRef.current.id);
  }

  function openComm(id) {
    setUi((u) => ({ ...u, modal: { type: 'comm', id } }));
  }

  function closeModal() {
    setUi((u) => ({ ...u, modal: null }));
  }

  function toggleComm(id) {
    const community = dataRef.current?.comms.find((c) => c.id === id);
    if (!community) return;
    if (community.pending) {
      cancelJoinComm(id);
      return;
    }
    if (community.joined) {
      requestConfirm({
        title: 'Sair da comunidade?',
        text: `Você deixará de acompanhar ${community.name}. Pode entrar de novo quando quiser.`,
        confirmLabel: 'Sair',
        tone: 'hot',
        action: () => applyToggleComm(id),
      });
      return;
    }
    if (community.private) {
      requestJoinComm(id);
      return;
    }
    applyToggleComm(id);
  }

  function requestJoinComm(id) {
    const community = dataRef.current?.comms.find((c) => c.id === id);
    if (!community) return;
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) => (c.id === id ? { ...c, pending: true } : c)),
    }));
    if (sessionRef.current?.id) {
      remote.requestCommunityJoin(id, sessionRef.current.id);
    }
    toast(`Solicitação enviada para ${community.name}`);
  }

  function cancelJoinComm(id) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) => (c.id === id ? { ...c, pending: false } : c)),
    }));
    if (sessionRef.current?.id) remote.cancelCommunityJoin(id, sessionRef.current.id);
    toast('Solicitação cancelada');
  }

  function approveJoin(commId, userId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? {
              ...c,
              requests: c.requests.filter((item) => item.userId !== userId),
              members: [...new Set([...(c.members || []), userId])],
              subs: c.subs + 1,
            }
          : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setJoinRequestStatus(commId, userId, 'accepted');
      remote.setCommunityMembership(commId, userId, true);
    }
    toast('Participante aprovado');
  }

  function rejectJoin(commId, userId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? { ...c, requests: c.requests.filter((item) => item.userId !== userId) }
          : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setJoinRequestStatus(commId, userId, 'rejected');
    }
    toast('Solicitação recusada');
  }

  function inviteToComm(commId, userId) {
    const community = dataRef.current?.comms.find((c) => c.id === commId);
    if (!community || !userId || userId === 'me') return;
    const invite = {
      id: uid(),
      communityId: commId,
      inviterId: 'me',
      inviteeId: userId,
      status: 'pending',
    };
    if (sessionRef.current?.id) {
      remote.saveCommunityInvite(invite, sessionRef.current.id);
    }
    toast(`Convite enviado para ${dataRef.current.users[userId]?.name || 'a pessoa'}`);
  }

  function respondCommunityInvite(commId, inviteId, accept) {
    const community = dataRef.current?.comms.find((c) => c.id === commId);
    if (!community) return;
    if (inviteId) remote.setCommunityInviteStatus(inviteId, accept ? 'accepted' : 'declined');
    if (!accept) {
      setData((cur) => ({
        ...cur,
        comms: cur.comms.map((c) =>
          c.id === commId ? { ...c, invited: null } : c
        ),
      }));
      toast('Convite recusado');
      return;
    }
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? {
              ...c,
              invited: null,
              joined: true,
              subs: c.subs + 1,
              members: [...new Set([...(c.members || []), 'me'])],
            }
          : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setCommunityMembership(commId, sessionRef.current.id, true);
    }
    toast(`Bem-vindo a ${community.name}`);
  }

  function linkCommChannel(commId, chanId) {
    if (!chanId) return;
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? { ...c, channelIds: [...new Set([...(c.channelIds || []), chanId])] }
          : c
      ),
    }));
    remote.saveCommunityChannel(commId, chanId);
    toast('Canal vinculado à comunidade');
  }

  function unlinkCommChannel(commId, chanId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId
          ? { ...c, channelIds: (c.channelIds || []).filter((id) => id !== chanId) }
          : c
      ),
    }));
    remote.deleteCommunityChannel(commId, chanId);
    toast('Canal desvinculado');
  }

  async function uploadCommunityArt(commId, kind, file) {
    if (!file) return;
    try {
      let src = await fileToDataURL(file, kind === 'icon' ? 320 : 1400);
      if (sessionRef.current?.id) {
        const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
        if (uploaded) src = uploaded;
      }
      const community = dataRef.current?.comms.find((c) => c.id === commId);
      if (!community) return;
      const updated = {
        ...community,
        iconUrl: kind === 'icon' ? src : community.iconUrl,
        coverUrl: kind === 'cover' ? src : community.coverUrl,
      };
      setData((cur) => ({
        ...cur,
        comms: cur.comms.map((c) => (c.id === commId ? updated : c)),
      }));
      remote.updateCommunity(updated);
      toast(kind === 'icon' ? 'Ícone atualizado' : 'Capa atualizada');
    } catch {
      toast('Não foi possível usar essa imagem.');
    }
  }

  function applyToggleComm(id) {
    const community = dataRef.current?.comms.find((c) => c.id === id);
    if (!community) return;
    const joined = !community.joined;
    const updated = {
      ...community,
      joined,
      pending: false,
      subs: Math.max(0, community.subs + (joined ? 1 : -1)),
      members: joined
        ? [...new Set([...(community.members || []), 'me'])]
        : (community.members || []).filter((member) => member !== 'me'),
    };
    if (!joined && community.mods.includes('me')) {
      updated.mods = community.mods.filter((m) => m !== 'me');
    }
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) => (c.id === id ? updated : c)),
    }));
    if (sessionRef.current?.id) {
      remote.setCommunityMembership(id, sessionRef.current.id, joined);
    }
    toast(joined ? 'Você entrou em ' + community.name : 'Você saiu de ' + community.name);
  }

  function createComm({ name, cat, desc, rules, seed, private: isPrivate, iconUrl, coverUrl }) {
    const community = {
      id: uid(),
      name,
      cat,
      desc: desc || 'Um novo fluxo para conversar.',
      subs: 1,
      owner: 'me',
      mods: ['me'],
      joined: true,
      pending: false,
      invited: null,
      private: !!isPrivate,
      iconUrl: iconUrl || null,
      coverUrl: coverUrl || null,
      seed: (seed || COVERS[0]) + '-c',
      rules: rules?.length ? rules : ['Respeite todo mundo no fluxo.'],
      members: ['me'],
      requests: [],
      channelIds: [],
      topics: [],
    };
    setData((cur) => ({ ...cur, comms: [community, ...cur.comms] }));
    setUi((u) => ({ ...u, profTab: 'comms', modal: { type: 'comm', id: community.id } }));
    if (sessionRef.current?.id) remote.saveCommunity(community, sessionRef.current.id);
    toast('Comunidade criada');
  }

  function openNewCommFromTopic(term) {
    setUi((u) => ({
      ...u,
      modal: { type: 'newcomm' },
      commDraft: { name: term ? `Comunidade de ${term}` : '' },
    }));
  }

  function addModerator(commId, userId) {
    const community = dataRef.current?.comms.find((c) => c.id === commId);
    if (!community || community.mods.includes(userId)) return;
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId ? { ...c, mods: [...c.mods, userId] } : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setCommunityMembership(commId, userId, true, 'moderator');
    }
    toast((dataRef.current.users[userId]?.name || userId) + ' agora é moderador');
  }

  function removeModerator(commId, userId) {
    const person = dataRef.current?.users[userId];
    requestConfirm({
      title: 'Remover moderador?',
      text: `${person?.name || 'Essa pessoa'} continuará na comunidade, mas perderá os poderes de moderação.`,
      confirmLabel: 'Remover',
      tone: 'hot',
      action: () => applyRemoveModerator(commId, userId),
    });
  }

  function applyRemoveModerator(commId, userId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId ? { ...c, mods: c.mods.filter((m) => m !== userId) } : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setCommunityMembership(commId, userId, true, 'member');
    }
    toast('Moderador removido');
  }

  function addTopic(commId, title) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const topic = { id: uid(), by: 'me', title: trimmed, replies: 0, ts: Date.now() };
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId ? { ...c, topics: [topic, ...c.topics] } : c
      ),
    }));
    if (sessionRef.current?.id) remote.saveTopic(topic, commId, sessionRef.current.id);
  }

  function deleteTopic(commId, topicId) {
    requestConfirm({
      title: 'Remover tópico?',
      text: 'O tópico será apagado para todas as pessoas da comunidade.',
      confirmLabel: 'Remover',
      tone: 'hot',
      action: () => applyDeleteTopic(commId, topicId),
    });
  }

  function applyDeleteTopic(commId, topicId) {
    setData((cur) => ({
      ...cur,
      comms: cur.comms.map((c) =>
        c.id === commId ? { ...c, topics: c.topics.filter((t) => t.id !== topicId) } : c
      ),
    }));
    if (sessionRef.current?.id) remote.deleteTopic(topicId);
    toast('Tópico removido');
  }

  function openChat(id) {
    const chat = dataRef.current?.chats.find((c) => c.id === id);
    setData((cur) => ({
      ...cur,
      chats: cur.chats.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
    }));
    setUi((u) => ({ ...u, chat: id, chatOpen: true }));
    if (sessionRef.current?.id && chat?.with) {
      remote.markDirectMessagesRead(sessionRef.current.id, chat.with);
    }
  }

  function sendMessageTo(chatId, text, attachment) {
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    const trimmed = (text || '').trim();
    if (!chat || (!trimmed && !attachment)) return null;
    const message = {
      id: uid(),
      me: true,
      text: trimmed,
      ts: Date.now(),
      st: 'sent',
      ...(attachment ? { attachment } : {}),
    };
    setData((cur) => ({
      ...cur,
      chats: cur.chats.map((c) =>
        c.id === chatId ? { ...c, msgs: [...c.msgs, message] } : c
      ),
    }));
    if (sessionRef.current?.id && chat.with) {
      remote.sendDirectMessage(message, sessionRef.current.id, chat.with);
    }
    if (uiRef.current.settings?.soundOnSend) playSentSound();
    return message;
  }

  function sendMessage(text, attachment) {
    return sendMessageTo(uiRef.current.chat, text, attachment);
  }

  function sendTyping(to) {
    if (!to) return;
    const now = Date.now();
    if (now - (lastTypingRef.current[to] || 0) < 2200) return;
    lastTypingRef.current[to] = now;
    presenceRef.current?.sendTyping(to);
  }

  async function sendChatFile(file, kind) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast('Arquivo muito grande (máximo de 12 MB).');
      return;
    }
    try {
      const src =
        kind === 'photo'
          ? await fileToDataURL(file, 1600)
          : await fileToRawDataURL(file);
      sendMessage('', {
        kind,
        src,
        name: file.name || 'arquivo',
        mime: file.type || '',
      });
    } catch {
      toast('Não foi possível ler esse arquivo.');
    }
  }

  async function sendChatBlob(blob, kind, name) {
    if (!blob || !blob.size) return;
    if (blob.size > 12 * 1024 * 1024) {
      toast('Arquivo muito grande (máximo de 12 MB).');
      return;
    }
    try {
      const src = await fileToRawDataURL(blob);
      sendMessage('', {
        kind,
        src,
        name: name || 'arquivo',
        mime: blob.type || '',
      });
    } catch {
      toast('Não foi possível processar a gravação.');
    }
  }

  function likeMessage(chatId, index) {
    setData((cur) => ({
      ...cur,
      chats: cur.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              msgs: c.msgs.map((m, i) => (i === index ? { ...m, liked: !m.liked } : m)),
            }
          : c
      ),
    }));
  }

  function deleteMessage(chatId, index) {
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    const message = chat?.msgs?.[index];
    if (!chat || !message) return;
    setData((cur) => ({
      ...cur,
      chats: cur.chats.map((c) =>
        c.id === chatId
          ? { ...c, msgs: c.msgs.filter((_item, i) => i !== index) }
          : c
      ),
    }));
    if (sessionRef.current?.id && message.id) {
      remote.deleteDirectMessage(message.id);
    }
    toast('Mensagem apagada');
  }

  function clearChat(chatId) {
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    if (!chat) return;
    requestConfirm({
      title: 'Limpar histórico?',
      text: 'As mensagens desta conversa serão apagadas para as duas pessoas.',
      confirmLabel: 'Limpar',
      tone: 'hot',
      action: () => {
        setData((cur) => ({
          ...cur,
          chats: cur.chats.map((c) => (c.id === chatId ? { ...c, msgs: [] } : c)),
        }));
        if (sessionRef.current?.id) {
          remote.deleteDirectMessagesWith(sessionRef.current.id, chat.with);
        }
        toast('Histórico limpo');
      },
    });
  }

  function deleteChat(chatId) {
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    if (!chat) return;
    requestConfirm({
      title: 'Apagar conversa?',
      text: 'A conversa sai da sua lista e as mensagens são apagadas para as duas pessoas.',
      confirmLabel: 'Apagar',
      tone: 'hot',
      action: () => {
        setData((cur) => ({
          ...cur,
          chats: cur.chats.filter((c) => c.id !== chatId),
        }));
        setUi((u) =>
          u.chat === chatId ? { ...u, chat: null, chatOpen: false } : u
        );
        if (sessionRef.current?.id) {
          remote.deleteDirectMessagesWith(sessionRef.current.id, chat.with);
        }
        toast('Conversa apagada');
      },
    });
  }

  function setChatWallpaper(withId, seed) {
    if (!withId) return;
    const walls = { ...(uiRef.current.settings?.chatWalls || {}) };
    if (seed) walls[withId] = seed;
    else delete walls[withId];
    setSetting('chatWalls', walls);
    toast(seed ? 'Papel de parede atualizado' : 'Papel de parede padrão restaurado');
  }

  function openRoom(id) {
    const live = liveChannelOfMine();
    if (live && live.id !== id) {
      requestConfirm({
        title: 'Encerrar a live?',
        text: 'Sua transmissão será encerrada para você entrar em outro canal.',
        confirmLabel: 'Encerrar e abrir',
        tone: 'hot',
        action: () => {
          finishLive({ silent: true, id: live.id });
          applyOpenRoom(id);
        },
      });
      return;
    }
    applyOpenRoom(id);
  }

  function applyOpenRoom(id) {
    setUi((u) => ({ ...u, room: id, route: 'conexoes' }));
    const target = '#conexoes/' + encodeURIComponent(id);
    if (location.hash !== target) location.hash = target;
  }

  function backRoom() {
    const live = liveChannelOfMine();
    if (live) {
      requestConfirm({
        title: 'Sair e encerrar a live?',
        text: 'Ao voltar para a lista de canais, sua transmissão será finalizada.',
        confirmLabel: 'Sair e encerrar',
        tone: 'hot',
        action: () => {
          finishLive({ silent: true, id: live.id });
          applyBackRoom();
        },
      });
      return;
    }
    applyBackRoom();
  }

  function applyBackRoom() {
    setUi((u) => ({ ...u, room: null }));
    if (location.hash !== '#conexoes') location.hash = '#conexoes';
  }

  function joinRoom() {
    const roomId = uiRef.current.room;
    const channel = dataRef.current?.chans.find((c) => c.id === roomId);
    if (!channel) return;
    if (channel.joined) {
      requestConfirm({
        title: 'Sair do canal?',
        text: `Você deixará de acompanhar ${channel.name}.`,
        confirmLabel: 'Sair',
        tone: 'hot',
        action: () => applyJoinRoom(),
      });
      return;
    }
    applyJoinRoom();
  }

  function applyJoinRoom() {
    const roomId = uiRef.current.room;
    const channel = dataRef.current?.chans.find((c) => c.id === roomId);
    if (!channel) return;
    const joined = !channel.joined;
    setData((cur) => ({
      ...cur,
      chans: cur.chans.map((c) =>
        c.id === roomId
          ? { ...c, joined, followers: Math.max(0, c.followers + (joined ? 1 : -1)) }
          : c
      ),
    }));
    if (sessionRef.current?.id) {
      remote.setChannelMembership(roomId, sessionRef.current.id, joined);
    }
    toast(joined ? 'Você entrou no canal' : 'Você saiu do canal');
  }

  function createChannel({ name, desc, kind }) {
    const channel = {
      id: uid(),
      owner: 'me',
      name,
      desc: desc || 'Canal novo.',
      kind,
      followers: 1,
      live: false,
      title: '',
      viewers: 0,
      joined: true,
      msgs: [],
      seed: name + '-palco',
    };
    setData((cur) => ({ ...cur, chans: [channel, ...cur.chans] }));
    setUi((u) => ({ ...u, modal: null, room: channel.id, route: 'conexoes' }));
    const target = '#conexoes/' + encodeURIComponent(channel.id);
    if (location.hash !== target) location.hash = target;
    if (sessionRef.current?.id) {
      remote.saveChannel(channel, sessionRef.current.id);
      remote.setChannelMembership(channel.id, sessionRef.current.id, true);
    }
    toast('Canal criado');
  }

  function deleteChannel(id) {
    const channel = dataRef.current?.chans.find((c) => c.id === id);
    if (!channel || channel.owner !== 'me') return;
    requestConfirm({
      title: 'Excluir canal?',
      text: `O canal "${channel.name}" e todas as mensagens serão removidos para todos.`,
      confirmLabel: 'Excluir canal',
      tone: 'hot',
      action: () => applyDeleteChannel(id),
    });
  }

  function applyDeleteChannel(id) {
    setData((cur) => ({
      ...cur,
      chans: cur.chans.filter((c) => c.id !== id),
    }));
    setUi((u) => ({
      ...u,
      room: u.room === id ? null : u.room,
      myLive: u.myLive?.id === id ? null : u.myLive,
      modal: null,
    }));
    if (location.hash.startsWith('#conexoes/')) location.hash = '#conexoes';
    if (sessionRef.current?.id) remote.deleteChannel(id);
    toast('Canal excluído');
  }

  async function startLive({ chanId, title }) {
    const cur = dataRef.current;
    if (!cur) return;
    if (uiRef.current.myLive) {
      toast('Você já está ao vivo. Encerre a transmissão atual primeiro.');
      return;
    }
    const realLive = isLiveKitEnabled && !!sessionRef.current?.id;
    const start = Date.now();
    let channel = chanId && chanId !== 'new' ? cur.chans.find((c) => c.id === chanId) : null;
    if (!channel) {
      channel = {
        id: uid(),
        owner: 'me',
        name: 'Palco de ' + cur.me.name.split(' ')[0],
        desc: 'Transmissões ao vivo.',
        kind: 'palco',
        followers: 1,
        live: true,
        livekit: realLive,
        title,
        viewers: 1,
        joined: true,
        msgs: [],
        seed: cur.me.name + '-palco',
      };
    } else {
      channel = { ...channel, live: true, livekit: realLive, title, viewers: 1 };
    }
    const welcome = {
      id: uid(),
      by: 'marina',
      text: 'Entrei! Boa live!',
      ts: Date.now(),
    };
    channel = { ...channel, msgs: [...channel.msgs, welcome] };
    if (sessionRef.current?.id) {
      await remote.saveChannel(channel, sessionRef.current.id);
      await remote.setChannelMembership(channel.id, sessionRef.current.id, true);
    }

    setData((state) => {
      const exists = state.chans.some((c) => c.id === channel.id);
      return {
        ...state,
        chans: exists
          ? state.chans.map((c) => (c.id === channel.id ? channel : c))
          : [channel, ...state.chans],
      };
    });
    setUi((u) => ({
      ...u,
      myLive: { id: channel.id, start, peak: 1 },
      modal: null,
      room: channel.id,
      route: 'conexoes',
    }));
    const target = '#conexoes/' + encodeURIComponent(channel.id);
    if (location.hash !== target) location.hash = target;
    toast(realLive ? 'Conectando câmera e microfone...' : 'Você está ao vivo');
  }

  function liveChannelOfMine() {
    const cur = dataRef.current;
    if (!cur) return null;
    const roomId = uiRef.current.room;
    const room = roomId ? cur.chans.find((c) => c.id === roomId) : null;
    if (room && room.owner === 'me' && room.live) return room;
    return cur.chans.find((c) => c.owner === 'me' && c.live) || null;
  }

  function endLive() {
    const channel = liveChannelOfMine();
    if (!channel) return;
    requestConfirm({
      title: 'Encerrar live?',
      text: 'A transmissão será finalizada para todas as pessoas que estão assistindo.',
      confirmLabel: 'Encerrar',
      tone: 'hot',
      action: () => finishLive({ id: channel.id }),
    });
  }

  function finishLive({ silent = false, id } = {}) {
    const live = uiRef.current.myLive;
    const channelId = id || live?.id || liveChannelOfMine()?.id;
    if (!channelId) return;
    const channel = dataRef.current?.chans.find((c) => c.id === channelId);
    const peak = live?.peak || channel?.viewers || 0;
    if (channel) {
      const updated = { ...channel, live: false, livekit: false };
      setData((cur) => ({
        ...cur,
        chans: cur.chans.map((c) => (c.id === channelId ? updated : c)),
      }));
      if (sessionRef.current?.id) remote.saveChannel(updated, sessionRef.current.id);
    }
    setUi((u) => ({
      ...u,
      myLive: u.myLive && u.myLive.id !== channelId ? u.myLive : null,
    }));
    if (!silent) toast('Live encerrada. Pico de ' + fmt(peak) + ' espectadores.');
  }

  function sendRoomMessage(text) {
    const roomId = uiRef.current.room;
    const channel = dataRef.current?.chans.find((c) => c.id === roomId);
    const trimmed = text.trim();
    if (!channel || !trimmed) return;
    const message = {
      id: uid(),
      by: 'me',
      text: trimmed,
      ts: Date.now(),
      ...(channel.kind === 'avisos'
        ? { reacts: { '❤️': 0, '🔥': 0, '👏': 0 }, mine: {} }
        : {}),
    };
    setData((cur) => ({
      ...cur,
      chans: cur.chans.map((c) =>
        c.id === roomId ? { ...c, msgs: [...c.msgs, message] } : c
      ),
    }));
    if (sessionRef.current?.id) remote.addChannelMessage(message, roomId, sessionRef.current.id);
  }

  function reactNotice(chanId, messageId, emoji) {
    const channel = dataRef.current?.chans.find((c) => c.id === chanId);
    const message = channel?.msgs.find((m) => m.id === messageId);
    if (!message) return;
    const on = !(message.mine?.[emoji]);
    const reacts = {
      ...(message.reacts || {}),
      [emoji]: Math.max(0, (message.reacts?.[emoji] || 0) + (on ? 1 : -1)),
    };
    const mine = { ...(message.mine || {}), [emoji]: on };
    setData((cur) => ({
      ...cur,
      chans: cur.chans.map((c) =>
        c.id === chanId
          ? {
              ...c,
              msgs: c.msgs.map((m) =>
                m.id === messageId ? { ...m, reacts, mine } : m
              ),
            }
          : c
      ),
    }));
    if (sessionRef.current?.id) remote.setReaction(messageId, sessionRef.current.id, emoji, on);
  }

  async function createStickerPack(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      toast('Dê um nome ao pacote de figurinhas.');
      return null;
    }
    const pack = {
      id: uid(),
      name: trimmed,
      icon: '🖼️',
      ts: Date.now(),
      custom: true,
      stickers: [],
    };
    setData((cur) => ({
      ...cur,
      customStickerPacks: [...(cur.customStickerPacks || []), pack],
    }));
    if (sessionRef.current?.id) remote.saveStickerPack(pack, sessionRef.current.id);
    toast('Pacote criado');
    return pack;
  }

  async function addStickerToPack(packId, file) {
    if (!file || !packId) return;
    try {
      let src = await fileToDataURL(file, 512);
      if (sessionRef.current?.id) {
        const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
        if (uploaded) src = uploaded;
      }
      const sticker = { id: uid(), src, ts: Date.now() };
      setData((cur) => ({
        ...cur,
        customStickerPacks: (cur.customStickerPacks || []).map((pack) =>
          pack.id === packId
            ? { ...pack, stickers: [...pack.stickers, sticker] }
            : pack
        ),
      }));
      if (sessionRef.current?.id) {
        remote.saveStickerRow(sticker, packId, sessionRef.current.id);
      }
      toast('Figurinha adicionada');
    } catch {
      toast('Não foi possível usar essa imagem.');
    }
  }

  function removeStickerFromPack(packId, stickerId) {
    setData((cur) => ({
      ...cur,
      customStickerPacks: (cur.customStickerPacks || []).map((pack) =>
        pack.id === packId
          ? { ...pack, stickers: pack.stickers.filter((item) => item.id !== stickerId) }
          : pack
      ),
    }));
    remote.deleteStickerRow(stickerId);
    toast('Figurinha removida');
  }

  function deleteStickerPack(packId) {
    const pack = (dataRef.current?.customStickerPacks || []).find(
      (item) => item.id === packId
    );
    requestConfirm({
      title: 'Excluir pacote?',
      text: `As figurinhas de ${pack?.name || 'este pacote'} serão removidas.`,
      confirmLabel: 'Excluir',
      tone: 'hot',
      action: () => {
        (pack?.stickers || []).forEach((item) => remote.deleteStickerRow(item.id));
        setData((cur) => ({
          ...cur,
          customStickerPacks: (cur.customStickerPacks || []).filter(
            (item) => item.id !== packId
          ),
        }));
        remote.deleteStickerPackRemote(packId);
        toast('Pacote excluído');
      },
    });
  }

  function setSetting(key, value) {
    setUi((u) => ({ ...u, settings: { ...u.settings, [key]: value } }));
  }

  function setFeedPref(patch) {
    const current = feedPrefs(uiRef.current.settings);
    const next = { ...current, ...(patch || {}) };
    setSetting('feed', next);
    if (sessionRef.current?.id) remote.saveFeedPreferences(sessionRef.current.id, next);
  }

  function resetFeedPrefs() {
    setSetting('feed', { ...DEFAULT_FEED_PREFS });
    if (sessionRef.current?.id) {
      remote.saveFeedPreferences(sessionRef.current.id, { ...DEFAULT_FEED_PREFS });
    }
    toast('Preferências do feed restauradas');
  }

  // Feedback das recomendações. Cada escolha tem efeito próprio e persistente.
  function feedFeedback(postId, kind, value) {
    const prefs = feedPrefs(uiRef.current.settings);
    const post = dataRef.current?.posts.find((item) => item.id === postId);
    if (!post) return;
    if (kind === 'notInterested') {
      setFeedPref({ hiddenPosts: [...new Set([...prefs.hiddenPosts, postId])] });
      toast('Vamos mostrar menos conteúdos como este');
    } else if (kind === 'lessLike') {
      const term = String(post.text || '').split(/\s+/).filter((word) => word.length > 4)[0];
      setFeedPref({
        hiddenPosts: [...new Set([...prefs.hiddenPosts, postId])],
        mutedTopics: term ? [...new Set([...prefs.mutedTopics, term])] : prefs.mutedTopics,
      });
      toast(term ? `Menos assuntos como “${term}”` : 'Vamos mostrar menos conteúdos assim');
    } else if (kind === 'muteTopic') {
      const term = String(value || '').trim();
      if (!term) return;
      setFeedPref({ mutedTopics: [...new Set([...prefs.mutedTopics, term])] });
      toast(`Assunto “${term}” silenciado`);
    } else if (kind === 'hideProfile') {
      setFeedPref({ hiddenProfiles: [...new Set([...prefs.hiddenProfiles, post.by])] });
      toast('Publicações deste perfil ocultadas');
    } else if (kind === 'unhideProfile') {
      setFeedPref({ hiddenProfiles: prefs.hiddenProfiles.filter((id) => id !== post.by) });
      toast('Perfil reexibido no feed');
    } else if (kind === 'muteCommunity') {
      const id = post.communityId;
      if (!id) return;
      setFeedPref({ mutedComms: [...new Set([...prefs.mutedComms, id])] });
      toast('Comunidade silenciada no feed');
    }
  }

  function addInterest(term) {
    const value = String(term || '').trim();
    if (!value) return;
    const current = dataRef.current?.me?.interests || [];
    if (current.includes(value)) return;
    const next = [...current, value];
    setData((cur) => ({ ...cur, me: { ...cur.me, interests: next } }));
    if (sessionRef.current?.id) {
      remote.saveProfile({ ...dataRef.current.me, interests: next }, sessionRef.current.id);
    }
  }

  function removeInterest(term) {
    const current = dataRef.current?.me?.interests || [];
    const next = current.filter((item) => item !== term);
    setData((cur) => ({ ...cur, me: { ...cur.me, interests: next } }));
    if (sessionRef.current?.id) {
      remote.saveProfile({ ...dataRef.current.me, interests: next }, sessionRef.current.id);
    }
  }

  function muteTopic(term) {
    const value = String(term || '').trim();
    if (!value) return;
    const prefs = feedPrefs(uiRef.current.settings);
    setFeedPref({ mutedTopics: [...new Set([...prefs.mutedTopics, value])] });
    toast(`Assunto “${value}” silenciado`);
  }

  function unmuteTopic(term) {
    const prefs = feedPrefs(uiRef.current.settings);
    setFeedPref({ mutedTopics: prefs.mutedTopics.filter((item) => item !== term) });
  }

  function toggleChatMute(withId) {
    const settings = uiRef.current.settings || DEFAULT_SETTINGS;
    const list = settings.mutedChats || [];
    const on = !list.includes(withId);
    setSetting(
      'mutedChats',
      on ? [...list, withId] : list.filter((id) => id !== withId)
    );
    toast(on ? 'Conversa silenciada' : 'Conversa reativada');
  }

  function toggleLiveAlert(id) {
    const settings = uiRef.current.settings || DEFAULT_SETTINGS;
    const list = settings.liveChannels || [];
    const on = !list.includes(id);
    setSetting(
      'liveChannels',
      on ? [...list, id] : list.filter((item) => item !== id)
    );
    toast(
      on
        ? 'Você será avisado quando este canal entrar ao vivo'
        : 'Alerta de live desativado'
    );
  }

  async function installApp() {
    const prompt = installPrompt.current;
    if (!prompt) {
      toast('Use o menu do navegador e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".');
      return;
    }
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* prompt is best-effort */
    }
    installPrompt.current = null;
    setCanInstall(false);
  }

  function clearLocalCache() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(DATA_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => localStorage.removeItem(key));
      toast('Cache local limpo. O conteúdo na nuvem não foi alterado.');
    } catch {
      toast('Não foi possível limpar o cache.');
    }
  }

  const actions = {
    submitAuth,
    google,
    requestPasswordReset,
    finishRecovery,
    cancelRecovery,
    logout,
    deleteAccount,
    openDeleteAccount: () => setUi((u) => ({ ...u, modal: { type: 'deleteaccount' } })),
    notify: toast,
    setAuthTab: (authTab) => setUi((u) => ({ ...u, authTab })),
    openSearch: () => setUi((u) => ({ ...u, modal: { type: 'search' } })),
    openObs: (id) => setUi((u) => ({ ...u, modal: { type: 'obs', id } })),
    toggleTheme: () =>
      setUi((u) => ({ ...u, theme: u.theme === 'dark' ? 'light' : 'dark' })),
    go,
    setDraftText: (text) => setUi((u) => ({ ...u, draft: { ...u.draft, text } })),
    setDraftFormat,
    setDraftCommunity: (communityId) =>
      setUi((u) => ({ ...u, draft: { ...u.draft, communityId: communityId || null } })),
    setDraftOption,
    addDraftOption,
    removeDraftOption,
    toggleDraftReaction,
    toggleDraftInvite,
    clearDraftMedia: () =>
      setUi((u) => ({ ...u, draft: { ...u.draft, media: [] } })),
    removeDraftMedia,
    applyMediaEdit,
    attachMedia,
    attachPostMedia,
    removePostMedia,
    applyPostMediaEdit,
    publish,
    votePost,
    answerPost,
    joinChallenge,
    inviteToChallenge,
    toggleLike,
    reactPost,
    toggleComments,
    openPost,
    openUser,
    reportPost,
    addComment,
    deleteComment,
    openEditPost,
    updatePost,
    toggleCommentsDisabled,
    deletePost,
    toggleSave,
    share,
    sharePost,
    openSharePost,
    sharePostTo,
    shareChannel,
    openSettings: () => setUi((u) => ({ ...u, modal: { type: 'settings' } })),
    openNotifications: () => setUi((u) => ({ ...u, modal: { type: 'notifications' } })),
    markNotifsSeen,
    setSetting,
    createStickerPack,
    addStickerToPack,
    removeStickerFromPack,
    deleteStickerPack,
    setFeedPref,
    resetFeedPrefs,
    feedFeedback,
    addInterest,
    removeInterest,
    muteTopic,
    unmuteTopic,
    openFeedPrefs: () => setUi((u) => ({ ...u, modal: { type: 'feedprefs' } })),
    playTestSound: playMessageSound,
    installApp,
    clearCache: clearLocalCache,
    openNewChat,
    startChat,
    follow,
    setProfTab: (profTab) => setUi((u) => ({ ...u, profTab })),
    openProfileList: (kind = 'following') =>
      setUi((u) => ({ ...u, modal: { type: 'profilelist', kind } })),
    saveProfile,
    pickCover,
    uploadAvatar,
    uploadCover,
    addScrap,
    openComm,
    closeModal,
    toggleComm,
    createComm,
    requestJoinComm,
    cancelJoinComm,
    approveJoin,
    rejectJoin,
    inviteToComm,
    respondCommunityInvite,
    linkCommChannel,
    unlinkCommChannel,
    uploadCommunityArt,
    openNewCommFromTopic,
    addModerator,
    removeModerator,
    addTopic,
    deleteTopic,
    setCommSeed: (commSeed) => setUi((u) => ({ ...u, commSeed })),
    openChat,
    backChat: () => setUi((u) => ({ ...u, chatOpen: false })),
    setChatQuery: (chatQ) => setUi((u) => ({ ...u, chatQ })),
    sendMessage,
    sendMessageTo,
    sendTyping,
    sendChatFile,
    sendChatBlob,
    viewPost,
    likeMessage,
    deleteMessage,
    clearChat,
    deleteChat,
    setChatWallpaper,
    setChanFilter: (chanFilter) => setUi((u) => ({ ...u, chanFilter })),
    openRoom,
    backRoom,
    openArena,
    openArenaCode,
    closeArena,
    inviteToArena,
    shareArenaResult,
    clearRoom: () => {
      setUi((u) => ({ ...u, room: null }));
      if (location.hash !== '#conexoes') location.hash = '#conexoes';
    },
    joinRoom,
    createChannel,
    deleteChannel,
    toggleLiveAlert,
    toggleChatMute,
    startLive,
    endLive,
    sendRoomMessage,
    reactNotice,
    openEditProfile: () => setUi((u) => ({ ...u, modal: { type: 'profile' } })),
    openNewComm: () => setUi((u) => ({ ...u, modal: { type: 'newcomm' } })),
    openNewChannel: () => setUi((u) => ({ ...u, modal: { type: 'newchan' } })),
    openLive: () => setUi((u) => ({ ...u, modal: { type: 'live' } })),
  };

  const value = {
    data,
    ui,
    ready,
    session,
    recovery,
    mode: isSupabaseEnabled ? 'supabase' : 'demo',
    online,
    onlinePeople,
    typingPeople,
    canInstall,
    toast: toastMsg,
    actions,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
