import React, { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useApp } from '../context/AppContext';
import { colors } from '../lib/theme';

/** Player de vídeo inline no feed: toca quando visível, pausa quando sai da tela. */
export default function FeedVideo({ src, postId }: { src: string; postId: string; seed?: string }) {
  const { activeVideoId, setActiveVideoId, prefs, actions } = useApp();
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  // String source é o formato usado com sucesso no Clips (ReelsScreen).
  const player = useVideoPlayer(src, (p) => {
    p.loop = true;
    p.muted = !prefs.sound;
  });

  useEventListener(player, 'playingChange', ({ isPlaying }: { isPlaying: boolean }) => setPlaying(isPlaying));
  useEventListener(player, 'statusChange', ({ status }: { status: string }) => {
    if (status === 'error') setFailed(true);
    if (status === 'readyToPlay') setFailed(false);
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const shouldPlay = visible && activeVideoId === postId && appActive && prefs.autoplay !== false && !failed;
    try {
      if (shouldPlay) player.play();
      else player.pause();
    } catch {}
  }, [visible, activeVideoId, postId, appActive, prefs.autoplay, failed, player]);

  useEffect(() => () => { try { player.pause(); } catch {} }, [player]);

  const onPress = () => {
    if (failed) {
      try { player.replace(src); setFailed(false); } catch {}
      return;
    }
    setActiveVideoId(activeVideoId === postId ? null : postId);
  };

  const openClips = () => actions.push({ name: 'reels', postId });

  return (
    <View style={styles.wrap} onLayout={() => setVisible(true)}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onPress}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />
        {failed ? (
          <View style={styles.failed}>
            <Ionicons name="videocam-off-outline" size={30} color={colors.muted} />
            <Text style={styles.failedText}>Não foi possível reproduzir</Text>
            <Text style={styles.retry}>Toque para tentar novamente</Text>
          </View>
        ) : !playing ? (
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.playBtn}><Ionicons name="play" size={24} color="#fff" /></View>
          </View>
        ) : null}
      </Pressable>
      <Pressable onPress={openClips} style={styles.openBtn} hitSlop={8}>
        <Ionicons name="expand-outline" size={16} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: '100%', backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  failed: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6 },
  failedText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  retry: { color: colors.cyan, fontSize: 11 },
  openBtn: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
