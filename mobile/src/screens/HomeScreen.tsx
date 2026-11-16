import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { AvatarView, EmptyState, IconButton } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { compactNumber, timeAgo } from '../lib/format';
import { firstMedia, isVideoPost } from '../lib/media';
import { sharePostLink } from '../lib/share';
import type { Post } from '../types';

function PostCard({ post }: { post: Post }) {
  const { users, actions } = useApp();
  const author = users[post.authorId];
  const media = firstMedia(post);
  const video = isVideoPost(post);

  return (
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
        <IconButton name="ellipsis-horizontal" onPress={() => {}} />
      </View>

      {post.text ? <Text style={styles.text}>{post.text}</Text> : null}

      {media ? (
        <Pressable
          onPress={() => (video ? actions.push({ name: 'reels', postId: post.id }) : actions.push({ name: 'post', postId: post.id }))}
          style={styles.mediaWrap}
        >
          {media.kind === 'photo' && media.src ? (
            <Image source={{ uri: media.src }} style={styles.media} contentFit="cover" />
          ) : media.src ? (
            <View style={[styles.media, styles.videoStub]}>
              <Ionicons name="play-circle" size={54} color="#fff" />
              <Text style={styles.videoLabel}>Vídeo</Text>
            </View>
          ) : (
            <View style={[styles.media, styles.videoStub]}>
              <Ionicons name={video ? 'videocam' : 'image'} size={40} color={colors.muted} />
            </View>
          )}
          {video ? (
            <View style={styles.playBadge}>
              <Ionicons name="play" size={14} color="#fff" />
              <Text style={styles.playBadgeText}>Reels</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <Action icon={post.liked ? 'heart' : 'heart-outline'} color={post.liked ? colors.pink : colors.text} label={compactNumber(post.likes)} onPress={() => actions.toggleLike(post)} />
        <Action icon="chatbubble-outline" label={compactNumber(post.commentCount)} onPress={() => actions.push({ name: 'comments', postId: post.id })} />
        <Action icon="paper-plane-outline" label="Enviar" onPress={() => actions.push({ name: 'shareToChat', postId: post.id })} />
        <Action icon="share-outline" label="Compartilhar" onPress={() => sharePostLink(post.id, post.text)} />
        <View style={{ flex: 1 }} />
        <Action icon={post.saved ? 'bookmark' : 'bookmark-outline'} color={post.saved ? colors.cyan : colors.text} label="" onPress={() => actions.toggleSave(post)} />
      </View>
    </View>
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

export default function HomeScreen() {
  const { posts, feedLoading, feedRefreshing, feedDone, actions } = useApp();

  const renderItem = useCallback(({ item }: { item: Post }) => <PostCard post={item} />, []);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>Fluxo</Text>
        <View style={{ flexDirection: 'row' }}>
          <IconButton name="notifications-outline" label="Notificações" onPress={() => actions.push({ name: 'notifications' })} />
          <IconButton name="settings-outline" label="Configurações" onPress={() => actions.push({ name: 'settings' })} />
        </View>
      </View>
      {feedLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={feedRefreshing} onRefresh={actions.refreshFeed} tintColor={colors.primary} />}
          onEndReached={() => { if (!feedDone) actions.loadMore(); }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState icon="images-outline" title="Seu feed está vazio" text="Siga pessoas ou crie sua primeira publicação." />}
          ListFooterComponent={!feedDone && posts.length ? <ActivityIndicator style={{ margin: 16 }} color={colors.primary} /> : undefined}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logo: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: 8 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  name: { color: colors.text, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12 },
  text: { color: colors.text, fontSize: 15, lineHeight: 21, paddingHorizontal: spacing.lg },
  mediaWrap: { width: '100%', aspectRatio: 4 / 5, backgroundColor: colors.surfaceAlt },
  media: { width: '100%', height: '100%' },
  videoStub: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#11131d', gap: 6 },
  videoLabel: { color: colors.muted, fontWeight: '700' },
  playBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  playBadgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 4 },
  actionLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
