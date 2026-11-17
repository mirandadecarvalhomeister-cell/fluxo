import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useApp } from '../context/AppContext';
import { colors, gradients } from '../lib/theme';
import { AvatarView } from '../components/Ui';
import { compactNumber } from '../lib/format';
import { REACTION_CHOICES } from '../lib/interactive';
import { isVideoPost, mediaOf } from '../lib/media';
import { sharePostLink } from '../lib/share';
import type { Post } from '../types';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

function ReelItem({ post, active, onClose }: { post: Post; active: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { users, actions, prefs } = useApp();
  const author = users[post.authorId];
  const media = mediaOf(post).find((m) => m.kind === 'video' && m.src) || mediaOf(post)[0];
  const src = media?.src || null;
  const [isPortraitVideo, setIsPortraitVideo] = useState(true);
  const [muted, setMuted] = useState(!prefs.sound);
  const [playing, setPlaying] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeOpacity = useRef(new Animated.Value(1)).current;

  const revealVolume = useCallback(() => {
    setShowVolume(true);
    Animated.timing(volumeOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => {
      Animated.timing(volumeOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => setShowVolume(false));
    }, 2800);
  }, [volumeOpacity]);

  useEffect(() => {
    revealVolume();
    return () => { if (volumeTimer.current) clearTimeout(volumeTimer.current); };
  }, [revealVolume]);

  const player = useVideoPlayer(src, (p) => {
    p.loop = true;
    p.muted = !prefs.sound;
    p.bufferOptions = prefs.dataSaver
      ? { preferredForwardBufferDuration: 5, minBufferForPlayback: 1, maxBufferBytes: 2_000_000 }
      : { preferredForwardBufferDuration: 15 };
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => setPlaying(isPlaying));

  // Detecta orientação da trilha para decidir cover (vertical 9:16) vs contain (horizontal).
  useEventListener(player, 'videoTrackChange', ({ videoTrack }) => {
    if (!videoTrack?.size?.width || !videoTrack?.size?.height) return;
    setIsPortraitVideo(videoTrack.size.height >= videoTrack.size.width);
  });
  // Fallback: alguns casos expõem sourceLoad com tamanho.
  useEventListener(player, 'sourceLoad', ({ availableVideoTracks }) => {
    const track = availableVideoTracks?.[0];
    if (track?.size?.width && track?.size?.height) {
      setIsPortraitVideo(track.size.height >= track.size.width);
    }
  });

  useEffect(() => {
    if (!player) return;
    try {
      // Reproduz automaticamente sempre que o clipe estiver ativo.
      if (active) player.play();
      else player.pause();
    } catch {}
  }, [active, player]);

  useEffect(() => {
    if (!player) return;
    try {
      player.muted = muted;
      player.bufferOptions = prefs.dataSaver
        ? { preferredForwardBufferDuration: 5, minBufferForPlayback: 1, maxBufferBytes: 2_000_000 }
        : { preferredForwardBufferDuration: 15 };
    } catch {}
  }, [muted, player, prefs.dataSaver]);

  const togglePlay = () => {
    if (!player) return;
    try {
      if (player.playing) player.pause();
      else player.play();
    } catch {}
  };

  const contentFit = isPortraitVideo ? 'cover' : 'contain';

  return (
    <View style={styles.reel}>
      <StatusBar style="light" />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => { togglePlay(); revealVolume(); }}>
        {src ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            nativeControls={false}
            allowsPictureInPicture={false}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="videocam-off" size={42} color={colors.muted} />
            <Text style={{ color: colors.muted, marginTop: 8 }}>Vídeo indisponível</Text>
          </View>
        )}
      </Pressable>

      {!playing && src ? (
        <View pointerEvents="none" style={styles.playPause}>
          <Ionicons name="play" size={52} color="rgba(255,255,255,0.9)" />
        </View>
      ) : null}

      {/* Botão de volume no centro: aparece ao tocar e some após ~3s */}
      <View pointerEvents="box-none" style={styles.volumeCenter}>
        {showVolume ? (
          <Animated.View style={{ opacity: volumeOpacity }}>
            <Pressable
              onPress={() => { setMuted((m) => !m); revealVolume(); }}
              hitSlop={12}
              style={styles.volumeBtn}
            >
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={28} color="#fff" />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      <LinearGradient colors={gradients.top} pointerEvents="none" style={[styles.topGrad, { height: insets.top + 90 }]} />
      <LinearGradient colors={gradients.bottom} pointerEvents="none" style={styles.bottomGrad} />

      <View style={[styles.topBar, { top: insets.top + 6 }]}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.circleBtn}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>Clips</Text>
        <View style={styles.circleBtnPlaceholder} />
      </View>

      <View style={[styles.rail, { bottom: insets.bottom + 90 }]}>
        <Pressable onLongPress={() => setShowReactions(true)} onPress={() => actions.toggleLike(post)} style={styles.railBtn} hitSlop={8}>
          <View style={styles.railIcon}>
            {post.myReaction ? (
              <Text style={{ fontSize: 26 }}>{post.myReaction}</Text>
            ) : (
              <Ionicons name="heart-outline" size={28} color="#fff" />
            )}
          </View>
          <Text style={styles.railLabel}>{compactNumber(post.likes)}</Text>
        </Pressable>
        <RailButton icon="chatbubble-ellipses-outline" label={compactNumber(post.commentCount)} onPress={() => actions.push({ name: 'comments', postId: post.id })} />
        <RailButton icon="paper-plane-outline" label="Enviar" onPress={() => actions.push({ name: 'shareToChat', postId: post.id })} />
        <RailButton icon="share-social-outline" label="Compartilhar" onPress={() => sharePostLink(post.id, post.text)} />
        <RailButton icon={post.saved ? 'bookmark' : 'bookmark-outline'} label="" color={post.saved ? colors.cyan : '#fff'} onPress={() => actions.toggleSave(post)} />
      </View>

      <View style={[styles.captionBox, { bottom: insets.bottom + 20, paddingRight: 88 }]}>
        <Pressable style={styles.authorRow} onPress={() => actions.push({ name: 'user', userId: post.authorId })}>
          <AvatarView user={author} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={styles.authorName} numberOfLines={1}>{author?.name || 'Usuário'}</Text>
            <Text style={styles.authorHandle} numberOfLines={1}>@{author?.handle || 'fluxo'}</Text>
          </View>
        </Pressable>
        {post.text ? <Text style={styles.caption} numberOfLines={3}>{post.text}</Text> : null}
      </View>

      <Modal visible={showReactions} transparent animationType="fade" onRequestClose={() => setShowReactions(false)}>
        <TouchableWithoutFeedback onPress={() => setShowReactions(false)}>
          <View style={styles.rxBackdrop}>
            <View style={styles.rxBar}>
              {REACTION_CHOICES.slice(0, 10).map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => { setShowReactions(false); void actions.reactPost(post, emoji); }}
                  style={styles.rxOption}
                >
                  <Text style={styles.rxEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

function RailButton({ icon, label, onPress, color = '#fff' }: { icon: any; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.railBtn}>
      <View style={styles.railIcon}><Ionicons name={icon} size={28} color={color} /></View>
      {label ? <Text style={styles.railLabel}>{label}</Text> : null}
    </Pressable>
  );
}

export default function ReelsScreen({ postId }: { postId?: string }) {
  const { posts, actions, prefs } = useApp();
  const reels = useMemo(() => posts.filter((p) => isVideoPost(p)), [posts]);
  const initialIndex = Math.max(0, postId ? reels.findIndex((p) => p.id === postId) : 0);
  const [activeIndex, setActiveIndex] = useState(initialIndex >= 0 ? initialIndex : 0);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    if (viewableItems[0]?.index != null) setActiveIndex(viewableItems[0].index);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  if (!reels.length) {
    return (
      <View style={[styles.reel, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style="light" />
        <Ionicons name="videocam-outline" size={42} color={colors.muted} />
        <Text style={{ color: colors.muted, marginTop: 8 }}>Nenhum vídeo disponível.</Text>
        <Pressable onPress={actions.pop} style={{ marginTop: 16 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>Voltar</Text></Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={reels}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => <ReelItem post={item} active={index === activeIndex} onClose={actions.pop} />}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      initialScrollIndex={initialIndex >= 0 ? initialIndex : 0}
      getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      windowSize={prefs.dataSaver ? 1 : 3}
      removeClippedSubviews
    />
  );
}

const styles = StyleSheet.create({
  reel: { width: SCREEN_W, height: SCREEN_H, backgroundColor: '#000' },
  topGrad: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomGrad: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320 },
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  rail: { position: 'absolute', right: 10, alignItems: 'center', gap: 18 },
  railBtn: { alignItems: 'center', gap: 4 },
  railIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  railLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  captionBox: { position: 'absolute', left: 14, right: 14, gap: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  authorHandle: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  caption: { color: '#fff', fontSize: 14, lineHeight: 20 },
  playPause: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  volumeCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  circleBtnPlaceholder: { width: 38, height: 38 },
  rxBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  rxBar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90%', padding: 12, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rxOption: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  rxEmoji: { fontSize: 26 },
  dataHint: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
});
