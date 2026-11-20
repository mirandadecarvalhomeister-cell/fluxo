import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import AudioBubble from './AudioBubble';
import { colors } from '../lib/theme';

// Máquina de estados compartilhada com o site (metro watchFolders inclui src/).
// @ts-ignore - módulo JavaScript compartilhado.
import {
  voiceReducer,
  initialVoiceState,
  VOICE_STATE as S,
  VOICE_EVENT as E,
  CANCEL_THRESHOLD,
  LOCK_THRESHOLD,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
} from '../../../src/lib/voiceRecording.js';

const SCALE = 0.8;

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export type VoiceMeta = { duration: number; waves: number[] };

type Props = {
  onSend: (uri: string, meta: VoiceMeta) => Promise<void>;
  disabled?: boolean;
  onError?: (message: string) => void;
};

/** Gravador gestual do app: segure, arraste à esquerda para apagar, para cima para bloquear. */
export default function VoiceRecorderSheet({ onSend, disabled = false, onError }: Props) {
  const [state, dispatch] = useReducer(voiceReducer as any, undefined, initialVoiceState as any) as [any, React.Dispatch<any>];
  const stateRef = useRef<any>(state);
  stateRef.current = state;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [busy, setBusy] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const sessionRef = useRef(0);
  const pressedRef = useRef(false);
  const discardRef = useRef(false);
  const sendLockRef = useRef(false);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  const uriRef = useRef<string | null>(null);
  const waveRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticRef = useRef({ cancel: false, lock: false });

  const warn = useCallback((message: string) => onError?.(message), [onError]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetArtifacts = useCallback(() => {
    clearTimer();
    uriRef.current = null;
    durationRef.current = 0;
    waveRef.current = [];
    setPreviewUri(null);
    setReviewReady(false);
    hapticRef.current = { cancel: false, lock: false };
  }, [clearTimer]);

  const begin = useCallback(async (session: number) => {
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        dispatch({ type: E.RECORD_FAILED, session, error: 'Permissão de microfone negada.' });
        warn('Permissão de microfone negada. Libere o acesso para gravar áudio.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      if (sessionRef.current !== session || !pressedRef.current || discardRef.current) return;
      recorder.record();
      startedAtRef.current = Date.now();
      discardRef.current = false;
      dispatch({ type: E.RECORD_STARTED, session });
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        dispatch({ type: E.TICK, elapsed: Math.floor(elapsed / 1000) });
        const bar = 0.25 + ((Math.floor(elapsed / 120) % 7) / 7) * 0.7;
        waveRef.current = [...waveRef.current, bar].slice(-96);
        if (elapsed >= MAX_DURATION_MS && recorder.isRecording) void stopCurrent('stop');
      }, 250);
    } catch (error: any) {
      dispatch({ type: E.RECORD_FAILED, session, error: error?.message || 'Falha ao iniciar a gravação.' });
      warn(error?.message || 'Não foi possível iniciar a gravação.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, warn]);

  const stopCurrent = useCallback(async (kind: 'release' | 'stop') => {
    pressedRef.current = false;
    clearTimer();
    if (recorder.isRecording) {
      setBusy(true);
      try { await recorder.stop(); } catch {}
      setBusy(false);
    }
    const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    durationRef.current = elapsed;
    if (discardRef.current || elapsed * 1000 < MIN_DURATION_MS) {
      warn(elapsed * 1000 < MIN_DURATION_MS && !discardRef.current ? 'Segure um pouco mais para gravar um áudio.' : '');
      resetArtifacts();
      sessionRef.current += 1;
      dispatch({ type: E.CANCEL });
      return;
    }
    const uri = recorder.uri;
    if (!uri) {
      resetArtifacts();
      sessionRef.current += 1;
      dispatch({ type: E.CANCEL });
      return;
    }
    uriRef.current = uri;
    setPreviewUri(uri);
    setReviewReady(true);
    dispatch({ type: kind === 'stop' ? E.STOP : E.RELEASE });
    dispatch({ type: E.SET_DURATION, duration: elapsed });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch?.(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimer, recorder, resetArtifacts, warn]);

  const discard = useCallback(() => {
    discardRef.current = true;
    pressedRef.current = false;
    sendLockRef.current = false;
    clearTimer();
    if (recorder.isRecording) {
      try { void recorder.stop(); } catch {}
    }
    resetArtifacts();
    sessionRef.current += 1;
    dispatch({ type: E.CANCEL });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch?.(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimer, recorder, resetArtifacts]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () =>
      !disabled &&
      [S.IDLE, S.SENT, S.ERROR].includes(stateRef.current.status),
    onMoveShouldSetPanResponder: () => false,
    onPanResponderGrant: (event) => {
      event.preventDefault?.();
      pressedRef.current = true;
      discardRef.current = false;
      hapticRef.current = { cancel: false, lock: false };
      const nextSession = stateRef.current.session + 1;
      sessionRef.current = nextSession;
      dispatch({ type: E.PRESS });
      void begin(nextSession);
    },
    onPanResponderMove: (_event, gesture) => {
      const status = stateRef.current.status;
      if (status !== S.RECORDING && status !== S.CANCEL_PENDING) return;
      const dx = Math.round(gesture.dx / SCALE);
      const dy = Math.round(gesture.dy / SCALE);
      const cancel = -dx >= CANCEL_THRESHOLD;
      const lock = -dy >= LOCK_THRESHOLD && !cancel;
      if (cancel && !hapticRef.current.cancel) {
        hapticRef.current.cancel = true;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch?.(() => {});
      }
      if (lock && !hapticRef.current.lock) {
        hapticRef.current.lock = true;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch?.(() => {});
      }
      if (!cancel) hapticRef.current.cancel = false;
      if (!lock) hapticRef.current.lock = false;
      dispatch({ type: E.MOVE, dx, dy });
    },
    onPanResponderRelease: () => {
      const status = stateRef.current.status;
      if (status === S.RECORDING) void stopCurrent('release');
      else if (status === S.CANCEL_PENDING) discard();
      // LOCKED_RECORDING: soltar não encerra.
    },
    onPanResponderTerminate: () => {
      const status = stateRef.current.status;
      if (status === S.RECORDING || status === S.CANCEL_PENDING) discard();
    },
  }), [begin, discard, disabled, stopCurrent]);

  useEffect(() => () => {
    pressedRef.current = false;
    discardRef.current = true;
    clearTimer();
    if (recorder.isRecording) {
      try { void recorder.stop(); } catch {}
    }
  }, [clearTimer, recorder]);

  const send = useCallback(async () => {
    if (sendLockRef.current || stateRef.current.status !== S.REVIEW || !uriRef.current) return;
    sendLockRef.current = true;
    const uri = uriRef.current;
    const meta: VoiceMeta = { duration: Math.max(1, durationRef.current), waves: [...waveRef.current] };
    dispatch({ type: E.SEND });
    try {
      await onSend(uri, meta);
      dispatch({ type: E.UPLOAD_OK });
      setTimeout(() => {
        resetArtifacts();
        sessionRef.current += 1;
        dispatch({ type: E.RESET });
      }, 420);
    } catch (error: any) {
      dispatch({ type: E.UPLOAD_FAIL, error: error?.message || 'Falha no envio do áudio.' });
      warn(error?.message || 'Falha no envio do áudio. Tente novamente.');
    } finally {
      sendLockRef.current = false;
    }
  }, [onSend, resetArtifacts, warn]);

  const status = state.status;
  const held = status === S.RECORDING || status === S.CANCEL_PENDING;
  const locked = status === S.LOCKED_RECORDING;
  const reviewing = status === S.REVIEW && reviewReady && previewUri;
  const uploading = status === S.UPLOADING || busy;
  const errored = status === S.ERROR && !busy;
  const cancelHot = state.cancelProgress > 0.65;
  const lockHot = state.lockProgress > 0.65;
  const waveBars = Array.from({ length: 26 }, (_, index) => {
    if (waveRef.current.length) {
      return waveRef.current[Math.floor((index / 26) * waveRef.current.length)] || 0.2;
    }
    return 0.2 + ((index * 7 + state.elapsed) % 6) * 0.09;
  });

  return (
    <View style={styles.root}>
      {held ? (
        <>
          <View style={[styles.target, styles.cancelTarget, cancelHot && styles.targetHot]} pointerEvents="none">
            <Ionicons name="trash" size={20} color="#fff" />
          </View>
          <View style={[styles.target, styles.lockTarget, lockHot && styles.lockTargetHot]} pointerEvents="none">
            <Ionicons name="lock-closed" size={17} color={lockHot ? colors.primary : colors.muted} />
            <Text style={[styles.lockHint, lockHot && { color: colors.primary }]}>Bloqueie para gravar livre</Text>
          </View>
          <View style={[styles.floating, cancelHot && styles.floatingCancel]} pointerEvents="none">
            <View style={styles.recDot} />
            <Text style={styles.floatingTime}>{clock(state.elapsed)}</Text>
            <View style={styles.floatingWave}>
              {waveBars.map((bar, index) => (
                <View key={index} style={[styles.floatingBar, { height: `${Math.round(bar * 100)}%` }]} />
              ))}
            </View>
            <Text style={styles.floatingHint}>{cancelHot ? 'Solte para apagar' : 'Solte para ouvir'}</Text>
          </View>
        </>
      ) : null}

      {!reviewing && !uploading && !errored ? (
        locked ? (
          <View style={styles.locked}>
            <View style={styles.lockBadge}><Ionicons name="lock-closed" size={14} color="#fff" /></View>
            <View style={styles.recDot} />
            <Text style={styles.lockedTime}>{clock(state.elapsed)}</Text>
            <View style={styles.floatingWave}>
              {waveBars.map((bar, index) => (
                <View key={index} style={[styles.floatingBar, { height: `${Math.round(bar * 100)}%` }]} />
              ))}
            </View>
            <Pressable onPress={() => void stopCurrent('stop')} style={[styles.miniBtn, styles.stopBtn]} accessibilityLabel="Parar gravação">
              <Ionicons name="stop" size={14} color="#fff" />
            </Pressable>
            <Pressable onPress={discard} style={[styles.miniBtn, styles.deleteBtn]} accessibilityLabel="Excluir gravação">
              <Ionicons name="trash" size={14} color={colors.pink} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            {...pan.panHandlers}
            style={[styles.mic, disabled && styles.micDisabled, held && styles.micHeld, cancelHot && styles.micCancel]}
            accessibilityLabel="Segure para gravar áudio"
            disabled={disabled}
          >
            <Ionicons name={held ? 'radio' : 'mic'} size={20} color="#fff" />
          </Pressable>
        )
      ) : null}

      {reviewing ? (
        <View style={styles.review}>
          <AudioBubble url={previewUri} duration={durationRef.current} waves={waveRef.current} showControls mine />
          <View style={styles.reviewActions}>
            <Pressable onPress={discard} style={styles.action} accessibilityLabel="Apagar áudio">
              <Ionicons name="trash" size={18} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => { resetArtifacts(); sessionRef.current += 1; dispatch({ type: E.RESET }); }} style={styles.action} accessibilityLabel="Gravar novamente">
              <Ionicons name="mic" size={18} color={colors.text} />
            </Pressable>
            <Pressable onPress={() => void send()} style={[styles.action, styles.sendAction]} accessibilityLabel="Enviar áudio">
              <Ionicons name="send" size={17} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : null}

      {uploading ? (
        <View style={styles.banner}><Text style={styles.bannerText}>Enviando áudio…</Text></View>
      ) : null}
      {errored ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{state.error || 'Não foi possível gravar.'}</Text>
          <Pressable onPress={() => dispatch({ type: E.RETRY })}><Text style={styles.bannerBtn}>Tentar novamente</Text></Pressable>
          <Pressable onPress={discard}><Text style={styles.bannerBtn}>Cancelar</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', alignItems: 'flex-end', justifyContent: 'flex-end' },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, touchAction: 'none' } as any,
  micDisabled: { opacity: 0.4 },
  micHeld: { backgroundColor: colors.pink, transform: [{ scale: 1.08 }] },
  micCancel: { backgroundColor: '#e11d48' },
  target: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  cancelTarget: { left: -48, bottom: 4, width: 42, height: 42, backgroundColor: '#e11d48', opacity: 0.7 },
  lockTarget: { left: 4, bottom: 50, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.surfaceAlt, borderRadius: 14, opacity: 0.75 },
  targetHot: { opacity: 1, transform: [{ scale: 1.16 }] },
  lockTargetHot: { opacity: 1, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.primary },
  lockHint: { fontSize: 10, color: colors.muted },
  floating: { position: 'absolute', right: -4, bottom: 50, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, backgroundColor: 'rgba(10,6,26,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  floatingCancel: { backgroundColor: 'rgba(122,17,45,0.96)' },
  floatingTime: { color: '#fff', fontSize: 12, fontWeight: '800' },
  floatingHint: { color: 'rgba(255,255,255,0.7)', fontSize: 9 },
  floatingWave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 18, width: 62 },
  floatingBar: { width: 2, borderRadius: 1, backgroundColor: colors.cyan, minHeight: 3, maxHeight: 18 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.surfaceAlt },
  lockBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pink },
  lockedTime: { color: colors.text, fontSize: 12, fontWeight: '800' },
  miniBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stopBtn: { backgroundColor: colors.primary },
  deleteBtn: { backgroundColor: 'rgba(225,29,72,0.14)' },
  review: { position: 'absolute', right: 0, bottom: 48, width: 300, maxWidth: 320, gap: 8, padding: 8, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  reviewActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  action: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  sendAction: { backgroundColor: colors.primary },
  banner: { position: 'absolute', right: 0, bottom: 48, width: 280, padding: 10, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  bannerText: { color: colors.text, fontSize: 12, flexShrink: 1 },
  bannerBtn: { color: colors.cyan, fontSize: 11, fontWeight: '700' },
});
