import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, BackHandler, Linking } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { Session } from '@supabase/supabase-js';
import * as api from '../lib/api';
import { buildInteractive } from '../lib/interactive';
import { isSupabaseConfigured } from '../lib/env';
import { parseDeepLink } from '../lib/links';
import { loadPreferences, savePreferences, DEFAULT_PREFERENCES } from '../lib/prefs';
import { supabase } from '../lib/supabase';
import { addNotificationTapHandler, notifyLocally, requestNotificationPermission } from '../lib/notifications';
import type {
  AppNotification,
  ChatThread,
  DirectMessage,
  MediaItem,
  Post,
  Preferences,
  Profile,
  QuizChallenge,
  QuizResult,
  RealtimeStatus,
} from '../types';
import { firstName } from '../lib/format';

export type Tab = 'home' | 'explore' | 'create' | 'messages' | 'profile';

export type StackEntry =
  | { name: 'reels'; postId?: string }
  | { name: 'live'; channelId: string; host: boolean }
  | { name: 'comments'; postId: string }
  | { name: 'chat'; userId: string }
  | { name: 'settings' }
  | { name: 'notifications' }
  | { name: 'user'; userId: string }
  | { name: 'editProfile' }
  | { name: 'connections'; userId: string; mode: 'followers' | 'following' }
  | { name: 'post'; postId: string }
  | { name: 'shareToChat'; postId: string }
  | { name: 'quiz'; challengeId?: string; inviteId?: string };

type PublishInput = {
  text: string;
  assets: { uri: string; kind: 'photo' | 'video'; duration?: number | null; mimeType?: string | null; fileName?: string | null }[];
  format: any;
  pollOptions?: string[];
  reactions?: string[];
  invited?: string[];
  live?: any;
};

type AppContextValue = {
  session: Session | null;
  profile: Profile | null;
  users: Record<string, Profile>;
  posts: Post[];
  following: string[];
  route: Tab;
  stack: StackEntry[];
  prefs: Preferences;
  notifications: AppNotification[];
  notifSeen: number;
  unreadMessages: number;
  threads: ChatThread[];
  messagesVersion: number;
  booting: boolean;
  feedLoading: boolean;
  feedRefreshing: boolean;
  feedDone: boolean;
  publishing: boolean;
  publishProgress: string;
  online: boolean;
  realtime: RealtimeStatus;
  toastMessage: string;
  actions: {
    go: (tab: Tab) => void;
    push: (entry: StackEntry) => void;
    pop: () => void;
    resetStack: () => void;
    signIn: (email: string, password: string) => Promise<string | null>;
    signUp: (name: string, email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
    signOut: () => Promise<void>;
    requestReset: (email: string) => Promise<string | null>;
    deleteAccount: () => Promise<string | null>;
    refreshFeed: () => Promise<void>;
    loadMore: () => Promise<void>;
    toggleLike: (post: Post) => Promise<void>;
    toggleSave: (post: Post) => Promise<void>;
    assistantComment: (postId: string, text: string) => Promise<void>;
    publish: (input: PublishInput) => Promise<string | null>;
    updateProfile: (next: Profile) => Promise<string | null>;
    toggleFollow: (userId: string) => Promise<void>;
    setPreferences: (patch: Partial<Preferences>) => Promise<void>;
    markNotificationsRead: () => Promise<void>;
    loadNotifications: () => Promise<void>;
    refreshThreads: () => Promise<void>;
    openChat: (userId: string) => void;
    sendMessage: (userId: string, text: string, attachment?: Record<string, any> | null) => Promise<DirectMessage | null>;
    editMessage: (messageId: string, text: string) => Promise<string | null>;
    deleteMessage: (messageId: string) => Promise<string | null>;
    markThreadRead: (userId: string) => Promise<void>;
    sharePostToChat: (postId: string, userId: string) => Promise<string | null>;
    shareQuizResult: (result: QuizResult) => Promise<string | null>;
    shareQuizChallenge: (challenge: QuizChallenge, userId: string) => Promise<string | null>;
    openQuiz: (options?: { challengeId?: string; inviteId?: string }) => void;
    mergeProfiles: (profiles: Profile[]) => void;
    mergePosts: (posts: Post[]) => void;
    deletePost: (postId: string) => Promise<void>;
    toast: (message: string) => void;
  };
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp precisa estar dentro de AppProvider.');
  return value;
}

const NOTIF_SEEN_KEY = (id: string) => `fluxo.notif.seen.${id}`;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [users, setUsers] = useState<Record<string, Profile>>({});
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [route, setRouteState] = useState<Tab>('home');
  const [stack, setStack] = useState<StackEntry[]>([]);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifSeen, setNotifSeen] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messagesVersion, setMessagesVersion] = useState(0);
  const [booting, setBooting] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedDone, setFeedDone] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState('');
  const [online, setOnline] = useState(true);
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');
  const [toastMessage, setToastMessage] = useState('');

  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uidRef = useRef<string>('');
  const profileRef = useRef<Profile | null>(null);
  const postsRef = useRef<Post[]>([]);
  const prefsRef = useRef<Preferences>(DEFAULT_PREFERENCES);
  const usersRef = useRef<Record<string, Profile>>({});
  const deepLinkHandled = useRef(false);
  const appActiveAt = useRef(Date.now());

  uidRef.current = session?.user?.id || '';
  profileRef.current = profile;
  postsRef.current = posts;
  prefsRef.current = prefs;
  usersRef.current = users;

  const toast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(''), 2600);
  }, []);

  const mergeProfiles = useCallback((list: Profile[]) => {
    if (!list.length) return;
    setUsers((current) => {
      const next = { ...current };
      list.forEach((item) => {
        if (item.id) next[item.id] = { ...(next[item.id] || {}), ...item };
      });
      return next;
    });
  }, []);

  const mergePosts = useCallback((list: Post[]) => {
    if (!list.length) return;
    setPosts((current) => {
      const map = new Map(current.map((post) => [post.id, post]));
      list.forEach((post) => map.set(post.id, post));
      return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
    });
  }, []);

  const go = useCallback((tab: Tab) => {
    setStack([]);
    setRouteState(tab);
  }, []);

  const push = useCallback((entry: StackEntry) => {
    setStack((current) => [...current, entry]);
  }, []);

  const pop = useCallback(() => {
    setStack((current) => current.slice(0, -1));
  }, []);

  const resetStack = useCallback(() => setStack([]), []);

  const refreshThreads = useCallback(async () => {
    const uidValue = uidRef.current;
    if (!uidValue) return;
    const result = await api.fetchConversations(uidValue);
    setThreads(result.threads);
    setUnreadMessages(result.unread);
    mergeProfiles(result.profiles);
  }, [mergeProfiles]);

  const loadNotifications = useCallback(async () => {
    const uidValue = uidRef.current;
    if (!uidValue) return;
    const mine = postsRef.current.filter((post) => post.authorId === uidValue).map((post) => post.id);
    const result = await api.fetchNotifications(uidValue, mine);
    mergeProfiles(result.profiles);
    setNotifications((current) => {
      const seen = notifSeen;
      const realtimeOnes = current.filter((item) => item.createdAt > seen && !result.notifications.some((row) => row.id === item.id));
      return [...realtimeOnes, ...result.notifications]
        .filter((item, index, list) => list.findIndex((row) => row.id === item.id) === index)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((item) => ({ ...item, read: item.createdAt <= seen }));
    });
  }, [mergeProfiles, notifSeen]);

  const loadWorkspace = useCallback(async (user: Session['user'], seen: number) => {
    setFeedLoading(true);
    try {
      const me = await api.ensureProfile(user);
      setProfile(me);
      setUsers((current) => ({ ...current, [me.id]: me }));

      const [follows, page, live] = await Promise.all([
        api.fetchFollowing(user.id),
        api.fetchFeedPage(user.id, 0),
        api.fetchLiveChannels(),
      ]);
      setFollowing(follows);
      offsetRef.current = page.posts.length;
      setPosts(page.posts);
      setFeedDone(page.posts.length === 0);
      mergeProfiles([me, ...page.profiles, ...live.profiles]);

      const mine = page.posts.filter((post) => post.authorId === user.id).map((post) => post.id);
      const [notifResult, conversations] = await Promise.all([
        api.fetchNotifications(user.id, mine),
        api.fetchConversations(user.id),
      ]);
      mergeProfiles(notifResult.profiles);
      setNotifications(notifResult.notifications.map((item) => ({ ...item, read: item.createdAt <= seen })));
      setThreads(conversations.threads);
      setUnreadMessages(conversations.unread);
      mergeProfiles(conversations.profiles);
      setRealtime('online');
    } catch (error: any) {
      toast(error?.message || 'Não foi possível carregar o Fluxo.');
      setRealtime('offline');
    } finally {
      setFeedLoading(false);
    }
  }, [mergeProfiles, toast]);

  // Sessão: mesma conta do site, persistida no aparelho.
  useEffect(() => {
    let mounted = true;
    if (!isSupabaseConfigured) {
      setBooting(false);
      toast('Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.');
      return () => {
        mounted = false;
      };
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      setBooting(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [toast]);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setPosts([]);
      setNotifications([]);
      setThreads([]);
      setUnreadMessages(0);
      setFollowing([]);
      setRealtime('connecting');
      return;
    }
    const seenKey = NOTIF_SEEN_KEY(session.user.id);
    import('@react-native-async-storage/async-storage').then(async ({ default: storage }) => {
      const raw = await storage.getItem(seenKey);
      const seen = Number(raw) || 0;
      setNotifSeen(seen);
      await loadWorkspace(session.user, seen);
      if (!deepLinkHandled.current) {
        deepLinkHandled.current = true;
        const initial = await Linking.getInitialURL();
        handleDeepLink(initial ?? null);
      }
    });
  }, [session?.user?.id]);

  const handleDeepLink = useCallback((url: string | null) => {
    const link = parseDeepLink(url);
    if (!link) return;
    if (link.name === 'post') push({ name: 'post', postId: link.id });
    if (link.name === 'profile') push({ name: 'user', userId: link.id });
    if (link.name === 'live') push({ name: 'live', channelId: link.id, host: false });
    if (link.name === 'quiz') {
      push({
        name: 'quiz',
        challengeId: link.challengeId,
        inviteId: link.inviteId,
      });
    }
    if (link.name === 'messages') {
      setRouteState('messages');
      if (link.id) push({ name: 'chat', userId: link.id });
    }
  }, [push]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => handleDeepLink(event.url));
    return () => subscription.remove();
  }, [handleDeepLink]);

  // Toque em notificação local abre a publicação/perfil correspondente.
  useEffect(() => {
    return addNotificationTapHandler((data) => {
      if (data?.postId) push({ name: 'post', postId: String(data.postId) });
      else if (data?.userId) push({ name: 'user', userId: String(data.userId) });
    });
  }, [push]);

  // Preferências locais (economia de dados, autoplay, som).
  useEffect(() => {
    loadPreferences().then(setPrefs);
  }, []);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  // Conectividade.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    });
    return () => unsubscribe();
  }, []);

  // Atualiza quando o app volta ao primeiro plano depois de um tempo.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        appActiveAt.current = Date.now();
        return;
      }
      if (Date.now() - appActiveAt.current > 45_000 && uidRef.current) {
        refreshThreads();
      }
    });
    return () => subscription.remove();
  }, [refreshThreads]);

  // Realtime: curtidas, comentários, follows e mensagens.
  useEffect(() => {
    const uidValue = uidRef.current;
    if (!uidValue) return undefined;
    const channel = supabase
      .channel(`fluxo-mobile:${uidValue}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_likes' },
        (payload: any) => {
          const row = payload.new || payload.old || {};
          const postId = String(row.post_id || '');
          if (!postId) return;
          setPosts((current) =>
            current.map((post) => {
              if (post.id !== postId) return post;
              const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
              return { ...post, likes: Math.max(0, post.likes + delta) };
            })
          );
          if (payload.eventType === 'INSERT' && row.user_id !== uidValue) {
            const target = postsRef.current.find((post) => post.id === postId);
            if (target?.authorId === uidValue && prefsRef.current.notifications) {
              notifyLocally('Nova curtida', `${firstName(users[row.user_id]?.name || 'Alguém')} curtiu sua publicação.`, { postId });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        (payload: any) => {
          const row = payload.new || {};
          if (!row.post_id) return;
          setPosts((current) =>
            current.map((post) =>
              post.id === row.post_id ? { ...post, commentCount: post.commentCount + 1 } : post
            )
          );
          const target = postsRef.current.find((post) => post.id === row.post_id);
          if (target?.authorId === uidValue && row.author_id !== uidValue && prefsRef.current.notifications) {
            notifyLocally('Novo comentário', `${firstName(users[row.author_id]?.name || 'Alguém')}: ${String(row.text || '').slice(0, 90)}`, { postId: row.post_id });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'follows' },
        (payload: any) => {
          const row = payload.new || {};
          if (row.following_id === uidValue && prefsRef.current.notifications) {
            notifyLocally('Novo seguidor', `${firstName(users[row.follower_id]?.name || 'Alguém')} começou a seguir você.`, { userId: row.follower_id });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_messages' },
        (payload: any) => {
          const row = payload.new || payload.old || {};
          setMessagesVersion((version) => version + 1);
          refreshThreads();
          if (payload.eventType !== 'INSERT') return;
          if (row.recipient_id !== uidValue) return;
          if (prefsRef.current.notifications) {
            notifyLocally('Nova mensagem', `${firstName(users[row.sender_id]?.name || 'Alguém')}: ${String(row.text || 'Enviou um anexo').slice(0, 90)}`, { userId: row.sender_id });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtime('online');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtime('offline');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshThreads, session?.user?.id, users]);

  // Botão voltar do Android.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) {
        setStack((current) => current.slice(0, -1));
        return true;
      }
      if (route !== 'home') {
        setRouteState('home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [route, stack.length]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const refreshFeed = useCallback(async () => {
    const uidValue = uidRef.current;
    if (!uidValue || loadingRef.current) return;
    loadingRef.current = true;
    setFeedRefreshing(true);
    try {
      const page = await api.fetchFeedPage(uidValue, 0);
      offsetRef.current = api_offsets(page.posts.length);
      setPosts(page.posts);
      setFeedDone(page.posts.length === 0);
      mergeProfiles(page.profiles);
      await loadNotifications();
    } catch (error: any) {
      toast(error?.message || 'Sem conexão para atualizar.');
    } finally {
      loadingRef.current = false;
      setFeedRefreshing(false);
    }
  }, [loadNotifications, mergeProfiles, toast]);

  const loadMore = useCallback(async () => {
    const uidValue = uidRef.current;
    if (!uidValue || loadingRef.current || feedDone) return;
    loadingRef.current = true;
    setFeedLoading(true);
    try {
      const page = await api.fetchFeedPage(uidValue, offsetRef.current);
      offsetRef.current += page.posts.length;
      if (!page.posts.length) setFeedDone(true);
      mergePosts(page.posts);
      mergeProfiles(page.profiles);
    } catch {
      // Mantém o feed atual e permite tentar de novo ao rolar.
    } finally {
      loadingRef.current = false;
      setFeedLoading(false);
    }
  }, [feedDone, mergePosts, mergeProfiles]);

  const toggleLike = useCallback(async (post: Post) => {
    const uidValue = uidRef.current;
    if (!uidValue) return;
    const liked = !post.liked;
    const delta = liked ? 1 : -1;
    setPosts((current) =>
      current.map((row) =>
        row.id === post.id
          ? {
              ...row,
              liked,
              likes: Math.max(0, row.likes + delta),
              myReaction: liked ? '❤️' : null,
              reactionCounts: {
                ...row.reactionCounts,
                '❤️': Math.max(0, (row.reactionCounts['❤️'] || 0) + delta),
              },
            }
          : row
      )
    );
    try {
      await api.setLike(post.id, uidValue, liked);
    } catch (error: any) {
      setPosts((current) =>
        current.map((row) => (row.id === post.id ? { ...row, liked: post.liked, likes: post.likes } : row))
      );
      toast(error?.message || 'Não foi possível curtir.');
    }
  }, [toast]);

  const toggleSave = useCallback(async (post: Post) => {
    const uidValue = uidRef.current;
    if (!uidValue) return;
    const saved = !post.saved;
    setPosts((current) => current.map((row) => (row.id === post.id ? { ...row, saved } : row)));
    try {
      await api.setSave(post.id, uidValue, saved);
      toast(saved ? 'Publicação salva' : 'Removida dos salvos');
    } catch (error: any) {
      setPosts((current) => current.map((row) => (row.id === post.id ? { ...row, saved: post.saved } : row)));
      toast(error?.message || 'Não foi possível salvar.');
    }
  }, [toast]);

  const assistantComment = useCallback(async (postId: string, text: string) => {
    const uidValue = uidRef.current;
    const me = profileRef.current;
    if (!uidValue || !text.trim()) return;
    try {
      const row = await api.addComment({ postId, authorId: uidValue, text: text.trim() });
      setPosts((current) =>
        current.map((post) =>
          post.id === postId ? { ...post, commentCount: post.commentCount + 1 } : post
        )
      );
      if (me) mergeProfiles([me]);
      return row as any;
    } catch (error: any) {
      toast(error?.message || 'Não foi possível comentar.');
      throw error;
    }
  }, [mergeProfiles, toast]);

  const publish = useCallback(async (input: PublishInput) => {
    const uidValue = uidRef.current;
    const me = profileRef.current;
    if (!uidValue || !me) return 'Entre na sua conta para publicar.';
    if (!input.text.trim() && !input.assets.length) return 'Escreva algo ou escolha uma mídia.';

    setPublishing(true);
    setPublishProgress('Preparando mídia…');
    try {
      const media: MediaItem[] = [];
      for (let index = 0; index < input.assets.length; index += 1) {
        const asset = input.assets[index];
        setPublishProgress(`Enviando ${index + 1} de ${input.assets.length}…`);
        const uploaded = await api.uploadMedia({
          uri: asset.uri,
          userId: uidValue,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
        });
        media.push({
          kind: asset.kind,
          src: uploaded.url,
          seed: uploaded.path,
          dur: asset.duration ? Math.round(asset.duration / 1000) : null,
        });
      }

      setPublishProgress('Publicando…');
      const draftOptions = (input.pollOptions || []).map((label, index) => ({
        id: `opt-${index + 1}`,
        label,
        mediaIndex: index,
      }));
      const interactive = input.format === 'classic'
        ? null
        : buildInteractive(input.format, {
            options: draftOptions,
            reactions: input.reactions,
            invited: input.invited,
            live: input.live,
          }, media);

      if (interactive?.format === 'poll' && interactive.options.length < 2) {
        return 'Adicione pelo menos duas alternativas na enquete.';
      }

      const post = await api.createPost({
        authorId: uidValue,
        text: input.text.trim(),
        media,
        interactive,
        kind: media[0]?.kind === 'video' ? 'video' : media.length ? 'photo' : 'text',
      });
      mergePosts([post]);
      setRouteState('home');
      setStack([]);
      toast('Publicado no Fluxo');
      return null;
    } catch (error: any) {
      return error?.message || 'Não foi possível publicar.';
    } finally {
      setPublishing(false);
      setPublishProgress('');
    }
  }, [mergePosts, toast]);

  const updateProfile = useCallback(async (next: Profile) => {
    const uidValue = uidRef.current;
    if (!uidValue) return 'Sessão expirada.';
    try {
      await api.saveProfile(next, uidValue);
      setProfile(next);
      mergeProfiles([next]);
      toast('Perfil atualizado');
      return null;
    } catch (error: any) {
      return error?.message || 'Não foi possível salvar o perfil.';
    }
  }, [mergeProfiles, toast]);

  const toggleFollow = useCallback(async (userId: string) => {
    const uidValue = uidRef.current;
    if (!uidValue || userId === uidValue) return;
    const next = !following.includes(userId);
    setFollowing((current) => (next ? [...current, userId] : current.filter((id) => id !== userId)));
    try {
      await api.setFollow(uidValue, userId, next);
    } catch (error: any) {
      setFollowing((current) => (next ? current.filter((id) => id !== userId) : [...current, userId]));
      toast(error?.message || 'Não foi possível seguir.');
    }
  }, [following, toast]);

  const setPreferences = useCallback(async (patch: Partial<Preferences>) => {
    const next = { ...prefsRef.current, ...patch };
    setPrefs(next);
    prefsRef.current = next;
    await savePreferences(next);
    if (patch.notifications === true) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        const fallback = { ...next, notifications: false };
        setPrefs(fallback);
        prefsRef.current = fallback;
        await savePreferences(fallback);
        toast('Permissão de notificações não concedida.');
        return;
      }
    }
    if (patch.sound === true) toast('Som ativado nos vídeos.');
  }, [toast]);

  const markNotificationsRead = useCallback(async () => {
    const uidValue = uidRef.current;
    if (!uidValue) return;
    const now = Date.now();
    setNotifSeen(now);
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    try {
      const storage = (await import('@react-native-async-storage/async-storage')).default;
      await storage.setItem(NOTIF_SEEN_KEY(uidValue), String(now));
    } catch {
      // A marcação local já foi aplicada.
    }
  }, []);

  const openChat = useCallback((userId: string) => {
    push({ name: 'chat', userId });
  }, [push]);

  const deletePost = useCallback(async (postId: string) => {
    try {
      await api.deletePost(postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
      toast('Publicação apagada');
    } catch (error: any) {
      toast(error?.message || 'Não foi possível apagar.');
    }
  }, [toast]);

  const sendMessage = useCallback(async (
    userId: string,
    text: string,
    attachment: Record<string, any> | null = null
  ): Promise<DirectMessage | null> => {
    const uidValue = uidRef.current;
    if (!uidValue || !userId) return null;
    const clean = String(text || '').trim();
    if (!clean && !attachment) return null;
    try {
      const row = await api.sendDirectMessage({
        senderId: uidValue,
        recipientId: userId,
        text: clean,
        attachment,
      });
      const mapped = api.mapMessage(row);
      setThreads((current) => {
        const existing = current.find((thread) => thread.userId === userId);
        const next = existing
          ? current.map((thread) =>
              thread.userId === userId ? { ...thread, last: mapped } : thread
            )
          : [{ userId, last: mapped, unread: 0 }, ...current];
        return next.sort((a, b) => (b.last?.createdAt || 0) - (a.last?.createdAt || 0));
      });
      setMessagesVersion((version) => version + 1);
      refreshThreads();
      return mapped;
    } catch (error: any) {
      toast(error?.message || 'Não foi possível enviar a mensagem.');
      return null;
    }
  }, [refreshThreads, toast]);

  const editMessage = useCallback(async (messageId: string, text: string): Promise<string | null> => {
    const clean = String(text || '').trim();
    if (!messageId || !clean) return 'A mensagem não pode ficar vazia.';
    try {
      await api.updateDirectMessage(messageId, clean);
      setThreads((current) =>
        current.map((thread) =>
          thread.last?.id === messageId
            ? { ...thread, last: { ...thread.last, text: clean, editedAt: Date.now() } }
            : thread
        )
      );
      setMessagesVersion((version) => version + 1);
      return null;
    } catch (error: any) {
      return error?.message || 'Não foi possível editar a mensagem.';
    }
  }, []);

  const deleteMessage = useCallback(async (messageId: string): Promise<string | null> => {
    if (!messageId) return 'Mensagem inválida.';
    try {
      await api.deleteDirectMessage(messageId);
      setMessagesVersion((version) => version + 1);
      refreshThreads();
      return null;
    } catch (error: any) {
      return error?.message || 'Não foi possível apagar a mensagem.';
    }
  }, [refreshThreads]);

  const markThreadRead = useCallback(async (userId: string) => {
    const uidValue = uidRef.current;
    if (!uidValue || !userId) return;
    let removed = 0;
    setThreads((current) =>
      current.map((thread) => {
        if (thread.userId !== userId) return thread;
        removed = thread.unread;
        return { ...thread, unread: 0 };
      })
    );
    if (removed) setUnreadMessages((count) => Math.max(0, count - removed));
    await api.markThreadRead(uidValue, userId);
  }, []);

  const sharePostToChat = useCallback(async (postId: string, userId: string): Promise<string | null> => {
    const post = postsRef.current.find((item) => item.id === postId);
    if (!post) return 'Publicação não encontrada.';
    const preview = post.media[0] || null;
    const sent = await sendMessage(userId, '', {
      kind: 'post',
      postId: post.id,
      authorId: post.authorId,
      title: post.text ? post.text.slice(0, 90) : 'Publicação compartilhada',
      text: post.text.slice(0, 180),
      media: preview?.src || preview?.seed || null,
      mediaSeed: preview?.seed || null,
      mediaKind: preview?.kind === 'video' ? 'video' : 'photo',
    });
    return sent ? null : 'Não foi possível compartilhar a publicação.';
  }, [sendMessage]);

  const shareQuizResult = useCallback(async (result: QuizResult): Promise<string | null> => {
    const mode = result.mode === 'insane' ? 'Insano' : 'Clássico';
    const lines = [
      `💣 Quiz BOOM! · ${result.categoryName || 'Todas as categorias'}`,
      `Modo ${mode} · ${Number(result.score) || 0} pontos`,
      `${Number(result.correct) || 0}/${Number(result.total) || 0} acertos · melhor combo ${Number(result.bestCombo) || 0}x`,
    ];
    if (result.medal) lines.push(`🏅 ${result.medal}`);
    lines.push('Jogue também no Fluxo!');
    return publish({ text: lines.join('\n'), assets: [], format: 'classic' as any });
  }, [publish]);

  const shareQuizChallenge = useCallback(async (
    challenge: QuizChallenge,
    userId: string
  ): Promise<string | null> => {
    await api.quizSaveChallenge(challenge);
    const sent = await sendMessage(userId, '', {
      kind: 'quiz',
      challengeId: challenge.id,
      challengerName: challenge.challengerName,
      categoryName: challenge.categoryName || 'Todas as categorias',
      mode: challenge.mode,
      size: challenge.size,
      targetScore: challenge.targetScore,
    });
    return sent ? null : 'Não foi possível enviar o desafio.';
  }, [sendMessage]);

  const openQuiz = useCallback((options?: { challengeId?: string; inviteId?: string }) => {
    push({
      name: 'quiz',
      challengeId: options?.challengeId,
      inviteId: options?.inviteId,
    });
  }, [push]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return error.message;
      return null;
    } catch (error: any) {
      return error?.message || 'Não foi possível entrar.';
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() } },
      });
      if (error) return { error: error.message, needsConfirmation: false };
      return { error: null, needsConfirmation: !data.session };
    } catch (error: any) {
      return { error: error?.message || 'Não foi possível criar a conta.', needsConfirmation: false };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStack([]);
    setRouteState('home');
    setPosts([]);
    setProfile(null);
  }, []);

  const requestReset = useCallback(async (email: string) => {
    try {
      await api.requestPasswordReset(email.trim());
      return null;
    } catch (error: any) {
      return error?.message || 'Não foi possível enviar o e-mail.';
    }
  }, []);

  const deleteAccountAction = useCallback(async () => {
    try {
      await api.deleteAccount();
      setStack([]);
      setRouteState('home');
      return null;
    } catch (error: any) {
      return error?.message || 'Não foi possível excluir a conta.';
    }
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    session,
    profile,
    users,
    posts,
    following,
    route,
    stack,
    prefs,
    notifications,
    notifSeen,
    unreadMessages,
    threads,
    messagesVersion,
    booting,
    feedLoading,
    feedRefreshing,
    feedDone,
    publishing,
    publishProgress,
    online,
    realtime,
    toastMessage,
    actions: {
      go,
      push,
      pop,
      resetStack,
      signIn,
      signUp,
      signOut,
      requestReset,
      deleteAccount: deleteAccountAction,
      refreshFeed,
      loadMore,
      toggleLike,
      toggleSave,
      assistantComment,
      publish,
      updateProfile,
      toggleFollow,
      setPreferences,
      markNotificationsRead,
      loadNotifications,
      refreshThreads,
      openChat,
      sendMessage,
      editMessage,
      deleteMessage,
      markThreadRead,
      sharePostToChat,
      shareQuizResult,
      shareQuizChallenge,
      openQuiz,
      mergeProfiles,
      mergePosts,
      deletePost,
      toast,
    },
  }), [
    session, profile, users, posts, following, route, stack, prefs, notifications,
    notifSeen, unreadMessages, threads, messagesVersion, booting, feedLoading, feedRefreshing,
    feedDone, publishing, publishProgress, online, realtime, toastMessage,
    go, push, pop, resetStack, signIn, signUp, signOut, requestReset,
    deleteAccountAction, refreshFeed, loadMore, toggleLike, toggleSave,
    assistantComment, publish, updateProfile, toggleFollow, setPreferences,
    markNotificationsRead, loadNotifications, refreshThreads, openChat,
    sendMessage, editMessage, deleteMessage, markThreadRead, sharePostToChat,
    shareQuizResult, shareQuizChallenge, openQuiz,
    mergeProfiles, mergePosts, deletePost, toast,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function api_offsets(count: number) {
  return count;
}
