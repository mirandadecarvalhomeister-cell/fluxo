import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { AvatarView, EmptyState } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { timeAgo } from '../lib/format';
import { getComments, insertComment } from '../lib/api';
import type { Comment } from '../types';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.round(SCREEN_H * 0.72);
const CLOSE_THRESHOLD = 110;

export default function CommentsScreen({ postId }: { postId: string }) {
  const { profile, users, actions } = useApp();
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const translateY = useRef(new Animated.Value(SHEET_H)).current;

  const slideIn = useCallback(() => {
    Animated.spring(translateY, { toValue: 0, friction: 12, tension: 100, useNativeDriver: true }).start();
  }, [translateY]);

  const close = useCallback(() => {
    Animated.timing(translateY, { toValue: SHEET_H, duration: 220, useNativeDriver: true }).start(() => actions.pop());
  }, [translateY, actions]);

  useEffect(() => { slideIn(); }, [slideIn]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_THRESHOLD || g.vy > 0.5) close();
        else slideIn();
      },
    })
  ).current;

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
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fechar comentários" />
      <Animated.View style={[styles.sheet, { height: SHEET_H, transform: [{ translateY }] }]}>
        {/* Alça de arrasto */}
        <View {...pan.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>Comentários</Text>
          <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>

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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    width: '100%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.surfaceAlt },
  row: { flexDirection: 'row', gap: 10 },
  meta: { color: colors.muted, fontSize: 12, marginBottom: 2 },
  name: { color: colors.text, fontWeight: '700' },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  composer: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
