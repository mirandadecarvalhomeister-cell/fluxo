import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import StackHeader from '../components/StackHeader';
import { Card, GhostButton } from '../components/Ui';
import { colors, spacing } from '../lib/theme';
import { isLiveKitConfigured, isSupabaseConfigured, APP_VERSION } from '../lib/env';

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
    </View>
  );
}

export default function SettingsScreen() {
  const { prefs, actions } = useApp();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await actions.signOut();
    setBusy(false);
  }

  function deleteAccount() {
    Alert.alert('Excluir conta', 'Isso remove sua conta e dados. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          setBusy(true);
          const err = await actions.deleteAccount();
          setBusy(false);
          if (err) actions.toast(err);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.root}>
      <StackHeader title="Configurações" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: 14, paddingBottom: 40 }}>
        <Card style={{ gap: 8 }}>
          <Text style={styles.section}>Preferências</Text>
          <Row label="Reproduzir vídeos automaticamente" value={prefs.autoplay} onChange={(v) => actions.setPreferences({ autoplay: v })} />
          <Row label="Economia de dados (desliga autoplay)" value={prefs.dataSaver} onChange={(v) => actions.setPreferences({ dataSaver: v })} />
          <Row label="Som por padrão" value={prefs.sound} onChange={(v) => actions.setPreferences({ sound: v })} />
          <Row label="Reduzir movimento" value={prefs.reduceMotion} onChange={(v) => actions.setPreferences({ reduceMotion: v })} />
          <Row label="Notificações locais" value={prefs.notifications} onChange={(v) => actions.setPreferences({ notifications: v })} />
        </Card>

        <Card style={{ gap: 6 }}>
          <Text style={styles.section}>Sobre</Text>
          <Text style={styles.meta}>Versão {APP_VERSION}</Text>
          <Text style={styles.meta}>Supabase: {isSupabaseConfigured ? 'configurado' : 'não configurado'}</Text>
          <Text style={styles.meta}>LiveKit: {isLiveKitConfigured ? 'configurado' : 'não configurado'}</Text>
          <Text style={styles.meta}>Vídeo de lives (LiveKit nativo): não implementado nesta versão. Chat e enquetes de lives funcionam em tempo real.</Text>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={styles.section}>Conta</Text>
          <GhostButton title="Sair" icon="log-out-outline" onPress={signOut} />
          <GhostButton title="Excluir conta" icon="trash-outline" danger onPress={deleteAccount} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  section: { color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  label: { color: colors.text, flex: 1, paddingRight: 12 },
  meta: { color: colors.muted, lineHeight: 20 },
});
