import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing } from '../lib/theme';
import { Card, GhostButton, H1, Input, Muted, PrimaryButton } from '../components/Ui';
import { useApp } from '../context/AppContext';

export default function AuthScreen() {
  const { actions } = useApp();
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'in') {
        const err = await actions.signIn(email, password);
        if (err) setError(err);
      } else if (mode === 'up') {
        const res = await actions.signUp(name, email, password);
        if (res.error) setError(res.error);
        else if (res.needsConfirmation) {
          setMessage('Conta criada! Confirme seu e-mail para entrar.');
          setMode('in');
        }
      } else {
        const err = await actions.requestReset(email);
        if (err) setError(err);
        else setMessage('Enviamos um link de recuperação para seu e-mail.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <LinearGradient colors={['#120a24', '#05060a']} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.logo}>Fluxo</Text>
            <Muted style={{ textAlign: 'center' }}>Vídeos, mensagens e lives em um só lugar.</Muted>
          </View>

          <Card style={{ gap: 12 }}>
            <H1 style={{ fontSize: 22 }}>
              {mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : 'Recuperar senha'}
            </H1>

            {mode === 'up' ? (
              <Input label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" autoCapitalize="words" />
            ) : null}
            <Input
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              placeholder="voce@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {mode !== 'reset' ? (
              <Input
                label="Senha"
                value={password}
                onChangeText={setPassword}
                placeholder="Sua senha"
                secureTextEntry
              />
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {message ? <Text style={styles.success}>{message}</Text> : null}

            <PrimaryButton
              title={mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : 'Enviar link'}
              onPress={submit}
              loading={loading}
              disabled={!email || (mode !== 'reset' && !password) || (mode === 'up' && !name)}
            />

            {mode === 'in' ? (
              <>
                <GhostButton title="Esqueci minha senha" onPress={() => { setMode('reset'); setError(null); setMessage(null); }} />
                <GhostButton title="Criar uma conta" onPress={() => { setMode('up'); setError(null); setMessage(null); }} />
              </>
            ) : (
              <GhostButton title="Voltar para entrar" onPress={() => { setMode('in'); setError(null); setMessage(null); }} />
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: 20 },
  brand: { alignItems: 'center', gap: 8 },
  logo: { color: colors.text, fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  error: { color: colors.danger, fontWeight: '600' },
  success: { color: colors.success, fontWeight: '600' },
});
