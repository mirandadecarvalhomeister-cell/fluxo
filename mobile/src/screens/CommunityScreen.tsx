import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, EmptyState, GhostButton, PrimaryButton } from '../components/Ui';
import { colors, gradients, radius, spacing } from '../lib/theme';
import { compactNumber, timeAgo } from '../lib/format';
import { firstMedia, isVideoPost } from '../lib/media';
import { fetchCommunities, fetchCommunityPosts, setCommunityMembership } from '../lib/api';
import type { Community, Post } from '../types';
import {
  CommunityGallery, CommunityAnnouncements, CommunityEvents, CommunityClassifieds,
} from '../components/CommunitySections';

type Tab = 'posts' | 'gallery' | 'announcements' | 'events' | 'classifieds';
const TABS: Array<[Tab, string]> = [
  ['posts', 'Publicações'],
  ['gallery', 'Galeria'],
  ['announcements', 'Comunicados'],
  ['events', 'Eventos'],
  ['classifieds', 'Classificados'],
];

const PAGE_SIZE = 12;

export default function CommunityScreen({ communityId }: { communityId: string }) {
  const { profile, online, users, actions } = useApp();
  const [community, setCommunity] = useState<Community | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('posts');
  const busyRef = useRef(false);

  const load = useCallback(async (offset: number, reset: boolean) => {
    if (!profile?.id || !online || busyRef.current) return;
    busyRef.current = true;
    if (reset) { setLoading(true); setDone(false); }
    else setLoadingMore(true);
    try {
      const [communities, page] = await Promise.all([
        fetchCommunities(profile.id),
        fetchCommunityPosts(communityId, profile.id, offset),
      ]);
      setCommunity(communities.find((c) => c.id === communityId) || null);
      setPosts((cur) => {
        const base = reset ? [] : cur;
        const seen = new Set(base.map((p) => p.id));
        return [...base, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setDone(page.posts.length < PAGE_SIZE);
      if (page.profiles.length) actions.mergeProfiles(page.profiles);
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
      busyRef.current = false;
    }
  }, [communityId, profile?.id, online, actions]);

  useEffect(() => {
    setPosts([]);
    void load(0, true);
  }, [load]);

  const toggleJoin = async () => {
    if (!community || !profile?.id || busy) return;
    setBusy(true);
    try {
      await setCommunityMembership(community.id, profile.id, !community.joined);
      setCommunity((c) => c ? { ...c, joined: !c.joined, members: Math.max(0, c.members + (c.joined ? -1 : 1)) } : c);
      actions.toast(community.joined ? 'Você saiu da comunidade.' : 'Você entrou na comunidade!');
    } catch (e: any) {
      actions.toast(e?.message || 'Não foi possível atualizar a participação.');
    } finally {
      setBusy(false);
    }
  };

  const header = community ? (
    <View>
      <View style={styles.cover}>
        {community.coverUrl ? <Image source={{ uri: community.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{community.name}</Text>
        <Text style={styles.meta}>{community.category || 'Comunidade'} · {compactNumber(community.members)} membros{community.isPrivate ? ' · privada' : ''}</Text>
        {community.description ? <Text style={styles.desc}>{community.description}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: spacing.lg, marginTop: 12 }}>
        {profile?.id === community.ownerId ? (
          <GhostButton title="Você é o administrador" icon="shield-checkmark-outline" />
        ) : (
          <PrimaryButton title={community.joined ? 'Sair da comunidade' : 'Entrar na comunidade'} onPress={toggleJoin} />
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title={community?.name || 'Comunidade'} />
      {loading && !community ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : tab !== 'posts' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          {header}
          {tab === 'gallery' ? <CommunityGallery posts={posts} /> : null}
          {tab === 'announcements' ? (
            <CommunityAnnouncements
              communityId={communityId}
              owner={profile?.id === community?.ownerId}
              uid={profile?.id || ''}
            />
          ) : null}
          {tab === 'events' ? (
            <CommunityEvents communityId={communityId} owner={false} uid={profile?.id || ''} />
          ) : null}
          {tab === 'classifieds' ? (
            <CommunityClassifieds communityId={communityId} owner={false} uid={profile?.id || ''} />
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={1}
          ListHeaderComponent={header || undefined}
          contentContainerStyle={{ paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(0, true); }} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const media = firstMedia(item);
            const author = users[item.authorId];
            return (
              <View style={styles.postCard}>
                <Pressable style={styles.postHead} onPress={() => actions.push({ name: 'user', userId: item.authorId })}>
                  <AvatarView user={author} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.postName}>{author?.name || 'Usuário'}</Text>
                    <Text style={styles.postTime}>{timeAgo(item.createdAt)}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => actions.push(isVideoPost(item) ? { name: 'reels', postId: item.id } : { name: 'post', postId: item.id })}>
                  {item.text ? <Text style={styles.postText} numberOfLines={4}>{item.text}</Text> : null}
                  {media?.src ? (
                    <View style={styles.media}>
                      <Image source={{ uri: media.src }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      {isVideoPost(item) ? <View style={styles.playMark}><Ionicons name="play" size={14} color="#fff" /></View> : null}
                    </View>
                  ) : null}
                </Pressable>
              </View>
            );
          }}
          onEndReached={() => { if (!done) void load(posts.length, false); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={colors.primary} /> : undefined}
          ListEmptyComponent={<EmptyState icon="chatbubble-outline" title="Sem publicações" text="Esta comunidade ainda não tem publicações." />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', height: 150, backgroundColor: colors.surfaceAlt },
  info: { paddingHorizontal: spacing.lg, paddingTop: 12, gap: 3 },
  name: { color: colors.text, fontSize: 20, fontWeight: '900' },
  meta: { color: colors.cyan, fontSize: 12, fontWeight: '700' },
  desc: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  postCard: { marginHorizontal: spacing.lg, marginTop: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 8 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postName: { color: colors.text, fontWeight: '800', fontSize: 14 },
  postTime: { color: colors.muted, fontSize: 11 },
  postText: { color: colors.text, fontSize: 14, lineHeight: 19 },
  media: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  playMark: { position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  tabs: { flexGrow: 0, marginTop: 14, paddingHorizontal: spacing.lg },
  tab: { paddingHorizontal: 14, paddingVertical: 9, marginRight: 6, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  tabOn: { backgroundColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  tabTextOn: { color: '#fff' },
});
