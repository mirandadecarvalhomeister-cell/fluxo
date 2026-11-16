import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { uploadMedia } from '../lib/api';
import StackHeader from '../components/StackHeader';
import { AvatarView, GhostButton, Input, PrimaryButton } from '../components/Ui';
import { colors, spacing } from '../lib/theme';

export default function EditProfileScreen() {
  const { profile, actions } = useApp();
  const [name, setName] = useState(profile?.name || '');
  const [handle, setHandle] = useState(profile?.handle || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [city, setCity] = useState(profile?.city || '');
  const [avatar, setAvatar] = useState(profile?.avatar || '');
  const [saving, setSaving] = useState(false);

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled && res.assets[0]) setAvatar(res.assets[0].uri);
  }

  async function save() {
    if (!profile?.id) {
      Alert.alert('Sessão expirada', 'Entre novamente para salvar o perfil.');
      return;
    }
    setSaving(true);
    try {
      let nextAvatar = avatar || null;
      if (nextAvatar && /^(file|content|ph|assets-library):/.test(nextAvatar)) {
        const uploaded = await uploadMedia({
          uri: nextAvatar,
          userId: profile.id,
          fileName: `avatar-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
        });
        nextAvatar = uploaded.url;
      }
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
        cover: profile.cover || null,
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

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title="Editar perfil" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 12, paddingBottom: 40, alignItems: 'center' }}>
        <AvatarView user={{ name, handle, avatar } as any} size={90} />
        <GhostButton title="Alterar foto" icon="image-outline" onPress={pickAvatar} />
        <Input label="Nome" value={name} onChangeText={setName} style={{ alignSelf: 'stretch' }} />
        <Input label="Usuário" value={handle} onChangeText={setHandle} autoCapitalize="none" style={{ alignSelf: 'stretch' }} />
        <Input label="Bio" value={bio} onChangeText={setBio} multiline style={{ alignSelf: 'stretch', minHeight: 80, textAlignVertical: 'top' }} />
        <Input label="Cidade" value={city} onChangeText={setCity} style={{ alignSelf: 'stretch' }} />
        <PrimaryButton title="Salvar" onPress={save} loading={saving} style={{ alignSelf: 'stretch' }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
