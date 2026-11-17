import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { AvatarView, EmptyState } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { timeAgo } from '../lib/format';

function preview(last: any) {
  if (!last) return 'Inicie uma conversa';
  const a = last.attachment;
  if (a?.kind === 'audio') return `🎤 Áudio${a.duration ? ` · ${Math.round(a.duration)}s` : ''}`;
  if (a?.kind === 'location') return '📍 Localização compartilhada';
  if (a?.kind === 'file') return `📄 ${a.fileName || 'Documento'}`;
  if (a?.kind === 'post') return '📎 Publicação compartilhada';
  if (a?.kind === 'quiz') return '💣 Desafio do Quiz BOOM!';
  if (a?.kind === 'arena' || a?.kind === 'arena_result') return '🎮 Convite da Arena';
  if (last.text) return last.text;
  return 'Anexo';
}

export default function MessagesScreen() {
  const { threads, users, profile, actions } = useApp();

  useEffect(() => {
    actions.refreshThreads();
  }, [actions.refreshThreads]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mensagens</Text>
      </View>
      <FlatList
        data={threads}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={{ padding: spacing.lg, gap: 10, paddingBottom: 30 }}
        renderItem={({ item }) => {
          const user = users[item.userId] || (profile?.id === item.userId ? profile : null);
          return (
            <Pressable style={styles.row} onPress={() => actions.push({ name: 'chat', userId: item.userId })}>
              <AvatarView user={user} size={48} />
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>{user?.name || 'Conversa'}</Text>
                  <Text style={styles.time}>{item.last ? timeAgo(item.last.createdAt) : ''}</Text>
                </View>
                <View style={styles.rowTop}>
                  <Text style={styles.preview} numberOfLines={1}>{preview(item.last)}</Text>
                  {item.unread > 0 ? (
                    <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState icon="chatbubble-ellipses-outline" title="Nenhuma conversa ainda" text="Quando você trocar mensagens, elas aparecem aqui." />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, backgroundColor: 'transparent' },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 },
  time: { color: colors.faint, fontSize: 12 },
  preview: { color: colors.muted, fontSize: 13, flex: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
