import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { uploadMedia } from '../lib/api';
import StackHeader from '../components/StackHeader';
import { AvatarView, Card, GhostButton, Input, PrimaryButton } from '../components/Ui';
import { colors, gradients, radius, spacing } from '../lib/theme';
import { coverImageUri } from '../lib/media';

export default function EditProfileScreen() {
  const { profile, actions } = useApp();
  const [name, setName] = useState(profile?.name || '');
  const [handle, setHandle] = useState(profile?.handle || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [city, setCity] = useState(profile?.city || '');
  const [avatar, setAvatar] = useState(profile?.avatar || '');
  const [coverUrl, setCoverUrl] = useState<string | null>(coverImageUri(profile?.cover));
  const [saving, setSaving] = useState(false);

  async function pickImage(aspect: [number, number]): Promise<string | null> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect,
    });
    if (!res.canceled && res.assets[0]) return res.assets[0].uri;
    return null;
  }

  async function pickAvatar() {
    const uri = await pickImage([1, 1]);
    if (uri) setAvatar(uri);
  }

  async function pickCover() {
    const uri = await pickImage([16, 9]);
    if (uri) setCoverUrl(uri);
  }

  async function uploadIfLocal(uri: string | null, prefix: string): Promise<string | null> {
    if (uri && /^(file|content|ph|assets-library):/.test(uri)) {
      const uploaded = await uploadMedia({
        uri,
        userId: profile!.id,
        fileName: `${prefix}-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
      return uploaded.url;
    }
    return uri;
  }

  async function save() {
    if (!profile?.id) {
      Alert.alert('Sessão expirada', 'Entre novamente para salvar o perfil.');
      return;
    }
    setSaving(true);
    try {
      const nextAvatar = await uploadIfLocal(avatar || null, 'avatar');
      const nextCover = await uploadIfLocal(coverUrl, 'cover');
      const err = await actions.updateProfile({
        id: profile.id,
        name,
        handle,
        bio,
        city,
        avatar: nextAvatar,
        humor: profile.humor || '',
        interests: profile.interests || [],
        followers: profile.followers || 0,
        cover: nextCover ? { k: 'img', v: nextCover } : (profile.cover ?? null),
      });
      if (err) Alert.alert('Erro', err);
      else {
        actions.toast('Perfil atualizado.');
        actions.pop();
      }
    } catch (error: any) {
      Alert.alert('Erro', error?.message || 'Não foi possível salvar o perfil.');
    } finally {
      setSaving(false);
    }
  }

  const coverSource = coverUrl ? { uri: coverUrl } : null;

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title="Editar perfil" />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Fotos: capa + avatar */}
        <Card style={styles.photosCard}>
          <Text style={styles.cardTitle}>Fotos do perfil</Text>
          <View style={styles.coverPreview}>
            {coverSource ? (
              <Image source={coverSource} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={gradients.brand} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
            )}
            <View style={styles.coverActions}>
              <GhostButton title="Alterar capa" icon="image-outline" onPress={pickCover} />
            </View>
          </View>
          <View style={styles.avatarRow}>
            <AvatarView user={{ name, handle, avatar } as any} size={72} />
            <View style={{ flex: 1 }}>
              <GhostButton title="Alterar foto" icon="camera-outline" onPress={pickAvatar} />
            </View>
          </View>
        </Card>

        {/* Dados do perfil */}
        <Card style={styles.fieldsCard}>
          <Text style={styles.cardTitle}>Dados do perfil</Text>
          <View style={styles.field}><Input label="Nome" value={name} onChangeText={setName} /></View>
          <View style={styles.field}><Input label="Usuário" value={handle} onChangeText={setHandle} autoCapitalize="none" /></View>
          <View style={styles.field}><Input label="Bio" value={bio} onChangeText={setBio} multiline style={{ minHeight: 84, textAlignVertical: 'top' }} /></View>
          <View style={styles.field}><Input label="Cidade" value={city} onChangeText={setCity} /></View>
        </Card>

        <PrimaryButton title="Salvar alterações" onPress={save} loading={saving} style={styles.saveBtn} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: 14, paddingBottom: 40 },
  photosCard: { gap: 12 },
  fieldsCard: { gap: 4 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  coverPreview: { width: '100%', height: 120, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end' },
  coverActions: { padding: 8 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  field: { width: '100%' },
  saveBtn: { marginTop: 4 },
});
