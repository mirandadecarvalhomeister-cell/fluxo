import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useApp } from '../context/AppContext';
import { AvatarView, EmptyState, GhostButton } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { firstMedia, isVideoPost } from '../lib/media';
import { searchWorkspace } from '../lib/api';
import type { Post, Profile } from '../types';

export default function ExploreScreen() {
  const { posts, users, profile, online, actions } = useApp();
  const { mergePosts, mergeProfiles } = actions;
  const [q, setQ] = useState('');
  const [remotePeople, setRemotePeople] = useState<Profile[]>([]);
  const [remotePosts, setRemotePosts] = useState<Post[]>([]);
  const [searching, setSearching] = useState(false);
  const requestRef = useRef(0);
  const query = q.trim().toLowerCase();

  // Busca no servidor (todas as publicações/perfis, não só o feed carregado).
  useEffect(() => {
    const term = q.trim();
    if (!term || !online || !profile?.id) {
      setRemotePeople([]);
      setRemotePosts([]);
      setSearching(false);
      return;
    }
    const request = ++requestRef.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const result = await searchWorkspace(term, profile.id);
        if (request !== requestRef.current) return;
        setRemotePeople(result.profiles);
        setRemotePosts(result.posts);
        if (result.posts.length) mergePosts(result.posts);
        if (result.profiles.length) mergeProfiles(result.profiles);
      } catch {
        if (request === requestRef.current) {
          setRemotePeople([]);
          setRemotePosts([]);
        }
      } finally {
        if (request === requestRef.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [q, online, profile?.id, mergePosts, mergeProfiles]);

  const people = useMemo(() => {
    if (query && remotePeople.length) return remotePeople;
    const list = Object.values(users);
    if (!query) return list.slice(0, 20);
    return list
      .filter((u) => [u.name, u.handle, u.city, ...(u.interests || [])].join(' ').toLowerCase().includes(query))
      .slice(0, 30);
  }, [users, remotePeople, query]);

  const foundPosts = useMemo(() => {
    if (query && remotePosts.length) return remotePosts;
    if (!query) return posts;
    return posts.filter((p) => p.text.toLowerCase().includes(query));
  }, [posts, remotePosts, query]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Explorar</Text>
        <GhostButton title="Quiz BOOM!" icon="game-controller-outline" onPress={() => actions.openQuiz()} style={{ minHeight: 36, paddingHorizontal: 12 }} />
      </View>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar pessoas e publicações" placeholderTextColor={colors.faint} style={styles.search} />
      </View>

      <FlatList
        data={foundPosts}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={{ padding: 2, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ padding: spacing.md, gap: 10 }}>
            <Text style={styles.section}>Pessoas</Text>
            <FlatList
              data={people}
              horizontal
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
              renderItem={({ item }) => (
                <Pressable style={styles.person} onPress={() => actions.push({ name: 'user', userId: item.id })}>
                  <AvatarView user={item} size={56} />
                  <Text style={styles.personName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.personHandle} numberOfLines={1}>@{item.handle}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={{ color: colors.muted }}>Nenhuma pessoa encontrada.</Text>}
            />
            <Text style={[styles.section, { marginTop: 6 }]}>Publicações</Text>
            {searching ? <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        }
        renderItem={({ item }) => {
          const media = firstMedia(item);
          return (
            <Pressable style={styles.cell} onPress={() => (isVideoPost(item) ? actions.push({ name: 'reels', postId: item.id }) : actions.push({ name: 'post', postId: item.id }))}>
              {media?.src ? (
                <Image source={{ uri: media.src }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name={isVideoPost(item) ? 'videocam' : 'text'} size={20} color={colors.faint} />
                </View>
              )}
              {isVideoPost(item) ? <Ionicons name="play" size={14} color="#fff" style={styles.playIcon} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState icon="compass-outline" title="Nada por aqui" text="Tente outra busca ou volte mais tarde." />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 10 },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, marginBottom: 8, paddingHorizontal: 12, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.text },
  section: { color: colors.text, fontWeight: '800', fontSize: 16 },
  person: { width: 100, alignItems: 'center', gap: 4, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  personName: { color: colors.text, fontWeight: '700', fontSize: 12 },
  personHandle: { color: colors.muted, fontSize: 11 },
  cell: { flex: 1 / 3, aspectRatio: 1, margin: 1, backgroundColor: colors.surfaceAlt },
  playIcon: { position: 'absolute', top: 6, right: 6 },
});
