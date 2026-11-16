import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { GhostButton, Input, PrimaryButton } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { MAX_VIDEO_SECONDS } from '../lib/media';
import { INTERACTIVE_FORMATS, MAX_OPTIONS, MIN_OPTIONS } from '../lib/interactive';

type Fmt = 'classic' | 'poll' | 'question' | 'imageVote' | 'challenge';

export default function CreateScreen() {
  const { actions, publishing, users, profile } = useApp();
  const [text, setText] = useState('');
  const [assets, setAssets] = useState<{ uri: string; kind: 'photo' | 'video'; duration?: number; mimeType?: string; fileName?: string | null }[]>([]);
  const [format, setFormat] = useState<Fmt>('classic');
  const [options, setOptions] = useState<{ id: string; label: string; mediaIndex?: number }[]>([
    { id: 'opt-1', label: '' },
    { id: 'opt-2', label: '' },
  ]);
  const [invited, setInvited] = useState<string[]>([]);

  const isPoll = format === 'poll';
  const isImageVote = format === 'imageVote';
  const isChallenge = format === 'challenge';
  const showOptions = isPoll || isImageVote;

  function setOption(id: string, label: string) {
    setOptions((cur) => cur.map((o) => (o.id === id ? { ...o, label } : o)));
  }
  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((cur) => [...cur, { id: `opt-${Date.now()}`, label: '' }]);
  }
  function removeOption(id: string) {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((cur) => cur.filter((o) => o.id !== id));
  }
  function toggleInvite(id: string) {
    setInvited((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, 20)));
  }

  async function pick(kind: 'photo' | 'video') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Permita acesso à galeria para publicar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'video' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: kind === 'photo',
      quality: 0.9,
      videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    if (result.canceled) return;
    addAssets(result.assets);
  }

  async function capture(kind: 'photo' | 'video') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Permita acesso à câmera para gravar fotos e vídeos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: kind === 'video' ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    if (result.canceled) return;
    addAssets(result.assets);
  }

  function addAssets(picked: ImagePicker.ImagePickerAsset[]) {
    const mapped = picked.map((a) => ({
      uri: a.uri,
      kind: (a.type === 'video' ? 'video' : 'photo') as 'photo' | 'video',
      duration: a.duration ? Math.round(a.duration) : undefined,
      mimeType: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      fileName: a.fileName || null,
    }));
    setAssets((cur) => [...cur, ...mapped].slice(0, 10));
    if (isImageVote) {
      setOptions((cur) => {
        const base = cur.length ? cur : [{ id: 'opt-1', label: '' }, { id: 'opt-2', label: '' }];
        return base.map((o, i) => ({ ...o, mediaIndex: i }));
      });
    }
  }

  function openCamera() {
    Alert.alert('Câmera', 'O que você quer capturar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Foto', onPress: () => capture('photo') },
      { text: 'Vídeo', onPress: () => capture('video') },
    ]);
  }

  async function publish() {
    if (!text.trim() && !assets.length) {
      Alert.alert('Nada para publicar', 'Adicione um texto, foto ou vídeo.');
      return;
    }
    if (showOptions) {
      const valid = options.filter((o) => o.label.trim());
      if (valid.length < MIN_OPTIONS) {
        Alert.alert('Faltam opções', `Adicione pelo menos ${MIN_OPTIONS} alternativas.`);
        return;
      }
      if (isImageVote && assets.length < MIN_OPTIONS) {
        Alert.alert('Faltam imagens', 'Adicione pelo menos duas imagens para a votação.');
        return;
      }
    }
    const payloadOptions = showOptions
      ? options
          .filter((o) => o.label.trim())
          .map((o, i) => ({ ...o, label: o.label.trim(), mediaIndex: isImageVote ? i : undefined }))
      : undefined;

    const err = await actions.publish({
      text,
      assets,
      format,
      options: payloadOptions,
      invited: isChallenge ? invited : undefined,
    });
    if (err) Alert.alert('Erro ao publicar', err);
    else {
      setText('');
      setAssets([]);
      setOptions([{ id: 'opt-1', label: '' }, { id: 'opt-2', label: '' }]);
      setInvited([]);
      setFormat('classic');
      actions.go('home');
      actions.toast('Publicação criada!');
    }
  }

  const formatInfo = INTERACTIVE_FORMATS.find((f) => f.id === format);
  const friends = Object.values(users).filter((u) => u.id !== profile?.id).slice(0, 30);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14, paddingBottom: 40 }}>
          <Text style={styles.title}>Criar publicação</Text>

          {/* Seletor de formato */}
          <Text style={styles.label}>Formato</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {INTERACTIVE_FORMATS.filter((f) => f.id !== 'reactions').map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setFormat(f.id as Fmt)}
                style={[styles.chip, format === f.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, format === f.id && styles.chipTextOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {formatInfo?.hint ? <Text style={styles.hint}>{formatInfo.hint}</Text> : null}

          <Input
            label="Texto"
            value={text}
            onChangeText={setText}
            placeholder={isPoll ? 'Faça uma pergunta para a galera votar…' : isChallenge ? 'Qual desafio você propõe?' : isImageVote ? 'Descreva a votação…' : 'O que você quer compartilhar?'}
            multiline
            style={{ minHeight: 100, textAlignVertical: 'top' }}
          />

          {/* Opções de enquete */}
          {isPoll ? (
            <View style={styles.section}>
              <Text style={styles.label}>Alternativas</Text>
              {options.map((o, i) => (
                <View key={o.id} style={styles.optionRow}>
                  <Input value={o.label} onChangeText={(t) => setOption(o.id, t)} placeholder={`Opção ${i + 1}`} style={{ flex: 1 }} />
                  {options.length > MIN_OPTIONS ? (
                    <Pressable onPress={() => removeOption(o.id)} hitSlop={8} style={styles.iconBtn}>
                      <Ionicons name="close-circle-outline" size={24} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {options.length < MAX_OPTIONS ? <GhostButton title="Adicionar alternativa" icon="add" onPress={addOption} /> : null}
            </View>
          ) : null}

          {/* Votação por imagens: legenda por imagem */}
          {isImageVote ? (
            <View style={styles.section}>
              <Text style={styles.label}>Legenda das imagens</Text>
              <Text style={styles.hint}>Adicione pelo menos duas imagens. Cada imagem vira uma opção.</Text>
              {assets.map((_, i) => (
                <Input
                  key={i}
                  value={options[i]?.label || ''}
                  onChangeText={(t) => setOptions((cur) => {
                    const next = [...cur];
                    while (next.length <= i) next.push({ id: `opt-${next.length + 1}`, label: '' });
                    next[i] = { ...next[i], label: t, mediaIndex: i };
                    return next;
                  })}
                  placeholder={`Opção ${i + 1}`}
                />
              ))}
            </View>
          ) : null}

          {/* Convites do desafio */}
          {isChallenge ? (
            <View style={styles.section}>
              <Text style={styles.label}>Convidar amigos ({invited.length}/20)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {friends.map((u) => (
                  <Pressable key={u.id} onPress={() => toggleInvite(u.id)} style={[styles.chip, invited.includes(u.id) && styles.chipOn]}>
                    <Text style={[styles.chipText, invited.includes(u.id) && styles.chipTextOn]}>{u.name?.split(' ')[0]}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* Mídia */}
          {assets.length ? (
            <View style={styles.grid}>
              {assets.map((asset, i) => (
                <View key={`${asset.uri}-${i}`} style={styles.asset}>
                  {asset.kind === 'photo' ? (
                    <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.videoStub]}>
                      <Ionicons name="videocam" size={28} color="#fff" />
                      {asset.duration ? <Text style={{ color: '#fff', fontSize: 12 }}>{Math.round(asset.duration / 1000)}s</Text> : null}
                    </View>
                  )}
                  <View style={styles.removeWrap}>
                    <GhostButton title="Remover" onPress={() => setAssets((cur) => cur.filter((_, idx) => idx !== i))} style={{ minHeight: 30, paddingHorizontal: 10 }} />
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><GhostButton title="Foto" icon="image-outline" onPress={() => pick('photo')} /></View>
            <View style={{ flex: 1 }}><GhostButton title="Vídeo" icon="videocam-outline" onPress={() => pick('video')} /></View>
          </View>
          <GhostButton title="Câmera" icon="camera-outline" onPress={openCamera} />

          <PrimaryButton title={publishing ? 'Publicando…' : 'Publicar'} icon="cloud-upload-outline" onPress={publish} loading={publishing} disabled={publishing} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  label: { color: colors.text, fontWeight: '800', fontSize: 14, marginBottom: 2 },
  hint: { color: colors.muted, fontSize: 12 },
  section: { gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  asset: { width: '48%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  videoStub: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#11131d', gap: 4 },
  removeWrap: { position: 'absolute', left: 6, right: 6, bottom: 6 },
});
