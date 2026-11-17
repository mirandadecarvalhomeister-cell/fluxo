import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../context/AppContext';
import ReactionBar from '../components/ReactionBar';
import FeedVideo from '../components/FeedVideo';
import Interactive from '../components/Interactive';
import { AvatarView, EmptyState, IconButton } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { compactNumber, timeAgo } from '../lib/format';
import { firstMedia, isVideoPost } from '../lib/media';
import { postLink, sharePostLink } from '../lib/share';
import { fetchFollowingPage } from '../lib/api';
import type { Post } from '../types';

const { height: SCREEN_H } = Dimensions.get('window');
const PREVIEW_CHARS = 170;

function MenuItem({ icon, label, danger, onPress }: { icon: any; label: string; danger?: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? colors.pink : colors.text} />
      <Text style={[styles.menuText, danger && { color: colors.pink }]}>{label}</Text>
    </Pressable>
  );
}

function PostCard({ post }: { post: Post }) {
  const { profile, users, following, actions } = useApp();
  const author = users[post.authorId];
  const media = firstMedia(post);
  const video = isVideoPost(post);
  const mine = profile?.id === post.authorId;
  const isFollowing = following.includes(post.authorId);
  const [showMenu, setShowMenu] = useState(false);
  const [expandedText, setExpandedText] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);

  const long = post.text.length > PREVIEW_CHARS;
  const shownText = long && !expandedText ? `${post.text.slice(0, PREVIEW_CHARS).trimEnd()}…` : post.text;
  const topic = post.text.split(/\s+/).find((w) => w.length > 5)?.replace(/[^\p{L}\p{N}]/gu, '') || '';

  const close = () => setShowMenu(false);
  const act = (fn: () => void) => () => { close(); fn(); };
  const copyLink = async () => {
    close();
    try { await Clipboard.setStringAsync(postLink(post.id)); actions.toast('Link copiado!'); }
    catch { actions.toast('Não foi possível copiar o link.'); }
  };
  const saveEdit = async () => {
    if (!editText.trim()) return;
    setEditing(false);
    await actions.editPost(post.id, editText.trim());
  };

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <Pressable style={styles.author} onPress={() => actions.push({ name: 'user', userId: post.authorId })}>
            <AvatarView user={author} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{author?.name || 'Usuário'}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {author?.handle ? `@${author.handle}` : ''} · {timeAgo(post.createdAt)}
              </Text>
            </View>
          </Pressable>
          <IconButton name="ellipsis-horizontal" onPress={() => setShowMenu(true)} />
        </View>

        {post.text ? (
          <View style={styles.textWrap}>
            <Text style={styles.text} numberOfLines={expandedText ? undefined : 3}>{shownText}</Text>
            {long ? (
              <Pressable onPress={() => setExpandedText((v) => !v)} hitSlop={6}>
                <Text style={styles.readMore}>{expandedText ? 'Ler menos' : 'Ler mais'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {post.interactive?.format !== 'imageVote' && media ? (
          <View style={styles.mediaWrap}>
            {media.kind === 'photo' && media.src ? (
              <Pressable style={StyleSheet.absoluteFill} onPress={() => actions.push({ name: 'post', postId: post.id })}>
                <Image source={{ uri: media.src }} style={styles.mediaFit} contentFit="cover" />
              </Pressable>
            ) : media.src && video ? (
              <FeedVideo src={media.src} postId={post.id} seed={media.seed ?? undefined} />
            ) : (
              <View style={[styles.mediaFit, styles.videoStub]}>
                <Ionicons name={video ? 'videocam' : 'image'} size={40} color={colors.muted} />
              </View>
            )}
            {video ? (
              <View style={styles.playBadge} pointerEvents="none">
                <Ionicons name="play" size={14} color="#fff" />
                <Text style={styles.playBadgeText}>Clips</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Interactive post={post} compact />

        <View style={styles.actions}>
          <ReactionBar post={post} compact />
          <Action icon="chatbubble-outline" label={compactNumber(post.commentCount)} onPress={() => actions.push({ name: 'comments', postId: post.id })} />
          <Action icon="paper-plane-outline" label="Enviar" onPress={() => actions.push({ name: 'shareToChat', postId: post.id })} />
          <Action icon="share-outline" label="Compartilhar" onPress={() => sharePostLink(post.id, post.text)} />
          <View style={{ flex: 1 }} />
          <Action icon={post.saved ? 'bookmark' : 'bookmark-outline'} color={post.saved ? colors.cyan : colors.text} label="" onPress={() => actions.toggleSave(post)} />
        </View>
      </View>

      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={close}>
        <TouchableWithoutFeedback onPress={close}>
          <View style={styles.modalBackdrop}>
            <View style={styles.postMenu}>
              <ScrollView style={{ maxHeight: '75%' }}>
                {mine ? (
                  <>
                    <MenuItem icon="create-outline" label="Editar publicação" onPress={act(() => { setEditText(post.text); setEditing(true); })} />
                    <MenuItem
                      icon="chatbubble-outline"
                      label={post.commentsDisabled ? 'Ativar comentários' : 'Desativar comentários'}
                      onPress={act(() => actions.toggleCommentsDisabled(post.id))}
                    />
                    <MenuItem icon="paper-plane-outline" label="Compartilhar com alguém" onPress={act(() => actions.push({ name: 'shareToChat', postId: post.id }))} />
                    <MenuItem icon="link-outline" label="Copiar link" onPress={() => void copyLink()} />
                    <MenuItem icon="trash-outline" label="Excluir publicação" danger onPress={act(() => actions.deletePost(post.id))} />
                  </>
                ) : (
                  <>
                    <MenuItem icon="eye-off-outline" label="Não tenho interesse" onPress={act(() => actions.feedFeedback(post.id, 'notInterested'))} />
                    <MenuItem icon="remove-circle-outline" label="Mostrar menos conteúdos assim" onPress={act(() => actions.feedFeedback(post.id, 'lessLike'))} />
                    {topic ? <MenuItem icon="filter-outline" label={`Silenciar “${topic}”`} onPress={act(() => actions.feedFeedback(post.id, 'muteTopic', topic))} /> : null}
                    <MenuItem icon="person-remove-outline" label="Ocultar publicações deste perfil" onPress={act(() => actions.feedFeedback(post.id, 'hideProfile'))} />
                    {isFollowing ? <MenuItem icon="person-outline" label={`Deixar de seguir ${(author?.name || '').split(' ')[0]}`} onPress={act(() => actions.toggleFollow(post.authorId))} /> : null}
                    <MenuItem icon="paper-plane-outline" label="Compartilhar com alguém" onPress={act(() => actions.push({ name: 'shareToChat', postId: post.id }))} />
                    <MenuItem icon="link-outline" label="Copiar link" onPress={() => void copyLink()} />
                    <MenuItem icon={post.saved ? 'bookmark' : 'bookmark-outline'} label={post.saved ? 'Remover dos salvos' : 'Salvar'} onPress={act(() => actions.toggleSave(post))} />
                    <MenuItem icon="shield-outline" label="Denunciar publicação" danger onPress={act(() => actions.toast('Publicação sinalizada. Obrigado por ajudar.'))} />
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <TouchableWithoutFeedback onPress={() => setEditing(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.postMenu}>
              <Text style={styles.editTitle}>Editar publicação</Text>
              <TextInput value={editText} onChangeText={setEditText} multiline style={styles.editInput} placeholderTextColor={colors.faint} />
              <Pressable onPress={() => void saveEdit()} style={styles.saveBtn}><Text style={styles.saveText}>Salvar</Text></Pressable>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

function Action({ icon, label, onPress, color = colors.text }: { icon: any; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.actionBtn} hitSlop={6}>
      <Ionicons name={icon} size={22} color={color} />
      {label ? <Text style={styles.actionLabel}>{label}</Text> : null}
    </Pressable>
  );
}

const FEED_PAGE_SIZE = 12;

export default function HomeScreen() {
  const { posts, feedLoading, feedRefreshing, feedDone, actions, setActiveVideoId, following, profile, online, prefs } = useApp();
  const [mode, setMode] = useState<'all' | 'following'>('all');
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingLoadingMore, setFollowingLoadingMore] = useState(false);
  const [followingDone, setFollowingDone] = useState(false);
  const followingBusy = useRef(false);
  const { mergeProfiles } = actions;

  const loadFollowing = useCallback(async (offset: number, reset: boolean) => {
    if (!online || !profile?.id || followingBusy.current) return;
    followingBusy.current = true;
    if (reset) { setFollowingLoading(true); setFollowingDone(false); }
    else setFollowingLoadingMore(true);
    try {
      const page = await fetchFollowingPage(profile.id, following, offset);
      setFollowingPosts((cur) => {
        const base = reset ? [] : cur;
        const seen = new Set(base.map((p) => p.id));
        return [...base, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setFollowingDone(page.posts.length < FEED_PAGE_SIZE);
      if (page.profiles.length) mergeProfiles(page.profiles);
    } catch {
      setFollowingDone(true);
    } finally {
      setFollowingLoading(false);
      setFollowingLoadingMore(false);
      followingBusy.current = false;
    }
  }, [online, profile?.id, following, mergeProfiles]);

  useEffect(() => {
    if (mode === 'following') {
      setFollowingPosts([]);
      void loadFollowing(0, true);
    }
  }, [mode, loadFollowing]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 65 }).current;
  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    const visibleVideoId = (viewableItems || [])
      .map((v: any) => v.item as Post)
      .find((p: Post) => p && isVideoPost(p) && firstMedia(p)?.src)?.id || null;
    setActiveVideoId(visibleVideoId);
  }, [setActiveVideoId]);

  const renderItem = useCallback(({ item }: { item: Post }) => <PostCard post={item} />, []);

  // Filtros locais do menu "3 pontinhos" (mesmo comportamento do site).
  const filterPosts = useCallback((list: Post[]) => list.filter((post) => {
    if (prefs.hiddenPosts.includes(post.id)) return false;
    if (prefs.hiddenProfiles.includes(post.authorId)) return false;
    const text = String(post.text || '').toLowerCase();
    if (prefs.mutedTopics.some((topic) => text.includes(topic.toLowerCase()))) return false;
    return true;
  }), [prefs.hiddenPosts, prefs.hiddenProfiles, prefs.mutedTopics]);

  const rawData = mode === 'following' ? followingPosts : posts;
  const data = useMemo(() => filterPosts(rawData), [rawData, filterPosts]);
  const loading = mode === 'following' ? followingLoading : feedLoading;
  const loadingMore = mode === 'following' ? followingLoadingMore : (!feedDone && posts.length > 0);
  const onEndReached = () => {
    if (mode === 'following') { if (!followingDone) void loadFollowing(followingPosts.length, false); }
    else if (!feedDone) actions.loadMore();
  };
  const onRefresh = () => {
    if (mode === 'all') void actions.refreshFeed();
    else void loadFollowing(0, true);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <Image source={require('../../assets/fluxo-logo.png')} style={styles.brandLogo} contentFit="contain" />
          <Text style={styles.logo}>Fluxo</Text>
        </View>
        <Pressable onPress={() => actions.openQuiz()} style={styles.gamesTab} hitSlop={4} accessibilityLabel="Abrir jogos">
          <Ionicons name="game-controller" size={15} color={colors.primary} />
          <Text style={styles.gamesTabText}>JOGOS</Text>
        </Pressable>
        <View style={{ flexDirection: 'row' }}>
          <IconButton name="notifications-outline" label="Notificações" onPress={() => actions.push({ name: 'notifications' })} />
          <IconButton name="settings-outline" label="Configurações" onPress={() => actions.push({ name: 'settings' })} />
        </View>
      </View>

      <View style={styles.feedModes}>
        {(['all', 'following'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setMode(value)}
            style={[styles.modeBtn, mode === value && styles.modeBtnActive]}
          >
            <Text style={[styles.modeText, mode === value && styles.modeTextActive]}>
              {value === 'all' ? 'Para você' : 'Seguindo'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={mode === 'all' ? feedRefreshing : followingLoading} onRefresh={onRefresh} tintColor={colors.primary} />}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState icon="images-outline" title={mode === 'following' ? 'Nada por aqui ainda' : 'Seu feed está vazio'} text={mode === 'following' ? 'Siga pessoas para ver as publicações delas.' : 'Siga pessoas ou crie sua primeira publicação.'} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={colors.primary} /> : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandLogo: { width: 30, height: 30 },
  logo: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  gamesTab: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, marginLeft: 6 },
  gamesTabText: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  feedModes: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: 6, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surfaceAlt },
  modeBtnActive: { backgroundColor: colors.primary },
  modeText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  modeTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: 8 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  name: { color: colors.text, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12 },
  textWrap: { paddingHorizontal: spacing.lg, gap: 2 },
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
  readMore: { color: colors.cyan, fontSize: 13, fontWeight: '700' },
  mediaWrap: { width: '100%', maxHeight: SCREEN_H * 0.62, minHeight: 220, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  mediaFit: { width: '100%', height: '100%', minHeight: 220 },
  videoStub: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#11131d', gap: 6 },
  playBadge: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  playBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 4 },
  actionLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  postMenu: { width: '82%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 6, gap: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: radius.lg },
  menuText: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  editTitle: { color: colors.text, fontSize: 17, fontWeight: '900', padding: 10 },
  editInput: { minHeight: 110, color: colors.text, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' },
  saveBtn: { marginTop: 8, padding: 14, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800' },
});
