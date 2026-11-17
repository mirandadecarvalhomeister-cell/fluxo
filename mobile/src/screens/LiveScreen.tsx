import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Room, RoomEvent, Track } from 'livekit-client';
import { VideoView } from '@livekit/react-native';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { AvatarView, EmptyState } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { getChannel, getChannelMessages, sendChannelMessage, setChannelLive } from '../lib/api';
import { supabase } from '../lib/supabase';
import { fetchLiveToken } from '../lib/livekit';
import { isLiveKitConfigured } from '../lib/env';

type Status = 'idle' | 'connecting' | 'connected' | 'error';

type Heart = { id: number; left: number };

export default function LiveScreen({ channelId, host }: { channelId: string; host: boolean }) {
  const { profile, users, actions } = useApp();
  const [channel, setChannel] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [remoteVideo, setRemoteVideo] = useState<any>(null);
  const [participants, setParticipants] = useState(0);
  const [camOn, setCamOn] = useState(host);
  const [micOn, setMicOn] = useState(host);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [hearts, setHearts] = useState<Heart[]>([]);
  const roomRef = useRef<Room | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Carrega canal e histórico do chat.
  useEffect(() => {
    (async () => {
      try {
        const [ch, msgs] = await Promise.all([getChannel(channelId), getChannelMessages(channelId)]);
        if (!mountedRef.current) return;
        setChannel(ch);
        setMessages(msgs.map((m: any) => ({
          id: String(m.id),
          authorId: String(m.author_id),
          text: String(m.text || ''),
          createdAt: new Date(m.created_at).getTime(),
        })));
      } catch (e: any) {
        actions.toast(e?.message || 'Não foi possível abrir a live.');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [channelId, actions]);

  // Chat em tempo real.
  useEffect(() => {
    const sub = supabase
      .channel(`live-chat-${channelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        const row = payload.new as any;
        setMessages((cur) => cur.some((m) => m.id === String(row.id))
          ? cur
          : [...cur, { id: String(row.id), authorId: String(row.author_id), text: String(row.text || ''), createdAt: new Date(row.created_at).getTime() }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [channelId]);

  const pickRemoteVideo = useCallback((room: Room) => {
    let found: any = null;
    room.remoteParticipants.forEach((participant) => {
      participant.getTrackPublications().forEach((publication: any) => {
        if (publication.kind === Track.Kind.Video && publication.isSubscribed && publication.track) found = publication.track;
      });
    });
    if (mountedRef.current) setRemoteVideo(found);
  }, []);

  // Conexão LiveKit real: host publica câmera/microfone; viewer assina as faixas.
  useEffect(() => {
    let cancelled = false;
    if (!isLiveKitConfigured || !profile?.id) {
      setStatus('idle');
      return;
    }

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    setStatus('connecting');
    setError('');

    room.on(RoomEvent.TrackSubscribed, (track: any) => {
      if (cancelled) return;
      if (track.kind === Track.Kind.Video) setRemoteVideo(track);
      if (track.kind === Track.Kind.Audio) track.attach?.();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
      if (cancelled) return;
      if (track.kind === Track.Kind.Video) setRemoteVideo(null);
    });
    room.on(RoomEvent.ParticipantConnected, () => {
      if (!cancelled) setParticipants(room.remoteParticipants.size);
    });
    room.on(RoomEvent.ParticipantDisconnected, () => {
      if (!cancelled) {
        setParticipants(room.remoteParticipants.size);
        pickRemoteVideo(room);
      }
    });
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) setStatus('idle');
    });

    async function connect() {
      try {
        if (Platform.OS === 'android') {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);
        }
        const { token, url } = await fetchLiveToken(channelId, host ? 'host' : 'viewer');
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) { room.disconnect(); return; }

        setParticipants(room.remoteParticipants.size);
        pickRemoteVideo(room);

        if (host) {
          try {
            const cam = await room.localParticipant.setTrackEnabled(Track.Source.Camera, true, { facingMode: 'user' });
            if (cancelled) return;
            setCamOn(!!cam || !!room.localParticipant.getTrackPublication(Track.Source.Camera));
          } catch {
            if (!cancelled) { setCamOn(false); setError('Câmera indisponível; você pode transmitir apenas áudio.'); }
          }
          try {
            await room.localParticipant.setTrackEnabled(Track.Source.Microphone, true);
            if (!cancelled) setMicOn(true);
          } catch {
            if (!cancelled) { setMicOn(false); setError('Microfone indisponível; a câmera continua ao vivo.'); }
          }
        }
        if (!cancelled) setStatus('connected');
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Não foi possível conectar à transmissão.');
        setStatus('error');
      }
    }
    void connect();

    return () => {
      cancelled = true;
      try { room.disconnect(); } catch {}
      if (roomRef.current === room) roomRef.current = null;
      if (host) void setChannelLive(channelId, false).catch(() => {});
    };
  }, [channelId, host, profile?.id, pickRemoteVideo]);

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room || !host) return;
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      await room.localParticipant.setTrackEnabled(Track.Source.Camera, camOn, { facingMode: next });
      setFacing(next);
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    } catch (e: any) {
      actions.toast(e?.message || 'Não foi possível trocar a câmera.');
    }
  };

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room || !host) return;
    try {
      await room.localParticipant.setTrackEnabled(Track.Source.Microphone, !micOn);
      setMicOn(!micOn);
    } catch {
      actions.toast('Não foi possível alternar o microfone.');
    }
  };

  const toggleCam = async () => {
    const room = roomRef.current;
    if (!room || !host) return;
    try {
      await room.localParticipant.setTrackEnabled(Track.Source.Camera, !camOn, { facingMode: facing });
      setCamOn(!camOn);
    } catch {
      actions.toast('Não foi possível alternar a câmera.');
    }
  };

  const leave = () => {
    try { roomRef.current?.disconnect(); } catch {}
    actions.pop();
  };

  const sendHeart = () => {
    const id = Date.now() + Math.random();
    setHearts((cur) => [...cur, { id, left: 10 + Math.random() * 70 }]);
    setTimeout(() => setHearts((cur) => cur.filter((h) => h.id !== id)), 1600);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  };

  async function send() {
    const clean = text.trim();
    if (!clean || !profile?.id) return;
    try {
      await sendChannelMessage({ channelId, authorId: profile.id, text: clean });
      setText('');
    } catch {
      actions.toast('Não foi possível enviar.');
    }
  }

  const live = channel?.live;
  const videoTrack = host ? null : remoteVideo;

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title={channel?.name ? `Live: ${channel.name}` : 'Live'} />

      <View style={styles.stage}>
        {status === 'connecting' ? (
          <View style={styles.stageCenter}><ActivityIndicator color="#fff" /><Text style={styles.stageText}>Conectando à live…</Text></View>
        ) : status === 'error' ? (
          <View style={styles.stageCenter}>
            <Ionicons name="wifi-outline" size={34} color="#fff" />
            <Text style={styles.stageText}>{error}</Text>
            <Text style={styles.stageSub}>O chat continua disponível abaixo.</Text>
          </View>
        ) : host ? (
          <View style={styles.stageCenter}>
            <Ionicons name="radio" size={34} color={colors.pink} />
            <Text style={styles.stageText}>Você está ao vivo</Text>
            <Text style={styles.stageSub}>Sua câmera e microfone estão sendo transmitidos.</Text>
          </View>
        ) : videoTrack ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={sendHeart}>
            <VideoView videoTrack={videoTrack} style={StyleSheet.absoluteFill} objectFit="cover" />
            <View style={styles.viewers}>
              <Ionicons name="eye-outline" size={14} color="#fff" />
              <Text style={styles.viewersText}>{Math.max(1, participants + 1)}</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable style={styles.stageCenter} onPress={sendHeart}>
            <AvatarView user={users[channel?.ownerId] || channel?.owner} size={78} />
            <Text style={styles.stageText}>Aguardando o vídeo do anfitrião…</Text>
            <Text style={styles.stageSub}>Toque para enviar um coração</Text>
          </Pressable>
        )}

        {hearts.map((h) => (
          <Animated.View key={h.id} style={[styles.heart, { left: h.left }]} pointerEvents="none">
            <Ionicons name="heart" size={30} color={colors.pink} />
          </Animated.View>
        ))}

        {status === 'connected' && host ? (
          <View style={styles.hostControls}>
            <Pressable onPress={toggleMic} style={[styles.ctrl, !micOn && styles.ctrlOff]}>
              <Ionicons name={micOn ? 'mic' : 'mic-off'} size={20} color="#fff" />
            </Pressable>
            <Pressable onPress={toggleCam} style={[styles.ctrl, !camOn && styles.ctrlOff]}>
              <Ionicons name={camOn ? 'videocam' : 'videocam-off'} size={20} color="#fff" />
            </Pressable>
            <Pressable onPress={toggleCamera} style={styles.ctrl}>
              <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
            </Pressable>
            <Pressable onPress={leave} style={[styles.ctrl, styles.ctrlLeave]}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: 8 }}>
          {error ? <Text style={styles.warn}>{error}</Text> : null}
          {live?.pollId ? <Text style={styles.warn}>Enquete ativa: {live.title || live.pollId}</Text> : null}
        </View>

        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 12, gap: 8, flexGrow: messages.length ? 0 : 1 }}
          renderItem={({ item }) => {
            const author = users[item.authorId];
            return (
              <View style={styles.msg}>
                <AvatarView user={author} size={28} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.msgName}>{author?.name || 'Usuário'}</Text>
                  <Text style={styles.msgText}>{item.text}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={loading ? undefined : <EmptyState icon="chatbubbles-outline" title="Sem mensagens" text="Envie a primeira mensagem do chat da live." />}
        />

        <View style={styles.composer}>
          <TextInput value={text} onChangeText={setText} placeholder="Mensagem no chat" placeholderTextColor={colors.faint} style={styles.input} />
          <Pressable onPress={send} disabled={!text.trim()} style={[styles.send, !text.trim() && { opacity: 0.5 }]}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={sendHeart} style={styles.sendHeart}>
            <Ionicons name="heart" size={20} color={colors.pink} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  stage: { height: 300, margin: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0e1020', alignItems: 'center', justifyContent: 'center' },
  stageCenter: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20 },
  stageText: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  stageSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' },
  viewers: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)' },
  viewersText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  hostControls: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  ctrl: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  ctrlOff: { backgroundColor: 'rgba(180,40,60,0.85)' },
  ctrlLeave: { backgroundColor: colors.danger },
  heart: { position: 'absolute', bottom: 70, opacity: 0.9 },
  warn: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  title: { color: colors.text, fontWeight: '800', fontSize: 18 },
  meta: { color: colors.muted, lineHeight: 20 },
  msg: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  msgName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  msgText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  composer: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14 },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendHeart: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
