import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useApp } from '../context/AppContext';
import { AvatarView, EmptyState, GhostButton } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { compactNumber } from '../lib/format';
import { firstMedia, isVideoPost } from '../lib/media';
import { fetchConnections, fetchUserPosts } from '../lib/api';

export default function ProfileScreen() {
  const { profile, posts, following, online, actions } = useApp();
  const { mergePosts, mergeProfiles } = actions;
  const mine = useMemo(() => posts.filter((p) => p.authorId === profile?.id), [posts, profile?.id]);
  const [counts, setCounts] = useState<{ followers: number | null; following: number | null }>({
    followers: null,
    following: null,
  });

  // Contadores reais e publicações do perfil (inclui posts antigos fora do feed).
  useEffect(() => {
    let active = true;
    if (!online || !profile?.id) return;
    const uid = profile.id;
    Promise.all([fetchConnections(uid, 'followers'), fetchConnections(uid, 'following'), fetchUserPosts(uid, uid)])
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
  }, [online, profile?.id, following.length, mergePosts, mergeProfiles]);

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

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.profileRow}>
          <AvatarView user={profile} size={82} />
          <View style={styles.stats}>
            <Stat label="Posts" value={compactNumber(mine.length)} />
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

        <View style={styles.grid}>
          {mine.length ? mine.map((post) => {
            const media = firstMedia(post);
            return (
              <Pressable key={post.id} style={styles.gridItem} onPress={() => (isVideoPost(post) ? actions.push({ name: 'reels', postId: post.id }) : actions.push({ name: 'post', postId: post.id }))}>
                {media?.src ? (
                  <Image source={{ uri: media.src }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name={isVideoPost(post) ? 'videocam' : 'image'} size={22} color={colors.faint} />
                  </View>
                )}
                {isVideoPost(post) ? <View style={styles.videoMark}><Ionicons name="play" size={12} color="#fff" /></View> : null}
              </Pressable>
            );
          }) : (
            <View style={{ padding: spacing.xl, width: '100%' }}>
              <EmptyState icon="person-circle-outline" title="Nenhuma publicação" text="Compartilhe suas primeiras fotos e vídeos." />
            </View>
          )}
        </View>
      </ScrollView>
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
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: spacing.lg },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  name: { color: colors.text, fontSize: 17, fontWeight: '800' },
  bio: { color: colors.text, lineHeight: 20 },
  bioMuted: { color: colors.muted },
  meta: { color: colors.muted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, paddingHorizontal: 1 },
  gridItem: { width: '33.333%', aspectRatio: 1, padding: 1 },
  videoMark: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, padding: 4 },
});
