import React, { useEffect } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, EmptyState } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { timeAgo } from '../lib/format';

export default function NotificationsScreen() {
  const { notifications, users, actions } = useApp();

  useEffect(() => {
    actions.loadNotifications();
    actions.markNotificationsRead();
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title="Notificações" />
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: 10, flexGrow: notifications.length ? 0 : 1 }}
        renderItem={({ item }) => {
          const user = users[item.actorId];
          return (
            <View style={styles.row}>
              <AvatarView user={user} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>{item.text}</Text>
                <Text style={styles.meta}>{timeAgo(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title="Sem notificações" text="Quando houver atividade, você verá aqui." />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  text: { color: colors.text, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
