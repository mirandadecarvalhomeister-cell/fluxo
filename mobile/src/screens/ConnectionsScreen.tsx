import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, EmptyState } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { getFollowers, getFollowing } from '../lib/api';

export default function ConnectionsScreen({ userId, mode }: { userId: string; mode: 'followers' | 'following' }) {
  const { users, actions } = useApp();
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = mode === 'followers' ? await getFollowers(userId) : await getFollowing(userId);
        setIds(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, mode]);

  const title = mode === 'followers' ? 'Seguidores' : 'Seguindo';

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title={title} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>Carregando…</Text></View>
      ) : (
        <FlatList
          data={ids}
          keyExtractor={(id) => id}
          contentContainerStyle={{ padding: spacing.lg, gap: 10, flexGrow: ids.length ? 0 : 1 }}
          renderItem={({ item }) => {
            const user = users[item];
            return (
              <Pressable style={styles.row} onPress={() => actions.push({ name: 'user', userId: item })}>
                <AvatarView user={user} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{user?.name || item}</Text>
                  <Text style={styles.meta}>@{user?.handle || ''}</Text>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={<EmptyState icon="people-outline" title={mode === 'followers' ? 'Nenhum seguidor' : 'Não segue ninguém'} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  name: { color: colors.text, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 12 },
});
