import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useApp } from '../context/AppContext';
import { AvatarView, EmptyState, GhostButton, PrimaryButton } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { compactNumber } from '../lib/format';
import { firstMedia, isVideoPost } from '../lib/media';
import { fetchLiveChannels, searchWorkspace } from '../lib/api';
import type { Post, Profile } from '../types';

type Section = 'buscar' | 'adicionar' | 'radar' | 'lives';

const STOP = new Set([
  'para', 'porque', 'quando', 'onde', 'como', 'sobre', 'entre', 'depois', 'antes',
  'tambem', 'também', 'muito', 'muita', 'muitos', 'muitas', 'ainda', 'sempre', 'nunca',
  'coisa', 'coisas', 'gente', 'pessoa', 'pessoas', 'hoje', 'agora', 'aqui', 'ali',
  'isso', 'isto', 'aquilo', 'esse', 'essa', 'este', 'esta', 'aquele', 'aquela',
  'quem', 'qual', 'quais', 'voce', 'você', 'voces', 'vocês', 'meu', 'minha', 'meus',
  'minhas', 'seu', 'sua', 'seus', 'suas', 'nosso', 'nossa', 'deles', 'delas', 'esta',
  'está', 'estao', 'estão', 'fazer', 'feito', 'vamos', 'pode', 'podem', 'quero',
  'quer', 'todos', 'todas', 'outro', 'outra', 'mais', 'menos', 'bem', 'mal', 'sim',
  'nao', 'não', 'com', 'sem', 'por', 'que', 'dos', 'das', 'uma', 'uns', 'umas',
]);

function norm(v: string) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function RadarPulse() {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.4, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <View style={styles.radarWrap}>
      <View style={styles.radarCore} />
      <Animated.View style={[styles.radarRing, { transform: [{ scale }], opacity }]} />
      <Animated.View style={[styles.radarRing, { transform: [{ scale: Animated.subtract(scale, 0.2) }], opacity: Animated.multiply(opacity, 0.6) }]} />
    </View>
  );
}

export default function ExploreScreen() {
  const { posts, users, profile, online, actions, following } = useApp();
  const { mergePosts, mergeProfiles } = actions;
  const [section, setSection] = useState<Section>('buscar');
  const [q, setQ] = useState('');
  const [remotePeople, setRemotePeople] = useState<Profile[]>([]);
  const [remotePosts, setRemotePosts] = useState<Post[]>([]);
  const [searching, setSearching] = useState(false);
  const [liveChannels, setLiveChannels] = useState<any[]>([]);
  const [loadingLives, setLoadingLives] = useState(false);
  const requestRef = useRef(0);
  const query = q.trim().toLowerCase();

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

  // Lives ao vivo buscadas do backend quando a aba é aberta.
  useEffect(() => {
    if (section !== 'lives' || !online) return;
    let active = true;
    setLoadingLives(true);
    void fetchLiveChannels()
      .then(({ channels, profiles }) => {
        if (!active) return;
        setLiveChannels(channels);
        if (profiles.length) mergeProfiles(profiles);
      })
      .catch(() => { if (active) setLiveChannels([]); })
      .finally(() => { if (active) setLoadingLives(false); });
    return () => { active = false; };
  }, [section, online, mergeProfiles]);

  // Radar: assuntos em alta a partir das hashtags/palavras das publicações.
  const trending = useMemo(() => {
    const counts = new Map<string, { label: string; score: number }>();
    (posts || []).slice(0, 60).forEach((p) => {
      const weight = 1 + (p.likes || 0) + (p.commentCount || 0) * 2;
      const text = String(p.text || '');
      const tags = text.match(/#[\p{L}\p{N}_]{3,}/gu) || [];
      const words = tags.length
        ? []
        : text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(norm(w)));
      [...tags.map((t) => t.slice(1)), ...words].forEach((term) => {
        const key = norm(term);
        if (!key) return;
        const cur = counts.get(key) || { label: term, score: 0 };
        cur.score += weight;
        counts.set(key, cur);
      });
    });
    return [...counts.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  }, [posts]);

  const suggestions = useMemo(
    () => Object.values(users).filter((u) => u.id !== profile?.id && !(following || []).includes(u.id)).slice(0, 30),
    [users, profile?.id, following]
  );

  const maxHeat = trending[0]?.score || 1;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Radar Fluxo</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable onPress={() => actions.push({ name: 'communities' })} style={styles.communitiesBtn} accessibilityLabel="Abrir comunidades">
            <Ionicons name="people-outline" size={16} color={colors.primary} />
            <Text style={styles.communitiesText}>Comunidades</Text>
          </Pressable>
          <GhostButton title="Quiz BOOM!" icon="game-controller-outline" onPress={() => actions.openQuiz()} style={{ minHeight: 36, paddingHorizontal: 12 }} />
        </View>
      </View>

      {/* Sub-abas */}
      <View style={styles.segment}>
        {(['buscar', 'adicionar', 'lives', 'radar'] as Section[]).map((s) => (
          <Pressable key={s} onPress={() => setSection(s)} style={[styles.segmentBtn, section === s && styles.segmentOn]}>
            <Text style={[styles.segmentLabel, section === s && styles.segmentLabelOn]}>
              {s === 'buscar' ? 'Buscar' : s === 'adicionar' ? 'Adicionar' : s === 'lives' ? 'Lives' : 'Radar'}
            </Text>
          </Pressable>
        ))}
      </View>

      {section === 'buscar' ? (
        <>
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
            ListEmptyComponent={<EmptyState icon="locate" title="Nada por aqui" text="Tente outra busca ou volte mais tarde." />}
          />
        </>
      ) : null}

      {section === 'adicionar' ? (
        <ScrollView contentContainerStyle={styles.scrollPad}>
          <Text style={styles.section}>Descubra pessoas</Text>
          <PrimaryButton title="Nova publicação" icon="add" onPress={() => actions.go('create')} style={{ marginVertical: 10 }} />
          {suggestions.length ? suggestions.map((u) => (
            <View key={u.id} style={styles.suggestRow}>
              <Pressable style={styles.suggestUser} onPress={() => actions.push({ name: 'user', userId: u.id })}>
                <AvatarView user={u} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{u.name}</Text>
                  <Text style={styles.personHandle}>@{u.handle}</Text>
                </View>
              </Pressable>
              <GhostButton title="Seguir" icon="person-add-outline" onPress={() => actions.toggleFollow(u.id)} style={{ minHeight: 34, paddingHorizontal: 12 }} />
            </View>
          )) : <EmptyState icon="people-outline" title="Tudo em dia" text="Você já segue todas as pessoas por aqui." />}
        </ScrollView>
      ) : null}

      {section === 'radar' ? (
        <ScrollView contentContainerStyle={styles.scrollPad}>
          <View style={styles.radarBanner}>
            <RadarPulse />
            <View style={{ flex: 1 }}>
              <Text style={styles.radarTitle}>Radar Fluxo</Text>
              <Text style={styles.radarMeta}>
                {posts.length} publicações · {trending.length} assuntos em alta
              </Text>
            </View>
          </View>

          {profile?.interests?.length ? (
            <>
              <Text style={[styles.section, { marginTop: 16 }]}>Ajustado para você</Text>
              <View style={styles.chips}>
                {profile.interests.map((it) => (
                  <Pressable key={it} style={styles.chip} onPress={() => { setQ(it); setSection('buscar'); }}>
                    <Text style={styles.chipText}>{it}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={[styles.section, { marginTop: 16 }]}>Assuntos do momento</Text>
          {trending.length ? trending.map((t, i) => (
            <Pressable key={t.label} style={styles.trendRow} onPress={() => { setQ(t.label); setSection('buscar'); }}>
              <Text style={styles.trendRank}>{String(i + 1).padStart(2, '0')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.trendLabel}>#{t.label}</Text>
                <View style={styles.heatTrack}>
                  <View style={[styles.heatBar, { width: `${Math.max(8, Math.round((t.score / maxHeat) * 100))}%` }]} />
                </View>
              </View>
            </Pressable>
          )) : <Text style={{ color: colors.muted }}>Nenhum assunto em alta ainda.</Text>}
        </ScrollView>
      ) : null}

      {section === 'lives' ? (
        <FlatList
          data={liveChannels}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: 10 }}
          refreshControl={<RefreshControl refreshing={loadingLives} onRefresh={() => { void fetchLiveChannels().then(({ channels, profiles }) => { setLiveChannels(channels); if (profiles.length) mergeProfiles(profiles); }); }} tintColor={colors.primary} />}
          renderItem={({ item }) => {
            const owner = users[item.ownerId];
            return (
              <Pressable
                style={styles.liveRow}
                onPress={() => actions.push({ name: 'live', channelId: item.id, host: false })}
              >
                <AvatarView user={owner} size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.liveName} numberOfLines={1}>{item.title || item.name}</Text>
                    <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>AO VIVO</Text></View>
                  </View>
                  <Text style={styles.liveMeta} numberOfLines={1}>{owner?.name || 'Anfitrião'} · {compactNumber(item.viewers)} assistindo</Text>
                </View>
                <Ionicons name="play-circle" size={26} color={colors.primary} />
              </Pressable>
            );
          }}
          ListEmptyComponent={loadingLives
            ? <ActivityIndicator style={{ margin: 24 }} color={colors.primary} />
            : <EmptyState icon="radio-outline" title="Nenhuma live agora" text="Quando alguém transmitir, aparece aqui." />}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 10 },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  communitiesBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  communitiesText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  liveName: { color: colors.text, fontWeight: '800', fontSize: 14, flexShrink: 1 },
  liveMeta: { color: colors.muted, fontSize: 12 },
  liveBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.pink },
  liveBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  segment: { flexDirection: 'row', marginHorizontal: spacing.lg, marginBottom: 10, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  segmentOn: { backgroundColor: colors.primary },
  segmentLabel: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  segmentLabelOn: { color: '#fff' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, marginBottom: 8, paddingHorizontal: 12, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.text },
  section: { color: colors.text, fontWeight: '800', fontSize: 16 },
  person: { width: 100, alignItems: 'center', gap: 4, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  personName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  personHandle: { color: colors.muted, fontSize: 11 },
  cell: { flex: 1 / 3, aspectRatio: 1, margin: 1, backgroundColor: colors.surfaceAlt },
  playIcon: { position: 'absolute', top: 6, right: 6 },
  scrollPad: { padding: spacing.lg, gap: 8, paddingBottom: 40 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  radarBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface },
  radarWrap: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  radarCore: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary },
  radarRing: { position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: colors.pink },
  radarTitle: { color: colors.text, fontWeight: '900', fontSize: 18 },
  radarMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  trendRank: { color: colors.pink, fontWeight: '900', fontSize: 14, width: 24 },
  trendLabel: { color: colors.text, fontWeight: '700', fontSize: 14 },
  heatTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, marginTop: 6, overflow: 'hidden' },
  heatBar: { height: 4, borderRadius: 2, backgroundColor: colors.pink },
});
