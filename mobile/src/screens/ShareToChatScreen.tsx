import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, EmptyState } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';

export default function ShareToChatScreen({ postId }: { postId: string }) {
  const { threads, users, actions } = useApp();

  async function sendTo(userId: string) {
    const err = await actions.sharePostToChat(postId, userId);
    if (err) actions.toast(err);
    else {
      actions.toast('Publicação enviada!');
      actions.pop();
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title="Enviar para" />
      <FlatList
        data={threads}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={{ padding: spacing.lg, gap: 10, flexGrow: threads.length ? 0 : 1 }}
        renderItem={({ item }) => {
          const user = users[item.userId];
          return (
            <Pressable style={styles.row} onPress={() => sendTo(item.userId)}>
              <AvatarView user={user} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user?.name || 'Usuário'}</Text>
                <Text style={styles.meta}>@{user?.handle || ''}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState icon="paper-plane-outline" title="Sem conversas" text="Inicie uma conversa para poder compartilhar publicações." />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  name: { color: colors.text, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 12 },
});
