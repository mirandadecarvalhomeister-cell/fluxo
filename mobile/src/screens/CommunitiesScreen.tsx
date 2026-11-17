import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { EmptyState } from '../components/Ui';
import { colors, gradients, radius, spacing } from '../lib/theme';
import { compactNumber } from '../lib/format';
import { fetchCommunities, setCommunityMembership } from '../lib/api';
import type { Community } from '../types';

export default function CommunitiesScreen() {
  const { profile, online, actions } = useApp();
  const [items, setItems] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id || !online) { setLoading(false); return; }
    try {
      setItems(await fetchCommunities(profile.id));
    } catch {
      actions.toast('Não foi possível carregar as comunidades.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, online, actions]);

  useEffect(() => { void load(); }, [load]);

  const toggleJoin = async (community: Community) => {
    if (!profile?.id || busy) return;
    setBusy(community.id);
    try {
      await setCommunityMembership(community.id, profile.id, !community.joined);
      setItems((cur) => cur.map((c) => c.id === community.id
        ? { ...c, joined: !c.joined, members: Math.max(0, c.members + (c.joined ? -1 : 1)) }
        : c));
      actions.toast(community.joined ? 'Você saiu da comunidade.' : 'Você entrou na comunidade!');
    } catch (e: any) {
      actions.toast(e?.message || 'Não foi possível atualizar a participação.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title="Comunidades" />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.primary} />}
        ListEmptyComponent={loading
          ? <Text style={styles.loading}>Carregando…</Text>
          : <EmptyState icon="people-outline" title="Nenhuma comunidade" text="As comunidades criadas aparecem aqui." />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => actions.push({ name: 'community', communityId: item.id })} style={styles.cardMain}>
              <View style={styles.cover}>
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                )}
                {item.iconUrl ? <Image source={{ uri: item.iconUrl }} style={styles.icon} contentFit="cover" /> : <View style={styles.iconFallback}><Ionicons name="people" size={20} color="#fff" /></View>}
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.category}>{item.category || 'Comunidade'} · {compactNumber(item.members)} membros{item.isPrivate ? ' · privada' : ''}</Text>
                {item.description ? <Text style={styles.desc} numberOfLines={2}>{item.description}</Text> : null}
              </View>
            </Pressable>
            <Pressable
              onPress={() => void toggleJoin(item)}
              disabled={busy === item.id}
              style={[styles.joinBtn, item.joined && styles.joinBtnOn]}
            >
              <Text style={[styles.joinText, item.joined && styles.joinTextOn]}>{item.joined ? 'Sair' : 'Entrar'}</Text>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { color: colors.muted, textAlign: 'center', marginTop: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  icon: { position: 'absolute', left: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#fff' },
  iconFallback: { position: 'absolute', left: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { color: colors.text, fontWeight: '800', fontSize: 15 },
  category: { color: colors.cyan, fontSize: 12, fontWeight: '700' },
  desc: { color: colors.muted, fontSize: 12 },
  joinBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.primary },
  joinBtnOn: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  joinText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  joinTextOn: { color: colors.muted },
});
