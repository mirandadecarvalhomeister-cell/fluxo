import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, EmptyState, GhostButton, PrimaryButton } from '../components/Ui';
import { colors, gradients, spacing } from '../lib/theme';
import { compactNumber } from '../lib/format';
import { coverImageUri, firstMedia, isVideoPost } from '../lib/media';
import { fetchConnections, fetchUserPosts } from '../lib/api';
import type { Post } from '../types';

const PAGE_SIZE = 12;

export default function UserScreen({ userId }: { userId: string }) {
  const { users, following, profile, online, actions } = useApp();
  const { mergeProfiles } = actions;
  const user = users[userId];
  const mine = profile?.id === userId;
  const isFollowing = following.includes(userId);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [done, setDone] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const busyRef = useRef(false);
  const [counts, setCounts] = useState<{ followers: number | null; following: number | null }>({
    followers: null,
    following: null,
  });

  // Contadores e grade vêm do backend (não do feed global, que é limitado).
  const load = useCallback(async (offset: number, reset: boolean) => {
    if (!online || !userId) return;
    if (busyRef.current) return;
    busyRef.current = true;
    if (reset) { setLoading(true); setDone(false); }
    else setLoadingMore(true);
    try {
      const [followers, follows, page] = await Promise.all([
        fetchConnections(userId, 'followers'),
        fetchConnections(userId, 'following'),
        fetchUserPosts(userId, profile?.id || userId, offset),
      ]);
      setCounts({ followers: followers.ids.length, following: follows.ids.length });
      setUserPosts((cur) => {
        const base = reset ? [] : cur;
        const seen = new Set(base.map((p) => p.id));
        return [...base, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setDone(page.posts.length < PAGE_SIZE);
      if (page.profiles.length) mergeProfiles(page.profiles);
    } catch {
      setCounts({ followers: null, following: null });
      if (reset) setDone(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      busyRef.current = false;
    }
  }, [userId, online, profile?.id, mergeProfiles]);

  useEffect(() => {
    setUserPosts([]);
    void load(0, true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!done && !loading && !busyRef.current) void load(userPosts.length, false);
  }, [done, loading, userPosts.length, load]);

  if (!user) {
    return <SafeAreaView style={styles.root}><StackHeader title="Perfil" /><EmptyState icon="person-outline" title="Usuário não encontrado" /></SafeAreaView>;
  }

  const coverUri = coverImageUri(user.cover);

  const header = (
    <View>
      <View style={styles.cover}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
      </View>
      <View style={[styles.profileRow, { marginTop: -30 }]}>
        <View style={styles.avatarWrap}><AvatarView user={user} size={82} /></View>
        <View style={styles.stats}>
          <Stat label="Posts" value={compactNumber(userPosts.length)} />
          <Pressable onPress={() => actions.push({ name: 'connections', userId, mode: 'followers' })}><Stat label="Seguidores" value={compactNumber(counts.followers ?? user.followers ?? 0)} /></Pressable>
          <Pressable onPress={() => actions.push({ name: 'connections', userId, mode: 'following' })}><Stat label="Seguindo" value={counts.following == null ? '—' : compactNumber(counts.following)} /></Pressable>
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.lg, gap: 4 }}>
        <Text style={styles.name}>{user.name}</Text>
        {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
        {user.city ? <Text style={styles.meta}><Ionicons name="location-outline" size={13} color={colors.muted} /> {user.city}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginTop: 12 }}>
        {mine ? (
          <View style={{ flex: 1 }}><GhostButton title="Editar perfil" onPress={() => actions.push({ name: 'editProfile' })} /></View>
        ) : (
          <>
            <View style={{ flex: 1 }}><PrimaryButton title={isFollowing ? 'Seguindo' : 'Seguir'} onPress={() => actions.toggleFollow(userId)} /></View>
            <View style={{ flex: 1 }}><GhostButton title="Mensagem" icon="chatbubble-outline" onPress={() => actions.push({ name: 'chat', userId })} /></View>
          </>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title={user.handle ? `@${user.handle}` : user.name} />
      <FlatList
        data={userPosts}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const media = firstMedia(item);
          return (
            <Pressable style={styles.gridItem} onPress={() => (isVideoPost(item) ? actions.push({ name: 'reels', postId: item.id }) : actions.push({ name: 'post', postId: item.id }))}>
              {media?.src ? <Image source={{ uri: media.src }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="image" size={22} color={colors.faint} /></View>}
              {isVideoPost(item) ? <View style={styles.videoMark}><Ionicons name="play" size={12} color="#fff" /></View> : null}
            </Pressable>
          );
        }}
        contentContainerStyle={{ paddingBottom: 30 }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={colors.primary} /> : undefined}
        ListEmptyComponent={loading ? <ActivityIndicator style={{ margin: 24 }} color={colors.primary} /> : (
          <View style={{ padding: spacing.xl, width: '100%' }}><EmptyState icon="images-outline" title="Sem publicações" /></View>
        )}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={{ alignItems: 'center' }}><Text style={{ color: colors.text, fontWeight: '900', fontSize: 18 }}>{value}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  cover: { width: '100%', height: 140, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: spacing.lg },
  avatarWrap: { borderRadius: 46, borderWidth: 4, borderColor: colors.bg, overflow: 'hidden' },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 30 },
  name: { color: colors.text, fontSize: 17, fontWeight: '800' },
  bio: { color: colors.text, lineHeight: 20 },
  meta: { color: colors.muted, marginTop: 2 },
  row: { paddingHorizontal: 1, gap: 1 },
  gridItem: { width: '33.333%', aspectRatio: 1 },
  videoMark: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: 4 },
});
