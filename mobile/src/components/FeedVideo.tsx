import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useApp } from '../context/AppContext';
import { colors } from '../lib/theme';
import type { MediaItem } from '../types';

/** Player de vídeo inline no feed: toca quando visível, pausa quando sai da tela. */
export default function FeedVideo({ src, postId, seed }: { src: string; postId: string; seed?: string }) {
  const { activeVideoId, setActiveVideoId, prefs } = useApp();
  const [playing, setPlaying] = useState(false);
  const visibleRef = useRef(false);
  const appActiveRef = useRef(AppState.currentState === 'active');

  const player = useVideoPlayer({ uri: src }, (p) => {
    p.loop = true;
    p.muted = !prefs.sound;
  });

  useEventListener(player, 'playingChange', ({ isPlaying }: { isPlaying: boolean }) => setPlaying(isPlaying));

  // Sincroniza o player ativo global com a visibilidade e o estado do app.
  useEffect(() => {
    const shouldPlay = visibleRef.current && activeVideoId === postId && appActiveRef.current && prefs.autoplay !== false;
    try {
      if (shouldPlay) player.play();
      else player.pause();
    } catch {}
  }, [activeVideoId, postId, player, prefs.autoplay]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      const shouldPlay = visibleRef.current && activeVideoId === postId && appActiveRef.current;
      try { shouldPlay ? player.play() : player.pause(); } catch {}
    });
    return () => sub.remove();
  }, [activeVideoId, postId, player]);

  useEffect(() => {
    return () => { try { player.pause(); } catch {} };
  }, [player]);

  const onPress = () => {
    if (activeVideoId === postId) setActiveVideoId(null);
    else setActiveVideoId(postId);
  };

  return (
    <View style={styles.wrap} onLayout={() => { visibleRef.current = true; }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
        {!playing ? (
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.playBtn}><Ionicons name="play" size={24} color="#fff" /></View>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: '100%', backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
