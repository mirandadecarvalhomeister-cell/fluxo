import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors, radius } from '../lib/theme';

function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Bolha de áudio reproduzível usada nas mensagens diretas. */
export default function AudioBubble({ url, duration, mine = false }: { url: string; duration?: number; mine?: boolean }) {
  const player = useAudioPlayer(url, { downloadFirst: true });
  const status = useAudioPlayerStatus(player);
  const total = duration && duration > 0 ? duration : status.duration || 0;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  const toggle = () => {
    try {
      if (status.playing) player.pause();
      else player.play();
    } catch {}
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={4}
      style={[styles.wrap, { backgroundColor: mine ? 'rgba(255,255,255,0.16)' : colors.surfaceAlt }]}
      accessibilityLabel={status.playing ? 'Pausar áudio' : 'Reproduzir áudio'}
    >
      <View style={[styles.play, { backgroundColor: colors.primary }]}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={15} color="#fff" />
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={[styles.time, { color: mine ? 'rgba(245,246,251,0.85)' : colors.muted }]}>{clock(total || status.currentTime)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 190, maxWidth: 260, paddingHorizontal: 8, paddingVertical: 7, borderRadius: radius.pill },
  play: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.35)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, backgroundColor: colors.cyan },
  time: { fontSize: 11, fontWeight: '700', minWidth: 30, textAlign: 'right' },
});
