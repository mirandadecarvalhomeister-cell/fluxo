import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, EmptyState } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { timeAgo } from '../lib/format';
import { getComments, insertComment } from '../lib/api';
import type { Comment } from '../types';

export default function CommentsScreen({ postId }: { postId: string }) {
  const { profile, users, actions } = useApp();
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    try {
      const rows = await getComments(postId);
      const mapped = rows.map((r: any) => ({ id: String(r.id), postId, authorId: String(r.author_id), text: String(r.text || ''), createdAt: new Date(r.created_at).getTime() }));
      setItems(mapped);
      actions.mergeProfiles(mapped.map((c) => users[c.authorId]).filter(Boolean) as any);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [postId]);

  async function send() {
    const clean = text.trim();
    if (!clean || !profile?.id || sending) return;
    setSending(true);
    try {
      const row = await insertComment({ postId, authorId: profile.id, text: clean });
      setItems((cur) => [...cur, { id: String(row.id), postId, authorId: String(row.author_id), text: clean, createdAt: Date.now() }]);
      setText('');
    } catch (e: any) {
      actions.toast(e?.message || 'Não foi possível comentar.');
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title="Comentários" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>Carregando…</Text></View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: 12, flexGrow: items.length ? 0 : 1 }}
            renderItem={({ item }) => {
              const author = users[item.authorId];
              return (
                <View style={styles.row}>
                  <AvatarView user={author} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.meta}><Text style={styles.name}>{author?.name || 'Usuário'}</Text> · {timeAgo(item.createdAt)}</Text>
                    <Text style={styles.body}>{item.text}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<EmptyState icon="chatbubble-outline" title="Sem comentários" text="Seja o primeiro a comentar." />}
          />
        )}
        <View style={styles.composer}>
          <TextInput value={text} onChangeText={setText} placeholder="Adicione um comentário…" placeholderTextColor={colors.faint} style={styles.input} />
          <Pressable onPress={send} disabled={!text.trim() || sending} style={[styles.send, (!text.trim() || sending) && { opacity: 0.5 }]}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: 10 },
  meta: { color: colors.muted, fontSize: 12, marginBottom: 2 },
  name: { color: colors.text, fontWeight: '700' },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  composer: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
