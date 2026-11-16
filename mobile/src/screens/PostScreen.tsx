import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, EmptyState, GhostButton } from '../components/Ui';
import { colors, spacing } from '../lib/theme';
import { compactNumber, timeAgo } from '../lib/format';
import { isVideoPost, mediaOf } from '../lib/media';
import { sharePostLink } from '../lib/share';

export default function PostScreen({ postId }: { postId: string }) {
  const { posts, users, actions } = useApp();
  const post = posts.find((p) => p.id === postId);
  const author = post ? users[post.authorId] : null;

  useEffect(() => {
    if (post && isVideoPost(post)) {
      actions.pop();
      actions.push({ name: 'reels', postId: post.id });
    }
  }, [post?.id]);

  if (!post) {
    return (
      <SafeAreaView style={styles.root}>
        <StackHeader title="Publicação" />
        <EmptyState icon="image-outline" title="Publicação não encontrada" text="Ela pode ter sido removida." />
      </SafeAreaView>
    );
  }

  const media = mediaOf(post);

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title="Publicação" />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.authorRow}>
          <AvatarView user={author} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{author?.name || 'Usuário'}</Text>
            <Text style={styles.meta}>@{author?.handle || 'fluxo'} · {timeAgo(post.createdAt)}</Text>
          </View>
        </View>
        {post.text ? <Text style={styles.text}>{post.text}</Text> : null}
        {media.map((m, i) => (
          <View key={i} style={styles.mediaWrap}>
            {m.kind === 'photo' && m.src ? (
              <Image source={{ uri: m.src }} style={styles.media} contentFit="cover" />
            ) : m.src ? (
              <View style={[styles.media, styles.stub]}><Ionicons name="videocam" size={30} color={colors.muted} /><Text style={{ color: colors.muted }}>Vídeo</Text></View>
            ) : null}
          </View>
        ))}
        <View style={styles.actions}>
          <GhostButton title={`${compactNumber(post.likes)}`} icon={post.liked ? 'heart' : 'heart-outline'} onPress={() => actions.toggleLike(post)} />
          <GhostButton title={`${compactNumber(post.commentCount)}`} icon="chatbubble-outline" onPress={() => actions.push({ name: 'comments', postId: post.id })} />
          <GhostButton title="Enviar" icon="paper-plane-outline" onPress={() => actions.push({ name: 'shareToChat', postId: post.id })} />
          <GhostButton title="Compartilhar" icon="share-outline" onPress={() => sharePostLink(post.id, post.text)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.lg },
  name: { color: colors.text, fontWeight: '800', fontSize: 16 },
  meta: { color: colors.muted, fontSize: 12 },
  text: { color: colors.text, fontSize: 16, lineHeight: 22, paddingHorizontal: spacing.lg, paddingBottom: 12 },
  mediaWrap: { width: '100%', aspectRatio: 4 / 5, backgroundColor: colors.surfaceAlt, marginBottom: 8 },
  media: { width: '100%', height: '100%' },
  stub: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: spacing.lg },
});
