import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { GhostButton, Input, PrimaryButton } from '../components/Ui';
import { colors, radius, spacing } from '../lib/theme';
import { MAX_VIDEO_SECONDS } from '../lib/media';

export default function CreateScreen() {
  const { actions, publishing } = useApp();
  const [text, setText] = useState('');
  const [assets, setAssets] = useState<{ uri: string; kind: 'photo' | 'video'; duration?: number; mimeType?: string; fileName?: string | null }[]>([]);

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

  function addAssets(assets: ImagePicker.ImagePickerAsset[]) {
    const picked = assets.map((a) => ({
      uri: a.uri,
      kind: (a.type === 'video' ? 'video' : 'photo') as 'photo' | 'video',
      // A duração do seletor vem em milissegundos; o upload converte para segundos.
      duration: a.duration ? Math.round(a.duration) : undefined,
      mimeType: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      fileName: a.fileName || null,
    }));
    setAssets((cur) => [...cur, ...picked].slice(0, 10));
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
    const err = await actions.publish({ text, assets, format: 'classic' as any });
    if (err) Alert.alert('Erro ao publicar', err);
    else {
      setText('');
      setAssets([]);
      actions.go('home');
      actions.toast('Publicação criada!');
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14, paddingBottom: 40 }}>
          <Text style={styles.title}>Criar publicação</Text>
          <Input label="Texto" value={text} onChangeText={setText} placeholder="O que você quer compartilhar?" multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />

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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  asset: { width: '48%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  videoStub: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#11131d', gap: 4 },
  removeWrap: { position: 'absolute', left: 6, right: 6, bottom: 6 },
});
