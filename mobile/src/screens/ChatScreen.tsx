import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useApp } from '../context/AppContext';
import { getConversation, uploadAudio, uploadMedia } from '../lib/api';
import { colors, radius, spacing } from '../lib/theme';
import { AvatarView, EmptyState } from '../components/Ui';
import AudioBubble from '../components/AudioBubble';
import VoiceRecorderSheet from '../components/VoiceRecorderSheet';
import AnimatedEmoji from '../components/AnimatedEmoji';
import { timeAgo } from '../lib/format';
import type { DirectMessage } from '../types';

function Attachment({ attachment, onOpenPost, onOpenQuiz, mine = false }: { attachment: any; onOpenPost: (id: string) => void; onOpenQuiz: (id?: string) => void; mine?: boolean }) {
  if (!attachment) return null;
  if (attachment.kind === 'audio') {
    const src = attachment.media || attachment.uri || attachment.src;
    if (!src) return null;
    return <AudioBubble url={src} duration={attachment.duration} mine={mine} />;
  }
  if (attachment.kind === 'location') {
    return (
      <Pressable
        style={styles.attachCard}
        onPress={() => { if (attachment.url) void Linking.openURL(String(attachment.url)); }}
      >
        <View style={styles.attachMedia}>
          <View style={styles.mapStub}>
            <Ionicons name="location" size={40} color={colors.pink} />
          </View>
        </View>
        <Text style={styles.attachTitle}>📍 {attachment.label || 'Localização'}</Text>
        <Text style={styles.attachHint}>Toque para abrir no mapa</Text>
      </Pressable>
    );
  }
  if (attachment.kind === 'file') {
    return (
      <Pressable style={styles.attachCard} onPress={() => { if (attachment.media) void Linking.openURL(String(attachment.media)); }}>
        <View style={styles.fileRow}>
          <View style={styles.fileIcon}><Ionicons name="document-outline" size={24} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.attachTitle} numberOfLines={2}>{attachment.fileName || 'Documento'}</Text>
            <Text style={styles.attachHint}>Toque para abrir</Text>
          </View>
        </View>
      </Pressable>
    );
  }
  if (attachment.kind === 'post') {
    const media = attachment.media || attachment.mediaSeed || null;
    const isVideo = attachment.mediaKind === 'video';
    return (
      <Pressable style={styles.attachCard} onPress={() => attachment.postId && onOpenPost(attachment.postId)}>
        {media ? (
          <View style={styles.attachMedia}>
            <Image source={{ uri: media }} style={StyleSheet.absoluteFill} contentFit="cover" />
            {isVideo ? <View style={styles.playOverlay}><Ionicons name="play" size={18} color="#fff" /></View> : null}
          </View>
        ) : null}
        <Text style={styles.attachTitle} numberOfLines={2}>{attachment.title || 'Publicação compartilhada'}</Text>
        {attachment.text ? <Text style={styles.attachText} numberOfLines={2}>{attachment.text}</Text> : null}
        <Text style={styles.attachHint}>Toque para abrir</Text>
      </Pressable>
    );
  }
  if (attachment.kind === 'photo' || attachment.kind === 'video') {
    const src = attachment.media || attachment.uri || attachment.src;
    return (
      <View style={styles.attachCard}>
        {src ? (
          <View style={styles.attachMedia}>
            <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </View>
        ) : null}
        <Text style={styles.attachHint}>Foto enviada</Text>
      </View>
    );
  }
  if (attachment.kind === 'quiz') {
    return (
      <Pressable style={styles.attachCard} onPress={() => onOpenQuiz(attachment.challengeId)}>
        <Text style={styles.attachTitle}>💣 Desafio do Quiz BOOM!</Text>
        <Text style={styles.attachText}>
          {attachment.challengerName || 'Um amigo'} · {attachment.categoryName || 'Quiz'} · meta {attachment.targetScore || 0} pts
        </Text>
        <Text style={styles.attachHint}>Toque para jogar</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.attachCard}>
      <Text style={styles.attachTitle}>Anexo</Text>
      <Text style={styles.attachText} numberOfLines={3}>{JSON.stringify(attachment).slice(0, 120)}</Text>
    </View>
  );
}

const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|[\u{1F3FB}-\u{1F3FF}]){1,8}$/u;
function isEmojiOnly(text?: string | null) {
  const clean = String(text || '').trim();
  return clean.length > 0 && clean.length <= 8 && EMOJI_ONLY_RE.test(clean);
}

function AttachOption({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.attachOption} hitSlop={6}>
      <View style={styles.attachOptionIcon}><Ionicons name={icon} size={21} color={colors.primary} /></View>
      <Text style={styles.attachOptionText}>{label}</Text>
    </Pressable>
  );
}

export default function ChatScreen({ userId }: { userId: string }) {
  const { profile, users, messagesVersion, actions } = useApp();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const other = users[userId];

  const sendVoice = async (uri: string, meta: { duration: number; waves: number[] }) => {
    if (!profile?.id) throw new Error('Perfil indisponível.');
    setSending(true);
    try {
      const uploaded = await uploadAudio({ uri, userId: profile.id, duration: meta.duration });
      const sent = await actions.sendMessage(userId, '', {
        kind: 'audio',
        media: uploaded.url,
        duration: meta.duration,
        waves: meta.waves,
        fileName: uploaded.path,
      });
      if (!sent) throw new Error('Não foi possível enviar o áudio.');
      setMessages((cur) => [...cur, sent]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } finally {
      setSending(false);
    }
  };

  async function load() {
    if (!profile?.id) return;
    try {
      const rows = await getConversation(profile.id, userId);
      setMessages(rows);
      await actions.markThreadRead(userId);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [userId, profile?.id, messagesVersion]);

  const onSend = async () => {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    const sent = await actions.sendMessage(userId, clean);
    setSending(false);
    if (sent) {
      setText('');
      setMessages((cur) => [...cur, sent]);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  };

  // Envia uma imagem/câmera como anexo na conversa.
  const onPickMedia = async (useCamera: boolean) => {
    try {
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { actions.toast('Permissão de câmera negada.'); return; }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { actions.toast('Permissão de galeria negada.'); return; }
      }
      const res = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (!profile?.id) return;
      setSending(true);
      const uploaded = await uploadMedia({
        uri: asset.uri,
        userId: profile.id,
        fileName: `chat-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
      const sent = await actions.sendMessage(userId, text.trim(), {
        kind: 'photo',
        media: uploaded.url,
        mediaKind: 'photo',
        fileName: `chat-${Date.now()}.jpg`,
      });
      setSending(false);
      if (sent) {
        setText('');
        setMessages((cur) => [...cur, sent]);
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
    } catch (error: any) {
      setSending(false);
      actions.toast(error?.message || 'Não foi possível enviar a imagem.');
    }
  };

  // Envia um documento qualquer (PDF, ZIP, etc.) como anexo real no storage.
  const onPickDocument = async () => {
    setShowAttach(false);
    if (!profile?.id) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const doc = result.assets[0];
      setSending(true);
      const uploaded = await uploadMedia({
        uri: doc.uri,
        userId: profile.id,
        fileName: doc.name || `arquivo-${Date.now()}`,
        mimeType: doc.mimeType || 'application/octet-stream',
      });
      const sent = await actions.sendMessage(userId, '', {
        kind: 'file',
        media: uploaded.url,
        fileName: doc.name || 'Arquivo',
        mimeType: doc.mimeType || 'application/octet-stream',
        size: doc.size || null,
      });
      setSending(false);
      if (sent) {
        setMessages((cur) => [...cur, sent]);
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
    } catch (error: any) {
      setSending(false);
      actions.toast(error?.message || 'Não foi possível enviar o documento.');
    }
  };

  // Envia a localização atual com link para o mapa.
  const onSendLocation = async () => {
    setShowAttach(false);
    if (!profile?.id) return;
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { actions.toast('Permissão de localização negada.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const sent = await actions.sendMessage(userId, '', {
        kind: 'location',
        lat,
        lng,
        label: 'Minha localização',
        url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      });
      if (sent) {
        setMessages((cur) => [...cur, sent]);
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
    } catch {
      actions.toast('Não foi possível obter a localização.');
    }
  };

  const onEdit = (msg: DirectMessage) => {
    setEditingId(msg.id);
    setEditText(msg.text);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const err = await actions.editMessage(editingId, editText);
    if (err) {
      Alert.alert('Não foi possível editar', err);
      return;
    }
    setMessages((cur) => cur.map((m) => m.id === editingId ? { ...m, text: editText.trim(), editedAt: Date.now() } : m));
    setEditingId(null);
    setEditText('');
  };

  const onDelete = (msg: DirectMessage) => {
    Alert.alert('Apagar mensagem', 'Deseja apagar esta mensagem?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive', onPress: async () => {
          const err = await actions.deleteMessage(msg.id);
          if (err) Alert.alert('Erro', err);
          else setMessages((cur) => cur.filter((m) => m.id !== msg.id));
        }
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={actions.pop} hitSlop={8} style={styles.back}><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <Pressable style={styles.headerUser} onPress={() => actions.push({ name: 'user', userId })}>
          <AvatarView user={other} size={34} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>{other?.name || 'Conversa'}</Text>
            <Text style={styles.headerMeta} numberOfLines={1}>{other?.handle ? `@${other.handle}` : ''}</Text>
          </View>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>Carregando…</Text></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: 8, paddingBottom: 12, flexGrow: messages.length ? 0 : 1 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = item.senderId === profile?.id;
              return (
                <Pressable
                  onLongPress={() => {
                    if (!mine) return;
                    const buttons: any[] = [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Apagar', style: 'destructive', onPress: () => onDelete(item) },
                    ];
                    if (item.text) buttons.splice(1, 0, { text: 'Editar mensagem', onPress: () => onEdit(item) });
                    Alert.alert('Mensagem', undefined, buttons);
                  }}
                  style={[styles.bubbleWrap, mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}
                >
                  <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    {item.attachment ? <Attachment attachment={item.attachment} mine={mine} onOpenPost={(id) => actions.push({ name: 'post', postId: id })} onOpenQuiz={(id) => actions.openQuiz({ challengeId: id })} /> : null}
                    {isEmojiOnly(item.text) ? (
                      <View style={styles.bigEmojis}>
                        {Array.from(item.text!).map((emoji, i) => <AnimatedEmoji key={i} emoji={emoji} size={44} />)}
                      </View>
                    ) : item.text ? <Text style={styles.bubbleText}>{item.text}</Text> : null}
                    <View style={styles.bubbleMeta}>
                      {item.editedAt ? <Text style={styles.edited}>editado</Text> : null}
                      <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={<EmptyState icon="chatbubble-outline" title="Nenhuma mensagem" text="Diga oi para começar a conversa." />}
          />
        )}

        {editingId ? (
          <View style={styles.editBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.editLabel}>Editando mensagem</Text>
              <TextInput value={editText} onChangeText={setEditText} style={styles.editInput} placeholder="Mensagem" placeholderTextColor={colors.faint} multiline />
            </View>
            <Pressable onPress={saveEdit} style={styles.sendBtn}><Ionicons name="checkmark" size={20} color="#fff" /></Pressable>
            <Pressable onPress={() => { setEditingId(null); setEditText(''); }} style={[styles.sendBtn, { backgroundColor: colors.surfaceAlt }]}><Ionicons name="close" size={20} color={colors.text} /></Pressable>
          </View>
        ) : (
          <>
          <View style={styles.composer}>
            <Pressable onPress={() => setShowEmoji((v) => !v)} style={styles.toolBtn} hitSlop={6}>
              <Ionicons name={showEmoji ? 'happy' : 'happy-outline'} size={22} color={colors.muted} />
            </Pressable>
            <Pressable onPress={() => setShowAttach((v) => !v)} style={styles.toolBtn} hitSlop={6} accessibilityLabel="Anexar arquivo">
              <Ionicons name={showAttach ? 'close' : 'attach-outline'} size={22} color={showAttach ? colors.primary : colors.muted} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Mensagem"
              placeholderTextColor={colors.faint}
              style={styles.input}
              multiline
            />
            {sending ? (
              <View style={styles.sendBtn}><ActivityIndicator color="#fff" /></View>
            ) : text.trim() ? (
              <Pressable onPress={onSend} style={styles.sendBtn} hitSlop={6} accessibilityLabel="Enviar mensagem">
                <Ionicons name="send" size={18} color="#fff" />
              </Pressable>
            ) : (
              <VoiceRecorderSheet
                onSend={sendVoice}
                disabled={sending}
                onError={(message) => actions.toast(message)}
              />
            )}
          </View>
          {showEmoji ? (
            <View style={styles.emojiBar}>
              {['😀','😂','😍','🥰','😎','🤔','😢','😡','👍','👏','🙏','🔥','❤️','🎉','💯','✨'].map((emoji) => (
                <Pressable key={emoji} onPress={() => { setText((cur) => cur + emoji); setShowEmoji(false); }} style={styles.emojiBtn}>
                  <AnimatedEmoji emoji={emoji} size={28} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {showAttach ? (
            <View style={styles.attachBar}>
              <AttachOption icon="images-outline" label="Galeria" onPress={() => { setShowAttach(false); void onPickMedia(false); }} />
              <AttachOption icon="camera-outline" label="Câmera" onPress={() => { setShowAttach(false); void onPickMedia(true); }} />
              <AttachOption icon="document-outline" label="Documentos" onPress={() => void onPickDocument()} />
              <AttachOption icon="location-outline" label="Localização" onPress={() => void onSendLocation()} />
            </View>
          ) : null}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  headerMeta: { color: colors.muted, fontSize: 12 },
  bubbleWrap: { width: '100%' },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 6 },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  bigEmojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, alignItems: 'center' },
  bubbleMeta: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end', alignItems: 'center' },
  time: { color: 'rgba(245,246,251,0.7)', fontSize: 11 },
  edited: { color: 'rgba(245,246,251,0.6)', fontSize: 11, fontStyle: 'italic' },
  attachCard: { backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: 12, padding: 8, gap: 4, marginBottom: 4 },
  attachMedia: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' },
  playOverlay: { position: 'absolute', right: 8, bottom: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  attachTitle: { color: colors.text, fontWeight: '800', fontSize: 13 },
  attachText: { color: 'rgba(245,246,251,0.85)', fontSize: 12 },
  attachHint: { color: colors.cyan, fontSize: 11, fontWeight: '700' },
  mapStub: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  toolBtn: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  toolBtnRecording: { backgroundColor: `${colors.pink}33` },
  recBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pink },
  recText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
  recTime: { color: colors.pink, fontSize: 13, fontWeight: '800' },
  emojiBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingHorizontal: 8, paddingBottom: 6, backgroundColor: colors.bg },
  emojiBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  emojiText: { fontSize: 26 },
  attachBar: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  attachOption: { flex: 1, alignItems: 'center', gap: 6 },
  attachOptionIcon: { width: 46, height: 46, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  attachOptionText: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 20, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, paddingVertical: 10 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnRecording: { backgroundColor: colors.pink },
  editBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  editLabel: { color: colors.cyan, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  editInput: { minHeight: 40, borderRadius: 12, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 12, paddingVertical: 8 },
});
