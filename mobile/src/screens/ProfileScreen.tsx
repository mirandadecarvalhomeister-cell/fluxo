import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { AvatarView, EmptyState, GhostButton } from '../components/Ui';
import { colors, gradients, spacing } from '../lib/theme';
import { compactNumber } from '../lib/format';
import { coverImageUri, firstMedia, isVideoPost } from '../lib/media';
import { fetchConnections, fetchUserPosts } from '../lib/api';
import type { Post } from '../types';

const PAGE_SIZE = 12;

export default function ProfileScreen() {
  const { profile, posts, following, online, actions } = useApp();
  const { mergeProfiles } = actions;
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);
  const busyRef = useRef(false);
  const [counts, setCounts] = useState<{ followers: number | null; following: number | null }>({
    followers: null,
    following: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Busca própria e isolada do feed global: inclui posts antigos e pagina a grade.
  const loadProfile = useCallback(async () => {
    if (!online || !profile?.id) return;
    const uid = profile.id;
    busyRef.current = true;
    setDone(false);
    const [followersR, followsR, postsR] = await Promise.allSettled([
      fetchConnections(uid, 'followers'),
      fetchConnections(uid, 'following'),
      fetchUserPosts(uid, uid, 0),
    ]);
    if (followersR.status === 'fulfilled') setCounts((c) => ({ ...c, followers: followersR.value.ids.length }));
    if (followsR.status === 'fulfilled') setCounts((c) => ({ ...c, following: followsR.value.ids.length }));
    if (postsR.status === 'fulfilled') {
      setMyPosts(postsR.value.posts);
      setDone(postsR.value.posts.length < PAGE_SIZE);
      if (postsR.value.profiles.length) mergeProfiles(postsR.value.profiles);
    }
    busyRef.current = false;
  }, [online, profile?.id, mergeProfiles]);

  const loadMore = useCallback(async () => {
    if (!online || !profile?.id || done || busyRef.current) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchUserPosts(profile.id, profile.id, myPosts.length);
      setMyPosts((cur) => {
        const seen = new Set(cur.map((p) => p.id));
        return [...cur, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setDone(page.posts.length < PAGE_SIZE);
      if (page.profiles.length) mergeProfiles(page.profiles);
    } catch {
      setDone(true);
    } finally {
      setLoadingMore(false);
      busyRef.current = false;
    }
  }, [online, profile?.id, myPosts.length, done, mergeProfiles]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }, [loadProfile]);

  // Enquanto a busca própria não chega, usa o que já existe no feed global.
  const mine = myPosts.length ? myPosts : posts.filter((p) => p.authorId === profile?.id);
  const coverUri = coverImageUri(profile?.cover);
  const loadingInitial = online && !myPosts.length && !done;

  const header = (
    <View>
      <View style={styles.cover}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
      </View>

      <View style={styles.profileRow}>
        <View style={styles.avatarWrap}><AvatarView user={profile} size={82} /></View>
        <View style={styles.stats}>
          <Stat label="Posts" value={compactNumber(myPosts.length || posts.filter((p) => p.authorId === profile?.id).length)} />
          <Pressable onPress={() => profile?.id && actions.push({ name: 'connections', userId: profile.id, mode: 'followers' })}><Stat label="Seguidores" value={compactNumber(counts.followers ?? profile?.followers ?? 0)} /></Pressable>
          <Pressable onPress={() => profile?.id && actions.push({ name: 'connections', userId: profile.id, mode: 'following' })}><Stat label="Seguindo" value={compactNumber(counts.following ?? following.length)} /></Pressable>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, gap: 4 }}>
        <Text style={styles.name}>{profile?.name || 'Seu perfil'}</Text>
        {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : <Text style={styles.bioMuted}>Adicione uma bio para as pessoas te conhecerem.</Text>}
        {profile?.city ? <Text style={styles.meta}><Ionicons name="location-outline" size={13} color={colors.muted} /> {profile.city}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginTop: 12 }}>
        <View style={{ flex: 1 }}><GhostButton title="Editar perfil" onPress={() => actions.push({ name: 'editProfile' })} /></View>
        <View style={{ flex: 1 }}><GhostButton title="Quiz BOOM!" icon="flame-outline" onPress={() => actions.openQuiz()} /></View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{profile?.handle ? `@${profile.handle}` : 'Perfil'}</Text>
        <View style={{ flexDirection: 'row' }}>
          <Pressable onPress={() => actions.openQuiz()} style={styles.iconBtn}><Ionicons name="game-controller-outline" size={22} color={colors.text} /></Pressable>
          <Pressable onPress={() => actions.push({ name: 'notifications' })} style={styles.iconBtn}><Ionicons name="notifications-outline" size={22} color={colors.text} /></Pressable>
          <Pressable onPress={() => actions.push({ name: 'settings' })} style={styles.iconBtn}><Ionicons name="settings-outline" size={22} color={colors.text} /></Pressable>
        </View>
      </View>

      <FlatList
        data={mine}
        keyExtractor={(item) => item.id}
        numColumns={3}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          const media = firstMedia(item);
          return (
            <Pressable style={styles.gridItem} onPress={() => (isVideoPost(item) ? actions.push({ name: 'reels', postId: item.id }) : actions.push({ name: 'post', postId: item.id }))}>
              {media?.src ? (
                <Image source={{ uri: media.src }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name={isVideoPost(item) ? 'videocam' : 'image'} size={22} color={colors.faint} />
                </View>
              )}
              {isVideoPost(item) ? <View style={styles.videoMark}><Ionicons name="play" size={12} color="#fff" /></View> : null}
            </Pressable>
          );
        }}
        contentContainerStyle={{ paddingBottom: 30, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        onEndReached={() => { void loadMore(); }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={colors.primary} /> : undefined}
        ListEmptyComponent={loadingInitial ? <ActivityIndicator style={{ margin: 24 }} color={colors.primary} /> : (
          <View style={{ padding: spacing.xl, width: '100%' }}>
            <EmptyState icon="person-circle-outline" title="Nenhuma publicação" text="Compartilhe suas primeiras fotos e vídeos." />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontWeight: '900', fontSize: 18 }}>{value}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', height: 140, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: spacing.lg, marginTop: -38 },
  avatarWrap: { borderRadius: 46, borderWidth: 4, borderColor: colors.bg, overflow: 'hidden' },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 30 },
  name: { color: colors.text, fontSize: 17, fontWeight: '800' },
  bio: { color: colors.text, lineHeight: 20 },
  bioMuted: { color: colors.muted },
  meta: { color: colors.muted, marginTop: 2 },
  row: { paddingHorizontal: 1, gap: 1 },
  gridItem: { width: '33.333%', aspectRatio: 1 },
  videoMark: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: 4 },
});
