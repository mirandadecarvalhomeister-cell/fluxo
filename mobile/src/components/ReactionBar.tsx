import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, radius } from '../lib/theme';
import { compactNumber } from '../lib/format';
import type { Post } from '../types';

/** Curtida com coração. A bolinha de emoji só aparece ao segurar o botão. */
export default function ReactionBar({ post, compact = false }: { post: Post; compact?: boolean }) {
  const { actions } = useApp();
  const [showPicker, setShowPicker] = useState(false);
  const burst = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hidePickerSoon = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowPicker(false), 900);
  }, []);

  const like = useCallback(() => {
    setShowPicker(false);
    Animated.sequence([
      Animated.timing(burst, { toValue: 1.45, duration: 110, useNativeDriver: true }),
      Animated.spring(burst, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }),
    ]).start();
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    void actions.reactPost(post, '❤️');
  }, [actions, post, burst]);

  const liked = !!post.myReaction;

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {showPicker ? (
        <Pressable onPress={like} style={styles.picker} hitSlop={6}>
          <Text style={styles.pickerEmoji}>❤️</Text>
        </Pressable>
      ) : null}
      <Animated.View style={{ transform: [{ scale: burst }] }}>
        <Pressable
          onPress={like}
          onLongPress={() => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
            setShowPicker(true);
            try { Haptics.selectionAsync(); } catch {}
          }}
          onPressOut={hidePickerSoon}
          hitSlop={6}
          style={styles.main}
          accessibilityLabel={liked ? 'Remover curtida' : 'Curtir publicação'}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={compact ? 20 : 22}
            color={liked ? colors.pink : colors.text}
          />
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
  count: { color: colors.text, fontSize: 13, fontWeight: '700' },
  picker: {
    position: 'absolute', bottom: 34, left: 0,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
    zIndex: 5,
  },
  pickerEmoji: { fontSize: 26 },
});
