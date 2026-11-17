import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useApp } from '../context/AppContext';
import { AvatarView, EmptyState } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { timeAgo } from '../lib/format';
import { getComments, insertComment, toggleCommentLike } from '../lib/api';
import type { Comment } from '../types';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.round(SCREEN_H * 0.72);
const CLOSE_THRESHOLD = 110;

type ReplyTarget = { id: string; name: string } | null;

export default function CommentsScreen({ postId }: { postId: string }) {
  const { profile, users, actions, commentVersion } = useApp();
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget>(null);
  const translateY = useRef(new Animated.Value(SHEET_H)).current;

  const [expanded, setExpanded] = useState(false);
  const sheetHeight = expanded ? SCREEN_H * 0.94 : SHEET_H;

  const slideTo = useCallback((toExpanded: boolean) => {
    setExpanded(toExpanded);
    Animated.spring(translateY, { toValue: 0, friction: 12, tension: 100, useNativeDriver: true }).start();
  }, [translateY]);

  const close = useCallback(() => {
    Animated.timing(translateY, { toValue: SHEET_H, duration: 220, useNativeDriver: true }).start(() => actions.pop());
  }, [translateY, actions]);

  useEffect(() => { slideTo(false); }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 3 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => { translateY.setValue(Math.max(0, g.dy)); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_THRESHOLD || g.vy > 0.6) close();
        else if (g.dy < -40 && !expanded) slideTo(true);
        else Animated.spring(translateY, { toValue: 0, friction: 12, tension: 100, useNativeDriver: true }).start();
      },
    })
  ).current;

  const load = useCallback(async () => {
    try {
      const rows = await getComments(postId, profile?.id);
      const mapped: Comment[] = rows.map((r: any) => ({
        id: String(r.id),
        postId,
        authorId: String(r.author_id),
        text: String(r.text || ''),
        createdAt: new Date(r.created_at).getTime(),
        parentId: r.parent_id ? String(r.parent_id) : null,
        likes: Number(r.like_count) || 0,
        liked: !!r.liked,
      }));
      setItems(mapped);
      actions.mergeProfiles(mapped.map((c) => users[c.authorId]).filter(Boolean) as any);
    } finally {
      setLoading(false);
    }
  }, [postId, profile?.id, actions, users]);

  useEffect(() => { void load(); }, [load, commentVersion]);

  const send = async () => {
    const clean = text.trim();
    if (!clean || !profile?.id || sending) return;
    setSending(true);
    try {
      const row = await insertComment({ postId, authorId: profile.id, text: clean, parentId: replyTo?.id || null });
      setItems((cur) => [...cur, {
        id: String(row.id),
        postId,
        authorId: String(row.author_id),
        text: clean,
        createdAt: Date.now(),
        parentId: row.parent_id ? String(row.parent_id) : null,
        likes: 0,
        liked: false,
      }]);
      setText('');
      setReplyTo(null);
    } catch (e: any) {
      actions.toast(e?.message || 'Não foi possível comentar.');
    } finally {
      setSending(false);
    }
  };

  const like = async (comment: Comment) => {
    if (!profile?.id) return;
    try {
      const liked = await toggleCommentLike(comment.id, profile.id);
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      setItems((cur) => cur.map((c) => c.id === comment.id
        ? { ...c, liked, likes: Math.max(0, (c.likes || 0) + (liked ? 1 : -1)) }
        : c));
    } catch (e: any) {
      actions.toast(e?.message || 'Não foi possível curtir.');
    }
  };

  const renderComment = (comment: Comment, isReply = false) => {
    const author = users[comment.authorId];
    return (
      <View key={comment.id} style={[styles.row, isReply && styles.replyRow]}>
        <AvatarView user={author} size={isReply ? 28 : 34} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.metaRow}>
            <Text style={styles.name}>{author?.name || 'Usuário'}</Text>
            <Text style={styles.meta}>· {timeAgo(comment.createdAt)}</Text>
          </View>
          <Text style={styles.body}>{comment.text}</Text>
          <View style={styles.commentActions}>
            <Pressable onPress={() => like(comment)} hitSlop={6} style={styles.likeBtn}>
              <Ionicons name={comment.liked ? 'heart' : 'heart-outline'} size={14} color={comment.liked ? colors.pink : colors.muted} />
              {!!comment.likes ? <Text style={[styles.actionText, comment.liked && { color: colors.pink }]}>{comment.likes}</Text> : null}
            </Pressable>
            {!isReply ? (
              <Pressable
                onPress={() => setReplyTo({ id: comment.id, name: author?.name || 'usuário' })}
                hitSlop={6}
                style={styles.likeBtn}
              >
                <Text style={styles.actionText}>Responder</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const roots = items.filter((c) => !c.parentId);

  return (
    <View style={styles.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fechar comentários" />
      <Animated.View style={[styles.sheet, { height: sheetHeight, transform: [{ translateY }] }]}>
        <View {...pan.panHandlers}>
          <View style={styles.handleArea}><View style={styles.handle} /></View>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Comentários</Text>
            <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {loading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>Carregando…</Text></View>
          ) : (
            <FlatList
              data={roots}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: spacing.lg, gap: 14, flexGrow: roots.length ? 0 : 1 }}
              renderItem={({ item }) => (
                <View style={{ gap: 10 }}>
                  {renderComment(item)}
                  {items.filter((c) => c.parentId === item.id).map((reply) => renderComment(reply, true))}
                </View>
              )}
              ListEmptyComponent={<EmptyState icon="chatbubble-outline" title="Sem comentários" text="Seja o primeiro a comentar." />}
            />
          )}

          {replyTo ? (
            <View style={styles.replyBar}>
              <Text style={styles.replyText} numberOfLines={1}>Respondendo a {replyTo.name}</Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}><Ionicons name="close" size={16} color={colors.muted} /></Pressable>
            </View>
          ) : null}

          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={replyTo ? 'Escreva a resposta…' : 'Adicione um comentário…'}
              placeholderTextColor={colors.faint}
              style={styles.input}
            />
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
  sheet: { width: '100%', backgroundColor: colors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.surfaceAlt },
  row: { flexDirection: 'row', gap: 10 },
  replyRow: { marginLeft: 30, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.border },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' },
  meta: { color: colors.muted, fontSize: 12 },
  name: { color: colors.text, fontWeight: '700', fontSize: 13 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: 'row', gap: 16, marginTop: 2 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  replyBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  replyText: { color: colors.cyan, fontSize: 12, fontWeight: '700', flex: 1 },
  composer: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
