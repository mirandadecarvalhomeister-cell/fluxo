import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { REACTION_CHOICES } from '../lib/interactive';
import { colors, radius } from '../lib/theme';
import { compactNumber } from '../lib/format';
import AnimatedEmoji from './AnimatedEmoji';
import type { Post } from '../types';

const CHOICES = REACTION_CHOICES.slice(0, 8);

/** Curtida com coração. A tabela de reações aparece só enquanto o botão é segurado. */
export default function ReactionBar({ post, compact = false }: { post: Post; compact?: boolean }) {
  const { actions } = useApp();
  const [showPicker, setShowPicker] = useState(false);
  const burst = useRef(new Animated.Value(1)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setShowPicker(true);
    try { Haptics.selectionAsync(); } catch {}
  }, []);

  const startHold = useCallback(() => {
    clearTimers();
    holdTimer.current = setTimeout(show, 350);
  }, [clearTimers, show]);

  const endHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    // Pequeno atraso para permitir tocar numa reação após soltar.
    hideTimer.current = setTimeout(() => setShowPicker(false), 900);
  }, []);

  const react = useCallback((emoji: string) => {
    clearTimers();
    setShowPicker(false);
    Animated.sequence([
      Animated.timing(burst, { toValue: 1.45, duration: 110, useNativeDriver: true }),
      Animated.spring(burst, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }),
    ]).start();
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    void actions.reactPost(post, emoji);
  }, [actions, post, burst, clearTimers]);

  const liked = !!post.myReaction;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {showPicker ? (
        <View style={styles.picker}>
          {CHOICES.map((emoji) => (
            <Pressable key={emoji} onPress={() => react(emoji)} style={styles.option} hitSlop={4}>
              <AnimatedEmoji emoji={emoji} size={26} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <Animated.View style={{ transform: [{ scale: burst }] }}>
        <Pressable
          onPress={() => react(post.myReaction || '❤️')}
          onPressIn={startHold}
          onPressOut={endHold}
          onLongPress={show}
          hitSlop={6}
          style={styles.main}
          accessibilityLabel={liked ? 'Remover curtida' : 'Curtir publicação (segure para reagir)'}
        >
          {liked ? (
            <AnimatedEmoji emoji={post.myReaction || '❤️'} size={22} autoplay={false} />
          ) : (
            <Ionicons name="heart-outline" size={compact ? 20 : 22} color={colors.text} />
          )}
          <Text style={[styles.count, liked && { color: colors.pink }]}>{compactNumber(post.likes)}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', position: 'relative' },
  wrapCompact: {},
  main: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4, paddingVertical: 4 },
  myEmoji: { fontSize: 20, lineHeight: 22 },
  count: { color: colors.text, fontSize: 13, fontWeight: '700' },
  picker: {
    position: 'absolute', bottom: 38, left: -6,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 8,
    zIndex: 10,
  },
  option: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  optionEmoji: { fontSize: 23 },
});
