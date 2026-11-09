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
import { MAX_POST_MEDIA, mediaKind, parseRemoteMedia } from '../lib/media';
import { COVERS, STATE_VERSION, newState } from '../lib/seed';
import { playMessageSound, playSentSound } from '../lib/sound';
import {
  fileToDataURL,
  fileToRawDataURL,
  fmt,
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
};

const readSettings = () => {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(lsGet(SETTINGS_KEY) || '{}') || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const cacheKey = (email) => DATA_PREFIX + email;
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
      return {
        id: p.id,
        by: asPerson(p.author_id),
        ts: new Date(p.created_at).getTime(),
        text: p.text || '',
        kind: p.kind || 'text',
        seed: p.seed || p.id,
        src: p.media_url || media[0]?.src,
        media,
        dur: p.dur ?? undefined,
        likes: ws.likes.counts.get(p.id) || 0,
        liked: !!myReaction,
        myReaction,
        saved: ws.saves.has(p.id),
        commentsDisabled: !!p.comments_disabled,
        comments: (commentsByPost[p.id] || []).sort((a, b) => a.ts - b.ts),
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
      const modIds = (ws.allCommMembers || [])
        .filter(
          (row) =>
            row.community_id === c.id &&
            (row.role === 'owner' || row.role === 'moderator')
        )
        .map((row) => asPerson(row.user_id));
      const mods = [...new Set([owner, ...modIds])];
      return {
        id: c.id,
        name: c.name,
        cat: c.category || 'Outros',
        desc: c.description || '',
        subs: commMemberCounts.get(c.id) || 0,
        owner,
        mods,
        joined: myCommRoles.has(c.id),
        seed: c.cover_seed || c.id + '-capa',
        rules: c.rules?.length ? c.rules : ['Respeite todo mundo no fluxo.'],
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
  const [route, param] = raw.split('/');
  const valid = ['feed', 'perfil', 'mensagens', 'conexoes'].includes(route)
    ? route
    : 'feed';
  let room = null;
  if (valid === 'conexoes' && param) {
    try {
      room = decodeURIComponent(param);
    } catch {
      room = param;
    }
  }
  return { route: valid, room };
};

const initialUi = () => {
  const { route, room } = readHash();
  return {
    route,
    feedTab: 'all',
    draft: { text: '', media: [] },
    open: {},
    profTab: 'posts',
    chat: null,
    chatOpen: false,
    chatQ: '',
    typing: {},
    room,
    chanFilter: 'all',
    myLive: null,
    authTab: 'in',
    modal: null,
    commSeed: COVERS[0],
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

  const installPrompt = useRef(null);
  const toastTimer = useRef();
  const timers = useRef({});
  const lastUserId = useRef(null);
  const recoveryRef = useRef(isRecoveryLink);
  const uiRef = useRef(ui);
  const dataRef = useRef(data);
  const sessionRef = useRef(session);
  uiRef.current = ui;
  dataRef.current = data;
  sessionRef.current = session;

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = ui.theme;
    lsSet(THEME_KEY, ui.theme);
  }, [ui.theme]);

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
      const { route, room } = readHash();
      setUi((u) =>
        u.route === route && u.room === room ? u : { ...u, route, room }
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
    return remote.subscribeDirectMessages(session.id, (row) => {
      if (!row || !row.sender_id) return;
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
      if (settings.messageSound) playMessageSound();
      if (
        settings.notifications &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        document.hidden &&
        row.sender_id !== session.id
      ) {
        try {
          new Notification('Nova mensagem no FluXo', {
            body: row.text || 'Você recebeu um anexo.',
            icon: '/assets/icon-192.png',
          });
        } catch {
          /* notification is best-effort */
        }
      }
    });
  }, [session?.id]);

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
    try {
      for (const file of selected) {
        const kind = mediaKind(file);
        let src = kind === 'photo' ? await fileToDataURL(file, 1080) : URL.createObjectURL(file);
        if (isSupabaseEnabled && sessionRef.current?.id) {
          const uploaded = await remote.uploadMedia(file, sessionRef.current.id);
          if (uploaded) src = uploaded;
        }
        setUi((u) => ({
          ...u,
          draft: {
            ...u.draft,
            media: [...(u.draft.media || []), { kind, src, name: file.name }],
          },
        }));
      }
      if (list.length > room) {
        toast(`Adicionamos ${room} de ${list.length}. O limite é ${MAX_POST_MEDIA}.`);
      }
    } catch {
      toast('Não foi possível processar um dos arquivos.');
    }
  }

  function removeDraftMedia(index) {
    setUi((u) => ({
      ...u,
      draft: {
        ...u.draft,
        media: (u.draft.media || []).filter((_, i) => i !== index),
      },
    }));
  }

  function publish(text) {
    const draft = uiRef.current.draft;
    const trimmed = text.trim();
    const media = draft.media || [];
    if (!trimmed && !media.length) {
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
      saved: false,
      commentsDisabled: false,
      comments: [],
    };
    setData((cur) => ({ ...cur, posts: [post, ...cur.posts] }));
    setUi((u) => ({ ...u, draft: { text: '', media: [] } }));
    if (sessionRef.current?.id) remote.savePost(post, sessionRef.current.id);
    toast('Publicado');
  }

  function reactPost(id, emoji = '❤️') {
    const post = dataRef.current?.posts.find((p) => p.id === id);
    if (!post) return;
    const next = post.myReaction === emoji ? null : emoji;
    setData((cur) => ({
      ...cur,
      posts: cur.posts.map((p) =>
        p.id === id ? { ...p, myReaction: next, liked: !!next } : p
      ),
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
    setUi((u) => ({ ...u, modal: { type: 'post', id } }));
  }

  function addComment(postId, text) {
    const trimmed = text.trim();
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
    applyToggleComm(id);
  }

  function applyToggleComm(id) {
    const community = dataRef.current?.comms.find((c) => c.id === id);
    if (!community) return;
    const joined = !community.joined;
    const updated = {
      ...community,
      joined,
      subs: Math.max(0, community.subs + (joined ? 1 : -1)),
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

  function createComm({ name, cat, desc, rules, seed }) {
    const community = {
      id: uid(),
      name,
      cat,
      desc: desc || 'Um novo fluxo para conversar.',
      subs: 1,
      owner: 'me',
      mods: ['me'],
      joined: true,
      seed: (seed || COVERS[0]) + '-c',
      rules: rules?.length ? rules : ['Respeite todo mundo no fluxo.'],
      topics: [],
    };
    setData((cur) => ({ ...cur, comms: [community, ...cur.comms] }));
    setUi((u) => ({ ...u, profTab: 'comms', modal: { type: 'comm', id: community.id } }));
    if (sessionRef.current?.id) remote.saveCommunity(community, sessionRef.current.id);
    toast('Comunidade criada');
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

  function sendMessage(text, attachment) {
    const chatId = uiRef.current.chat;
    const chat = dataRef.current?.chats.find((c) => c.id === chatId);
    const trimmed = (text || '').trim();
    if (!chat || (!trimmed && !attachment)) return;
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

  function setSetting(key, value) {
    setUi((u) => ({ ...u, settings: { ...u.settings, [key]: value } }));
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
    notify: toast,
    setAuthTab: (authTab) => setUi((u) => ({ ...u, authTab })),
    toggleTheme: () =>
      setUi((u) => ({ ...u, theme: u.theme === 'dark' ? 'light' : 'dark' })),
    go,
    setFeedTab: (feedTab) => setUi((u) => ({ ...u, feedTab })),
    setDraftText: (text) => setUi((u) => ({ ...u, draft: { ...u.draft, text } })),
    clearDraftMedia: () =>
      setUi((u) => ({ ...u, draft: { ...u.draft, media: [] } })),
    removeDraftMedia,
    attachMedia,
    publish,
    toggleLike,
    reactPost,
    toggleComments,
    openPost,
    addComment,
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
    setSetting,
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
    addModerator,
    removeModerator,
    addTopic,
    deleteTopic,
    setCommSeed: (commSeed) => setUi((u) => ({ ...u, commSeed })),
    openChat,
    backChat: () => setUi((u) => ({ ...u, chatOpen: false })),
    setChatQuery: (chatQ) => setUi((u) => ({ ...u, chatQ })),
    sendMessage,
    sendChatFile,
    sendChatBlob,
    likeMessage,
    setChanFilter: (chanFilter) => setUi((u) => ({ ...u, chanFilter })),
    openRoom,
    backRoom,
    clearRoom: () => {
      setUi((u) => ({ ...u, room: null }));
      if (location.hash !== '#conexoes') location.hash = '#conexoes';
    },
    joinRoom,
    createChannel,
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
    canInstall,
    toast: toastMsg,
    actions,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
