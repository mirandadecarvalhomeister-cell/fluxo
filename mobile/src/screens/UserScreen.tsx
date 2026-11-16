import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, EmptyState, GhostButton, PrimaryButton } from '../components/Ui';
import { colors, spacing } from '../lib/theme';
import { compactNumber } from '../lib/format';
import { firstMedia, isVideoPost } from '../lib/media';
import { fetchConnections, fetchUserPosts } from '../lib/api';

export default function UserScreen({ userId }: { userId: string }) {
  const { users, posts, following, profile, online, actions } = useApp();
  const { mergePosts, mergeProfiles } = actions;
  const user = users[userId];
  const mine = profile?.id === userId;
  const isFollowing = following.includes(userId);
  const userPosts = useMemo(() => posts.filter((p) => p.authorId === userId), [posts, userId]);
  const [counts, setCounts] = useState<{ followers: number | null; following: number | null }>({
    followers: null,
    following: null,
  });

  // Contadores reais derivados da tabela follows (o campo profiles.followers
  // não é mantido por trigger em todos os ambientes).
  useEffect(() => {
    let active = true;
    if (!online || !userId) {
      setCounts({ followers: null, following: null });
      return;
    }
    Promise.all([
      fetchConnections(userId, 'followers'),
      fetchConnections(userId, 'following'),
      fetchUserPosts(userId, profile?.id || userId),
    ])
      .then(([followers, follows, page]) => {
        if (!active) return;
        setCounts({ followers: followers.ids.length, following: follows.ids.length });
        if (page.posts.length) mergePosts(page.posts);
        if (page.profiles.length) mergeProfiles(page.profiles);
      })
      .catch(() => {
        if (active) setCounts({ followers: null, following: null });
      });
    return () => {
      active = false;
    };
  }, [userId, online, isFollowing, profile?.id, mergePosts, mergeProfiles]);

  if (!user) {
    return <SafeAreaView style={styles.root}><StackHeader title="Perfil" /><EmptyState icon="person-outline" title="Usuário não encontrado" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title={user.handle ? `@${user.handle}` : user.name} />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.profileRow}>
          <AvatarView user={user} size={82} />
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
        <View style={styles.grid}>
          {userPosts.length ? userPosts.map((post) => {
            const media = firstMedia(post);
            return (
              <Pressable key={post.id} style={styles.gridItem} onPress={() => (isVideoPost(post) ? actions.push({ name: 'reels', postId: post.id }) : actions.push({ name: 'post', postId: post.id }))}>
                {media?.src ? <Image source={{ uri: media.src }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} />}
              </Pressable>
            );
          }) : <View style={{ padding: spacing.xl, width: '100%' }}><EmptyState icon="images-outline" title="Sem publicações" /></View>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={{ alignItems: 'center' }}><Text style={{ color: colors.text, fontWeight: '900', fontSize: 18 }}>{value}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: spacing.lg },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  name: { color: colors.text, fontSize: 17, fontWeight: '800' },
  bio: { color: colors.text, lineHeight: 20 },
  meta: { color: colors.muted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, paddingHorizontal: 1 },
  gridItem: { width: '33.333%', aspectRatio: 1, padding: 1 },
});
