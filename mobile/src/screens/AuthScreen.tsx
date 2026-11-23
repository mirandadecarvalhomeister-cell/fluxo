import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';
import { Card, GhostButton, H1, Input, Muted, PrimaryButton } from '../components/Ui';
import { useApp } from '../context/AppContext';

// Paleta do site (src/lib/art.js PAL) — mesmos pares de cores dos orbs do login web.
const ORB_PAIRS = [
  ['#5B35E8', '#F0386B'],
  ['#0EA5A4', '#5B35E8'],
  ['#F59E0B', '#EF4444'],
  ['#10B981', '#3B82F6'],
  ['#EC4899', '#8B5CF6'],
  ['#14B8A6', '#F59E0B'],
  ['#6366F1', '#22D3EE'],
  ['#F97316', '#DB2777'],
] as const;

function Orbit() {
  const spin = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 48000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const small = width < 820;
  const orbitSize = small ? 200 : 260;
  const radiusPx = small ? 82 : 108;

  return (
    <Animated.View pointerEvents="none" style={[styles.orbit, { width: orbitSize, height: orbitSize, transform: [{ rotate }] }]}>
      {ORB_PAIRS.map(([a, b], i) => {
        const z = small ? 38 : (i % 2 ? 40 : 54);
        return (
          <View
            key={i}
            style={[
              styles.orb,
              {
                left: orbitSize / 2,
                top: orbitSize / 2,
                width: z,
                height: z,
                marginLeft: -z / 2,
                marginTop: -z / 2,
                borderRadius: z / 2,
                transform: [{ rotate: `${i * 45}deg` }, { translateY: -radiusPx }],
              },
            ]}
          >
            <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.orbFill} />
          </View>
        );
      })}
    </Animated.View>
  );
}

export default function AuthScreen() {
  const { actions } = useApp();
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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

  async function google() {
    setGoogleLoading(true);
    setError(null);
    try {
      const err = await actions.signInWithGoogle();
      if (err) setError(err);
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Fundo branco, igual ao site */}
      <View style={StyleSheet.absoluteFill} />
      <Orbit />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Image
              source={require('../../assets/fluxo-wordmark.png')}
              style={styles.wordmark}
              contentFit="contain"
              accessibilityLabel="Fluxo"
            />
            <Muted style={{ textAlign: 'center', color: '#5B5478' }}>
              Conversas, comunidades e lives em um só lugar.
            </Muted>
          </View>

          <Card style={{ gap: 12 }}>
            <H1 style={{ fontSize: 22, color: colors.text }}>
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
                <View style={styles.or}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>ou</Text>
                  <View style={styles.orLine} />
                </View>
                <Pressable onPress={google} disabled={googleLoading} style={styles.googleBtn}>
                  <Ionicons name="logo-google" size={18} color="#4285F4" />
                  <Text style={styles.googleText}>Continuar com Google</Text>
                </Pressable>
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
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  orbit: { position: 'absolute', top: '12%', alignSelf: 'center', zIndex: 0 },
  orb: { position: 'absolute', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
  orbFill: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: 20, zIndex: 1 },
  brand: { alignItems: 'center', gap: 2, marginBottom: 8 },
  wordmark: { width: 96, height: 32, transform: [{ translateY: -8 }] },
  error: { color: colors.danger, fontWeight: '600' },
  success: { color: colors.success, fontWeight: '600' },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.muted, fontSize: 13 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  googleText: { color: colors.text, fontWeight: '700', fontSize: 15 },
});
