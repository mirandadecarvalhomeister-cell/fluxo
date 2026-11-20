import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Icon } from './Icon';
import AudioPlayer, { formatAudioTime } from './AudioPlayer';
import { stopAllPlayback } from '../lib/audioPlayback';
import { friendlyError } from '../lib/errors';
import {
  voiceReducer,
  initialVoiceState,
  VOICE_STATE as S,
  VOICE_EVENT as E,
  CANCEL_THRESHOLD,
  LOCK_THRESHOLD,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
} from '../lib/voiceRecording';

const WAVE_BARS = 28;
const gestureScale = () => (typeof window !== 'undefined' && window.innerWidth < 600 ? 0.8 : 1);

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* sem vibração */ }
}

/**
 * Gravador gestual integro à barra de digitação.
 * - Segurar e soltar: envio imediato, sem prévia.
 * - Arrastar à esquerda: lixeira (no lugar do botão de emojis) cancela.
 * - Arrastar para cima: cadeado; soltar o dedo mantém a gravação.
 * - Parar com cadeado: pausa e mostra prévia dentro da barra, com reproduzir,
 *   apagar, retomar a gravação ou enviar.
 */
export default function VoiceRecorder({
  onSend,
  disabled = false,
  compact = false,
  onError,
  onActiveChange,
  label = 'Segure para gravar · ← apagar · ↑ pausar',
  className = '',
}) {
  const [state, dispatch] = useReducer(voiceReducer, undefined, initialVoiceState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [waves, setWaves] = useState([]);
  const [blobReady, setBlobReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sampleTimerRef = useRef(null);
  const timerRef = useRef(null);
  const waveRef = useRef([]);
  const startedAtRef = useRef(0);
  const sessionRef = useRef(0);
  const dragOriginRef = useRef(null);
  const discardRef = useRef(false);
  const pressedRef = useRef(false);
  const sendLockRef = useRef(false);
  const autoSendRef = useRef(false);
  const pauseForReviewRef = useRef(false);
  const hapticRef = useRef({ cancel: false, lock: false });
  const previewUrlRef = useRef('');
  const blobRef = useRef(null);
  const mountedRef = useRef(true);

  const notify = useCallback((message) => onError?.(message), [onError]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopSampling = useCallback(() => {
    if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    sampleTimerRef.current = null;
    timerRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = '';
    setPreviewUrl('');
  }, []);

  const resetArtifacts = useCallback(() => {
    stopSampling();
    stopStream();
    clearPreview();
    chunksRef.current = [];
    waveRef.current = [];
    setWaves([]);
    blobRef.current = null;
    setBlobReady(false);
    startedAtRef.current = 0;
    autoSendRef.current = false;
    pauseForReviewRef.current = false;
    hapticRef.current = { cancel: false, lock: false };
  }, [clearPreview, stopSampling, stopStream]);

  const discard = useCallback(() => {
    discardRef.current = true;
    pressedRef.current = false;
    sendLockRef.current = false;
    autoSendRef.current = false;
    pauseForReviewRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else resetArtifacts();
    sessionRef.current += 1;
    dispatch({ type: E.CANCEL });
    vibrate(20);
  }, [resetArtifacts]);

  const uploadBlob = useCallback(async () => {
    if (sendLockRef.current) return;
    if (!blobRef.current || typeof onSend !== 'function') return;
    sendLockRef.current = true;
    const blob = blobRef.current;
    const meta = {
      duration: Math.max(1, Math.round(stateRef.current.duration || 0)),
      waves: [...waveRef.current],
      mime: blob.type || 'audio/webm',
    };
    try {
      await onSend(blob, meta);
      if (!mountedRef.current) return;
      dispatch({ type: E.UPLOAD_OK });
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        resetArtifacts();
        sessionRef.current += 1;
        dispatch({ type: E.RESET });
      }, 300);
    } catch (error) {
      if (!mountedRef.current) return;
      dispatch({ type: E.UPLOAD_FAIL, error: friendlyError(error, 'Falha no envio do áudio.') });
      notify(friendlyError(error, 'Falha no envio do áudio. Tente novamente.'));
    } finally {
      sendLockRef.current = false;
    }
  }, [notify, onSend, resetArtifacts]);

  const beginRecording = useCallback(async (session, resume = false) => {
    let stream = streamRef.current;
    if (!resume) {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        dispatch({ type: E.RECORD_FAILED, session, error: 'Gravação não suportada.' });
        notify('Gravação de áudio não é suportada neste navegador.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        dispatch({ type: E.RECORD_FAILED, session, error: 'Permissão negada.' });
        notify('Permissão de microfone negada. Libere o acesso para gravar áudio.');
        return;
      }
      if (sessionRef.current !== session || !pressedRef.current || discardRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
    }
    if (!stream) return;
    streamRef.current = stream;

    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(
      (type) => MediaRecorder.isTypeSupported?.(type)
    );
    let recorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stopStream();
      dispatch({ type: E.RECORD_FAILED, session, error: 'Falha ao iniciar.' });
      notify('Não foi possível iniciar a gravação.');
      return;
    }
    recorderRef.current = recorder;
    if (!resume) {
      chunksRef.current = [];
      waveRef.current = [];
      setWaves([]);
      startedAtRef.current = Date.now();
      clearPreview();
      setBlobReady(false);
    }
    discardRef.current = false;

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      recorderRef.current = null;
      const keepForReview = pauseForReviewRef.current;
      if (!keepForReview) {
        stopStream();
        stopSampling();
      }
      const stale = sessionRef.current !== session;
      const discarded = discardRef.current;
      const elapsed = Math.max(0, Date.now() - startedAtRef.current);
      if (stale || discarded) {
        if (!keepForReview) {
          chunksRef.current = [];
          waveRef.current = [];
          setWaves([]);
        }
        return;
      }
      if (elapsed < MIN_DURATION_MS && !keepForReview && !chunksRef.current.length) {
        chunksRef.current = [];
        notify('Segure um pouco mais para gravar um áudio.');
        sessionRef.current += 1;
        dispatch({ type: E.CANCEL });
        return;
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (!blob.size) return;
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setBlobReady(true);
      dispatch({ type: E.SET_DURATION, duration: Math.round(elapsed / 1000) });
      if (autoSendRef.current) {
        autoSendRef.current = false;
        void uploadBlob();
      }
    };

    try {
      recorder.start(250);
    } catch {
      stopStream();
      dispatch({ type: E.RECORD_FAILED, session, error: 'Falha ao iniciar.' });
      notify('Falha ao iniciar a gravação.');
      return;
    }
    dispatch({ type: resume ? E.RESUME : E.RECORD_STARTED, session });
    if (!resume) {
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        dispatch({ type: E.TICK, elapsed: Math.floor(elapsed / 1000) });
        if (elapsed >= MAX_DURATION_MS && recorder.state === 'recording') recorder.stop();
      }, 250);
    }

    if (!analyserRef.current && typeof window !== 'undefined') {
      try {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (AudioCtor) {
          const context = new AudioCtor();
          const source = context.createMediaStreamSource(stream);
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          audioCtxRef.current = context;
          analyserRef.current = analyser;
          const buffer = new Uint8Array(analyser.frequencyBinCount);
          sampleTimerRef.current = setInterval(() => {
            analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i += 1) {
              const value = (buffer[i] - 128) / 128;
              sum += value * value;
            }
            const rms = Math.sqrt(sum / buffer.length);
            const amplitude = Math.max(0.14, Math.min(1, rms * 4.2));
            waveRef.current = [...waveRef.current, amplitude].slice(-96);
            setWaves([...waveRef.current]);
          }, 90);
        }
      } catch { /* ondas decorativas */ }
    }
  }, [clearPreview, notify, stopSampling, stopStream, uploadBlob]);

  const onPointerDown = (event) => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (stateRef.current.status !== S.IDLE && stateRef.current.status !== S.SENT && stateRef.current.status !== S.ERROR) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* ignore */ }
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    hapticRef.current = { cancel: false, lock: false };
    pressedRef.current = true;
    const nextSession = stateRef.current.session + 1;
    sessionRef.current = nextSession;
    stopAllPlayback();
    dispatch({ type: E.PRESS });
    void beginRecording(nextSession);
  };

  const onPointerMove = (event) => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    const status = stateRef.current.status;
    if (status !== S.RECORDING && status !== S.CANCEL_PENDING) return;
    const scale = gestureScale();
    const dx = Math.round((event.clientX - origin.x) / scale);
    const dy = Math.round((event.clientY - origin.y) / scale);
    const cancel = -dx >= CANCEL_THRESHOLD;
    const lock = -dy >= LOCK_THRESHOLD && !cancel;
    if (cancel && !hapticRef.current.cancel) { hapticRef.current.cancel = true; vibrate(18); }
    if (lock && !hapticRef.current.lock) { hapticRef.current.lock = true; vibrate([12, 30, 18]); }
    if (!cancel) hapticRef.current.cancel = false;
    if (!lock) hapticRef.current.lock = false;
    dispatch({ type: E.MOVE, dx, dy });
  };

  const onPointerUp = () => {
    const status = stateRef.current.status;
    dragOriginRef.current = null;
    if (status === S.RECORDING) {
      pressedRef.current = false;
      autoSendRef.current = true;
      dispatch({ type: E.RELEASE });
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    } else if (status === S.CANCEL_PENDING) {
      discard();
    }
    // LOCKED_RECORDING: soltar não encerra.
  };

  const onPointerCancel = () => {
    dragOriginRef.current = null;
    if (stateRef.current.status === S.RECORDING || stateRef.current.status === S.CANCEL_PENDING) discard();
  };

  const stop = () => {
    pressedRef.current = false;
    pauseForReviewRef.current = true;
    dispatch({ type: E.STOP });
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else if (blobRef.current) setBlobReady(true);
  };

  const resume = () => {
    if (stateRef.current.status !== S.PAUSED) return;
    pauseForReviewRef.current = false;
    autoSendRef.current = false;
    clearPreview();
    setBlobReady(false);
    const nextSession = stateRef.current.session + 1;
    sessionRef.current = nextSession;
    void beginRecording(nextSession, true);
  };

  const retry = () => {
    if (stateRef.current.status !== S.ERROR) return;
    if (!blobRef.current) { reRecord(); return; }
    dispatch({ type: E.RETRY });
    void uploadBlob();
  };

  const reRecord = () => {
    resetArtifacts();
    sessionRef.current += 1;
    dispatch({ type: E.RESET });
  };

  const send = () => {
    if (stateRef.current.status !== S.PAUSED && stateRef.current.status !== S.REVIEW) return;
    if (!blobRef.current) return;
    dispatch({ type: E.SEND });
    void uploadBlob();
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      resetArtifacts();
    };
  }, [resetArtifacts]);

  useEffect(() => {
    const onInterrupt = () => {
      const status = stateRef.current.status;
      if (status === S.RECORDING || status === S.CANCEL_PENDING) discard();
      else if (status === S.LOCKED_RECORDING) stop();
    };
    const onPageHide = () => {
      const status = stateRef.current.status;
      if (status === S.RECORDING || status === S.CANCEL_PENDING) discard();
      else if (status === S.LOCKED_RECORDING) stop();
    };
    document.addEventListener('visibilitychange', onInterrupt);
    window.addEventListener('blur', onInterrupt);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onInterrupt);
      window.removeEventListener('blur', onInterrupt);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discard]);

  const status = state.status;
  const held = status === S.RECORDING || status === S.CANCEL_PENDING;
  const locked = status === S.LOCKED_RECORDING;
  const paused = status === S.PAUSED || status === S.REVIEW;
  const uploading = status === S.UPLOADING;
  const errored = status === S.ERROR;
  const active = held || locked || paused || uploading || errored;

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const waveBars = Array.from({ length: WAVE_BARS }, (_, i) => {
    if (waves.length) return waves[Math.floor((i / WAVE_BARS) * waves.length)] || 0.16;
    return 0.18 + ((i * 7) % 5) * 0.07;
  });

  const wavesNode = (
    <span className="vr-waves" aria-hidden="true">
      {waveBars.map((bar, i) => (
        <i key={i} style={{ height: `${Math.round(bar * 100)}%` }} />
      ))}
    </span>
  );

  return (
    <div className={`voice-recorder${active ? ' active' : ''}${compact ? ' compact' : ''} ${className}`.trim()}>
      {!active ? (
        <button
          type="button"
          className={`icon-btn mic-btn${disabled ? ' disabled' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={() => { if (stateRef.current.status === S.RECORDING) onPointerUp(); }}
          onContextMenu={(event) => event.preventDefault()}
          aria-label={label}
          title={label}
          disabled={disabled}
        >
          <Icon name="mic" />
        </button>
      ) : null}

      {held ? (
        <>
          <button
            type="button"
            className={`vr-trash${state.cancelProgress > 0.65 ? ' hot' : ''}`}
            onClick={discard}
            aria-label="Cancelar gravação"
            title="Arraste para a lixeira para apagar"
          >
            <Icon name="trash" />
          </button>
          <span className={`vr-lock-hint${state.lockProgress > 0.4 ? ' near' : ''}`} aria-hidden="true">
            <Icon name="lock" />
            <span>↑ para pausar</span>
          </span>
          <span className="vr-center">
            <span className="vr-rec-dot" />
            <b>{formatAudioTime(state.elapsed)}</b>
            {wavesNode}
            <small>{state.cancelProgress > 0.65 ? 'Solte na lixeira para apagar' : 'Solte para enviar · ← apagar · ↑ pausar'}</small>
          </span>
          <button
            type="button"
            className={`vr-mic-active${state.cancelProgress > 0.65 ? ' cancel' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            aria-label="Gravando — solte para enviar"
          >
            <Icon name="mic" />
          </button>
        </>
      ) : null}

      {locked ? (
        <>
          <span className="vr-lock" title="Gravação bloqueada"><Icon name="lock" /></span>
          <span className="vr-center">
            <span className="vr-rec-dot" />
            <b>{formatAudioTime(state.elapsed)}</b>
            {wavesNode}
            <small>Toque em Pausar para ouvir, apagar ou continuar</small>
          </span>
          <button type="button" className="vr-stop" onClick={stop} aria-label="Pausar gravação" title="Pausar e ouvir">
            <Icon name="stop" />
          </button>
          <button type="button" className="vr-trash" onClick={discard} aria-label="Excluir gravação" title="Excluir">
            <Icon name="trash" />
          </button>
        </>
      ) : null}

      {paused && blobReady && previewUrl ? (
        <>
          <AudioPlayer
            src={previewUrl}
            duration={state.duration}
            waves={waveRef.current}
            className="vr-preview-player"
          />
          <button type="button" className="vr-trash" onClick={discard} aria-label="Apagar áudio" title="Apagar">
            <Icon name="trash" />
          </button>
          <button type="button" className="vr-resume" onClick={resume} aria-label="Continuar gravação" title="Continuar gravação">
            <Icon name="mic" />
          </button>
          <button type="button" className="vr-send" onClick={send} aria-label="Enviar áudio" title="Enviar">
            <Icon name="send" />
          </button>
        </>
      ) : null}

      {paused && !blobReady ? <span className="vr-center muted sm">Processando áudio…</span> : null}
      {uploading ? <span className="vr-center"><span className="vr-spinner" /> Enviando áudio…</span> : null}
      {errored ? (
        <>
          <span className="vr-center muted sm">{state.error || 'Falha na gravação.'}</span>
          <button type="button" className="vr-resume" onClick={retry} aria-label="Tentar novamente" title="Tentar novamente">
            <Icon name="send" />
          </button>
          <button type="button" className="vr-trash" onClick={reRecord} aria-label="Cancelar">
            <Icon name="x" />
          </button>
        </>
      ) : null}
    </div>
  );
}
