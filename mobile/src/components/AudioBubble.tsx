import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors, radius } from '../lib/theme';
import { claimMobilePlayback, releaseMobilePlayback } from '../lib/audioPlayback';

const SPEEDS = [1, 1.5, 2];
const BARS = 34;

function clock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function wave(seed: string, waves?: number[]) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Array.from({ length: BARS }, (_, index) => {
    if (waves?.length) {
      return Math.max(0.14, Math.min(1, Number(waves[Math.floor((index / BARS) * waves.length)]) || 0.2));
    }
    const a = Math.sin(index * 0.58 + (hash % 17)) * 0.5 + 0.5;
    const b = Math.sin(index * 1.9 + (hash % 7)) * 0.5 + 0.5;
    return Math.max(0.16, Math.min(1, a * 0.65 + b * 0.35));
  });
}

type Props = {
  url: string;
  duration?: number;
  mine?: boolean;
  waves?: number[];
  sender?: string;
  showControls?: boolean;
};

/** Bolha de áudio reproduzível: onda, progresso, tempo e velocidades. */
export default function AudioBubble({ url, duration, mine = false, waves, sender, showControls = false }: Props) {
  const player = useAudioPlayer(url, { downloadFirst: true });
  const status = useAudioPlayerStatus(player);
  const [speedIndex, setSpeedIndex] = useState(0);
  const claimedRef = useRef(false);
  const bars = useMemo(() => wave(url, waves), [url, waves]);
  const total = duration && duration > 0 ? duration : status.duration || 0;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  useEffect(() => {
    if (status.playing) {
      claimMobilePlayback(player);
      claimedRef.current = true;
    } else if (claimedRef.current) {
      releaseMobilePlayback(player);
      claimedRef.current = false;
    }
  }, [status.playing, player]);

  useEffect(() => {
    try { (player as any).playbackRate = SPEEDS[speedIndex]; } catch {}
  }, [speedIndex, player]);

  useEffect(() => () => {
    if (claimedRef.current) releaseMobilePlayback(player);
    try { player.pause(); } catch {}
  }, [player]);

  const toggle = () => {
    try {
      if (status.playing) player.pause();
      else player.play();
    } catch {}
  };

  const skip = (seconds: number) => {
    try { player.seekTo(Math.max(0, Math.min(total, status.currentTime + seconds))); } catch {}
  };

  const cycleSpeed = () => setSpeedIndex((index) => (index + 1) % SPEEDS.length);

  return (
    <View style={[styles.wrap, { backgroundColor: mine ? 'rgba(255,255,255,0.16)' : colors.surfaceAlt }]}>
      <Pressable onPress={toggle} hitSlop={4} style={styles.main} accessibilityLabel={status.playing ? 'Pausar áudio' : 'Reproduzir áudio'}>
        <View style={[styles.play, { backgroundColor: colors.primary }]}>
          <Ionicons name={status.playing ? 'pause' : 'play'} size={15} color="#fff" />
        </View>
        <View style={styles.body}>
          <View style={styles.wave}>
            {bars.map((bar, index) => (
              <View
                key={index}
                style={[
                  styles.bar,
                  { height: `${Math.round(bar * 100)}%`, backgroundColor: index / BARS <= progress ? colors.cyan : 'rgba(128,128,128,0.35)' },
                ]}
              />
            ))}
          </View>
          <View style={styles.meta}>
            {showControls ? (
              <Pressable onPress={() => skip(-5)} hitSlop={6}><Text style={styles.small}>«5</Text></Pressable>
            ) : null}
            <Text style={[styles.time, { color: mine ? 'rgba(245,246,251,0.85)' : colors.muted }]}>
              {clock(status.playing ? status.currentTime : total || status.currentTime)}
            </Text>
            {sender ? <Text style={[styles.sender, { color: colors.muted }]} numberOfLines={1}>{sender}</Text> : null}
            {showControls ? (
              <Pressable onPress={() => skip(5)} hitSlop={6}><Text style={styles.small}>5»</Text></Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
      {showControls ? (
        <Pressable onPress={cycleSpeed} style={styles.speed} hitSlop={6} accessibilityLabel={`Velocidade ${SPEEDS[speedIndex]}x`}>
          <Text style={styles.speedText}>{SPEEDS[speedIndex]}x</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 190, maxWidth: 300, paddingHorizontal: 8, paddingVertical: 7, borderRadius: radius.pill },
  main: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  play: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 3 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 22 },
  bar: { flex: 1, minWidth: 2, borderRadius: 2, maxHeight: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { fontSize: 11, fontWeight: '700', minWidth: 30 },
  sender: { fontSize: 10, flexShrink: 1, maxWidth: 80 },
  small: { fontSize: 10, fontWeight: '700', color: colors.muted },
  speed: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(128,128,128,0.16)' },
  speedText: { fontSize: 10, fontWeight: '800', color: colors.text },
});
