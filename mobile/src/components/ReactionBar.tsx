import React, { useCallback, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { REACTION_CHOICES } from '../lib/interactive';
import { colors, radius } from '../lib/theme';
import { compactNumber } from '../lib/format';
import type { Post } from '../types';

const QUICK = ['❤️', '🔥', '👏', '😂', '🎉'];

export default function ReactionBar({ post, compact = false }: { post: Post; compact?: boolean }) {
  const { actions } = useApp();
  const [expanded, setExpanded] = useState(false);
  const burst = useRef(new Animated.Value(1)).current;

  const react = useCallback((emoji: string) => {
    setExpanded(false);
    Animated.sequence([
      Animated.timing(burst, { toValue: 1.45, duration: 110, useNativeDriver: true }),
      Animated.spring(burst, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }),
    ]).start();
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    void actions.reactPost(post, emoji);
  }, [actions, post, burst]);

  const list = expanded ? REACTION_CHOICES.slice(0, 10) : QUICK;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Animated.View style={{ transform: [{ scale: burst }] }}>
        <Pressable
          onPress={() => react(post.myReaction || '❤️')}
          onLongPress={() => setExpanded((v) => !v)}
          hitSlop={6}
          style={styles.main}
          accessibilityLabel="Reagir à publicação"
        >
          {post.myReaction ? (
            <Text style={styles.myEmoji}>{post.myReaction}</Text>
          ) : (
            <Ionicons name="heart-outline" size={19} color={colors.text} />
          )}
          <Text style={styles.count}>{compactNumber(post.likes)}</Text>
        </Pressable>
      </Animated.View>

      <View style={styles.divider} />
      <View style={styles.options}>
        {list.map((emoji) => (
          <Pressable key={emoji} onPress={() => react(emoji)} hitSlop={4} style={styles.option}>
            <Text style={styles.optionEmoji}>{emoji}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={4} style={styles.more}>
          <Ionicons name={expanded ? 'close' : 'ellipsis-horizontal'} size={15} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.pill, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start',
  },
  wrapCompact: { paddingHorizontal: 6, paddingVertical: 2 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  myEmoji: { fontSize: 18, lineHeight: 20 },
  count: { color: colors.text, fontSize: 12, fontWeight: '700' },
  divider: { width: 1, height: 16, backgroundColor: colors.border },
  options: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  option: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  optionEmoji: { fontSize: 16 },
  more: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
});
