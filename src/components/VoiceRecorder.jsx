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

const WAVE_BARS = 30;
const scale = () => (typeof window !== 'undefined' && window.innerWidth < 600 ? 0.85 : 1);
const buzz = (pattern) => {
  try { navigator.vibrate?.(pattern); } catch { /* sem vibração */ }
};

/**
 * Gravador profissional com gestos (padrão WhatsApp):
 * - Pressionar e soltar → envio imediato.
 * - Arrastar à esquerda → lixeira, soltar cancela e apaga.
 * - Arrastar para cima → cadeado, soltar mantém a gravação.
 * - Pausar/retomar usa MediaRecorder.pause()/resume() nativo, sem perder o áudio.
 * - Cancelar disponível a qualquer momento (gesto, lixeira ou interrupção).
 */
export default function VoiceRecorder({
  onSend,
  disabled = false,
  compact = false,
  onError,
  onActiveChange,
  label = 'Segure para gravar',
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
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const sampleRef = useRef(null);
  const clockRef = useRef(null);
  const waveRef = useRef([]);
  const elapsedRef = useRef(0);
  const startedRef = useRef(0);
  const sessionRef = useRef(0);
  const originRef = useRef(null);
  const discardRef = useRef(false);
  const pressedRef = useRef(false);
  const sendLockRef = useRef(false);
  const autoSendRef = useRef(false);
  const finishForReviewRef = useRef(false);
  const buzzRef = useRef({ cancel: false, lock: false });
  const urlRef = useRef('');
  const blobRef = useRef(null);
  const mountedRef = useRef(true);

  const notify = useCallback((message) => onError?.(message), [onError]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopSamplers = useCallback(() => {
    if (sampleRef.current) clearInterval(sampleRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
    sampleRef.current = null;
    clockRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    analyserRef.current = null;
  }, []);

  const clearPreview = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = '';
    setPreviewUrl('');
  }, []);

  const resetAll = useCallback(() => {
    stopSamplers();
    stopStream();
    clearPreview();
    chunksRef.current = [];
    waveRef.current = [];
    setWaves([]);
    blobRef.current = null;
    setBlobReady(false);
    elapsedRef.current = 0;
    startedRef.current = 0;
    autoSendRef.current = false;
    finishForReviewRef.current = false;
    buzzRef.current = { cancel: false, lock: false };
  }, [clearPreview, stopSamplers, stopStream]);

  const finishBlob = useCallback((keepForReview) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = () => {
      recorderRef.current = null;
      if (!keepForReview) {
        stopStream();
        stopSamplers();
      }
      const stale = sessionRef.current !== recorder.__session;
      const discarded = discardRef.current;
      const duration = Math.round(elapsedRef.current / 1000);
      if (stale || discarded) {
        if (!keepForReview) resetAll();
        return;
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (!blob.size) {
        notify('Não foi possível capturar o áudio. Tente novamente.');
        sessionRef.current += 1;
        dispatch({ type: E.CANCEL });
        return;
      }
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPreviewUrl(url);
      setBlobReady(true);
      dispatch({ type: E.SET_DURATION, duration });
      if (autoSendRef.current) {
        autoSendRef.current = false;
        void sendNow();
      }
    };
    if (recorder.state === 'recording') recorder.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, resetAll, stopSamplers, stopStream]);

  const sendNow = useCallback(async () => {
    if (sendLockRef.current || !blobRef.current || typeof onSend !== 'function') return;
    sendLockRef.current = true;
    const blob = blobRef.current;
    const meta = {
      duration: Math.max(1, Math.round(stateRef.current.duration || elapsedRef.current / 1000 || 0)),
      waves: [...waveRef.current],
      mime: blob.type || 'audio/webm',
    };
    try {
      await onSend(blob, meta);
      if (!mountedRef.current) return;
      dispatch({ type: E.UPLOAD_OK });
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        resetAll();
        sessionRef.current += 1;
        dispatch({ type: E.RESET });
      }, 250);
    } catch (error) {
      if (!mountedRef.current) return;
      const message = friendlyError(error, 'Falha no envio do áudio.');
      dispatch({ type: E.UPLOAD_FAIL, error: message });
      notify(message);
    } finally {
      sendLockRef.current = false;
    }
  }, [notify, onSend, resetAll]);

  const start = useCallback(async (session, resume = false) => {
    let recorder = recorderRef.current;
    if (resume && recorder?.state === 'paused') {
      recorder.resume();
      dispatch({ type: E.RESUME, session });
      startedRef.current = Date.now() - elapsedRef.current * 1000;
      return;
    }
    let stream = streamRef.current;
    if (!resume) {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        dispatch({ type: E.RECORD_FAILED, session, error: 'Gravação não suportada.' });
        notify('Gravação de áudio não é suportada neste navegador.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stopStream();
      dispatch({ type: E.RECORD_FAILED, session, error: 'Falha ao iniciar.' });
      notify('Não foi possível iniciar a gravação.');
      return;
    }
    recorder.__session = session;
    recorderRef.current = recorder;
    chunksRef.current = [];
    waveRef.current = [];
    setWaves([]);
    elapsedRef.current = 0;
    startedRef.current = Date.now();
    discardRef.current = false;
    clearPreview();
    setBlobReady(false);

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      recorderRef.current = null;
      stopStream();
      stopSamplers();
      const stale = sessionRef.current !== recorder.__session;
      const discarded = discardRef.current;
      if (stale || discarded) {
        resetAll();
        return;
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (!blob.size || elapsedRef.current < MIN_DURATION_MS) {
        notify('Segure um pouco mais para gravar um áudio.');
        sessionRef.current += 1;
        dispatch({ type: E.CANCEL });
        return;
      }
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPreviewUrl(url);
      setBlobReady(true);
      dispatch({ type: E.SET_DURATION, duration: Math.round(elapsedRef.current / 1000) });
      if (finishForReviewRef.current) {
        finishForReviewRef.current = false;
        dispatch({ type: E.STOP });
      } else if (autoSendRef.current) {
        autoSendRef.current = false;
        void sendNow();
      }
    };

    try {
      recorder.start(200);
    } catch {
      stopStream();
      dispatch({ type: E.RECORD_FAILED, session, error: 'Falha ao iniciar.' });
      notify('Falha ao iniciar a gravação.');
      return;
    }
    dispatch({ type: E.RECORD_STARTED, session });
    clockRef.current = setInterval(() => {
      if (recorderRef.current?.state !== 'recording') return;
      const elapsed = Date.now() - startedRef.current;
      elapsedRef.current = elapsed;
      dispatch({ type: E.TICK, elapsed: Math.floor(elapsed / 1000) });
      if (elapsed >= MAX_DURATION_MS) finish(false);
    }, 200);

    if (!analyserRef.current && typeof window !== 'undefined') {
      try {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return;
        const context = new AudioCtor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        ctxRef.current = context;
        analyserRef.current = analyser;
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        sampleRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) {
            const value = (buffer[i] - 128) / 128;
            sum += value * value;
          }
          const rms = Math.sqrt(sum / buffer.length);
          const amplitude = Math.max(0.14, Math.min(1, rms * 4.5));
          waveRef.current = [...waveRef.current, amplitude].slice(-120);
          setWaves([...waveRef.current]);
        }, 80);
      } catch { /* ondas decorativas */ }
    }
  }, [clearPreview, finish, notify, resetAll, sendNow, stopSamplers, stopStream]);

  const finish = useCallback((forReview) => {
    if (forReview) finishForReviewRef.current = true;
    else autoSendRef.current = true;
    pressedRef.current = false;
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording' || recorder?.state === 'paused') {
      finishBlob(forReview);
    }
  }, [finishBlob]);

  const cancel = useCallback(() => {
    discardRef.current = true;
    pressedRef.current = false;
    autoSendRef.current = false;
    finishForReviewRef.current = false;
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording' || recorder?.state === 'paused') {
      recorder.onstop = () => { recorderRef.current = null; resetAll(); };
      recorder.stop();
    } else {
      resetAll();
    }
    sessionRef.current += 1;
    dispatch({ type: E.CANCEL });
    buzz(20);
  }, [resetAll]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      dispatch({ type: E.PAUSE });
      buzz(12);
    }
  }, []);

  const onPointerDown = (event) => {
    event.stopPropagation();
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (![S.IDLE, S.SENT, S.ERROR].includes(stateRef.current.status)) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* ignore */ }
    originRef.current = { x: event.clientX, y: event.clientY };
    buzzRef.current = { cancel: false, lock: false };
    pressedRef.current = true;
    const session = stateRef.current.session + 1;
    sessionRef.current = session;
    stopAllPlayback();
    dispatch({ type: E.PRESS });
    void start(session);
  };

  const onPointerMove = (event) => {
    event.stopPropagation();
    const origin = originRef.current;
    if (!origin) return;
    const status = stateRef.current.status;
    if (![S.RECORDING, S.CANCEL_PENDING].includes(status)) return;
    const s = scale();
    const dx = Math.round((event.clientX - origin.x) / s);
    const dy = Math.round((event.clientY - origin.y) / s);
    const cancelGesture = -dx >= CANCEL_THRESHOLD;
    const lockGesture = -dy >= LOCK_THRESHOLD && !cancelGesture;
    if (cancelGesture && !buzzRef.current.cancel) { buzzRef.current.cancel = true; buzz(18); }
    if (lockGesture && !buzzRef.current.lock) { buzzRef.current.lock = true; buzz([12, 30, 18]); }
    if (!cancelGesture) buzzRef.current.cancel = false;
    if (!lockGesture) buzzRef.current.lock = false;
    dispatch({ type: E.MOVE, dx, dy });
  };

  const onPointerUp = (event) => {
    event?.stopPropagation();
    const status = stateRef.current.status;
    originRef.current = null;
    if (status === S.RECORDING) {
      dispatch({ type: E.RELEASE });
      finish(false);
    } else if (status === S.CANCEL_PENDING) {
      cancel();
    }
  };

  const done = () => {
    dispatch({ type: E.STOP });
    finish(true);
  };

  const resume = () => {
    if (stateRef.current.status !== S.PAUSED) return;
    finishForReviewRef.current = false;
    void start(stateRef.current.session, true);
  };

  const retry = () => {
    if (stateRef.current.status !== S.ERROR) return;
    if (!blobRef.current) { reRecord(); return; }
    dispatch({ type: E.RETRY });
    void sendNow();
  };

  const reRecord = () => {
    resetAll();
    sessionRef.current += 1;
    dispatch({ type: E.RESET });
  };

  // Interrupções: só cancela gravação presa; PAUSADO/REVIEW preservam o áudio.
  useEffect(() => {
    const onInterrupt = () => {
      const status = stateRef.current.status;
      if ([S.RECORDING, S.CANCEL_PENDING].includes(status)) cancel();
      else if (status === S.LOCKED_RECORDING) pause();
    };
    window.addEventListener('pagehide', onInterrupt);
    return () => window.removeEventListener('pagehide', onInterrupt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel, pause]);

  useEffect(() => () => {
    mountedRef.current = false;
    discardRef.current = true;
    onActiveChange?.(false);
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording' || recorder?.state === 'paused') {
      recorder.onstop = () => { recorderRef.current = null; };
      recorder.stop();
    }
    resetAll();
  }, [resetAll]);

  const status = state.status;
  const held = status === S.RECORDING || status === S.CANCEL_PENDING;
  const locked = status === S.LOCKED_RECORDING;
  const paused = status === S.PAUSED;
  const reviewing = status === S.REVIEW;
  const uploading = status === S.UPLOADING;
  const errored = status === S.ERROR;
  const active = held || locked || paused || reviewing || uploading || errored;

  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);

  const bars = Array.from({ length: WAVE_BARS }, (_, i) => {
    if (waves.length) return waves[Math.floor((i / WAVE_BARS) * waves.length)] || 0.16;
    return 0.2 + ((i * 5) % 4) * 0.1;
  });
  const waveNode = (
    <span className="vr-waves" aria-hidden="true">
      {bars.map((bar, i) => <i key={i} style={{ height: `${Math.round(bar * 100)}%` }} />)}
    </span>
  );

  return (
    <div className={`voice-recorder${active ? ' active' : ''}${compact ? ' compact' : ''} ${className}`.trim()}>
      {!locked && !paused && !reviewing && !uploading && !errored ? (
        <button
          type="button"
          className={`icon-btn mic-btn${disabled ? ' disabled' : ''}${held ? ' held' : ''}${
            state.cancelProgress > 0.65 ? ' cancel' : ''
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(event) => { event.stopPropagation(); cancel(); }}
          onLostPointerCapture={() => { if (stateRef.current.status === S.RECORDING) onPointerUp(); }}
          onContextMenu={(event) => event.preventDefault()}
          aria-label={
            held
              ? 'Gravando: solte para enviar, arraste à esquerda para apagar ou para cima para bloquear'
              : label
          }
          title={held ? 'Solte para enviar · ← apagar · ↑ bloquear' : label}
          disabled={disabled}
        >
          <Icon name={held ? 'radio' : 'mic'} />
        </button>
      ) : null}

      {held ? (
        <>
          <button
            type="button"
            className={`vr-trash${state.cancelProgress > 0.65 ? ' hot' : ''}`}
            onClick={cancel}
            aria-label="Cancelar e apagar gravação"
            title="Arraste para a lixeira para apagar"
          >
            <Icon name="trash" />
          </button>
          <span className={`vr-lock-hint${state.lockProgress > 0.4 ? ' near' : ''}`} aria-hidden="true">
            <Icon name="lock" />
            <span>↑ para bloquear</span>
          </span>
          <span className="vr-center">
            <span className="vr-rec-dot" />
            <b>{formatAudioTime(state.elapsed)}</b>
            {waveNode}
            <small>
              {state.cancelProgress > 0.65
                ? 'Solte na lixeira para apagar'
                : 'Solte para enviar · ← apagar · ↑ bloquear'}
            </small>
          </span>
        </>
      ) : null}

      {locked || paused ? (
        <>
          <span className="vr-lock" title={paused ? 'Gravação pausada' : 'Gravação bloqueada'}>
            <Icon name={paused ? 'pause' : 'lock'} />
          </span>
          <span className="vr-center">
            <span className={`vr-rec-dot${paused ? ' paused' : ''}`} />
            <b>{formatAudioTime(state.elapsed)}</b>
            {waveNode}
            <small>{paused ? 'Pausada — tome a decisão abaixo' : 'Gravando — mãos livres'}</small>
          </span>
          <button
            type="button"
            className="vr-stop"
            onClick={paused ? done : pause}
            aria-label={paused ? 'Finalizar e ouvir' : 'Pausar gravação'}
            title={paused ? 'Finalizar e ouvir' : 'Pausar gravação'}
          >
            <Icon name={paused ? 'check' : 'pause'} />
          </button>
          <button type="button" className="vr-trash" onClick={cancel} aria-label="Excluir gravação" title="Excluir">
            <Icon name="trash" />
          </button>
        </>
      ) : null}

      {reviewing && blobReady && previewUrl ? (
        <>
          <AudioPlayer
            src={previewUrl}
            duration={state.duration}
            waves={waveRef.current}
            className="vr-preview-player"
          />
          <button type="button" className="vr-trash" onClick={cancel} aria-label="Apagar áudio" title="Apagar">
            <Icon name="trash" />
          </button>
          <button type="button" className="vr-resume" onClick={resume} aria-label="Continuar gravação" title="Continuar gravação">
            <Icon name="mic" />
          </button>
          <button type="button" className="vr-send" onClick={() => { dispatch({ type: E.SEND }); void sendNow(); }} aria-label="Enviar áudio" title="Enviar">
            <Icon name="send" />
          </button>
        </>
      ) : null}

      {reviewing && !blobReady ? <span className="vr-center muted sm">Processando áudio…</span> : null}
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
