import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from './lib/theme';
import { useApp } from './context/AppContext';
import AuthScreen from './screens/AuthScreen';
import AppShell from './navigation/AppShell';

export default function Root() {
  const { booting, session } = useApp();

  if (booting) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando Fluxo…</Text>
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return <AppShell />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 15,
  },
});
