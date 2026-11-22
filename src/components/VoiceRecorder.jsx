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
const gestureScale = () => (typeof window !== 'undefined' && window.innerWidth < 600 ? 0.85 : 1);
const buzz = (pattern) => {
  try { navigator.vibrate?.(pattern); } catch { /* sem vibração */ }
};

/**
 * Gravador profissional com gestos (padrão WhatsApp):
 * segure para gravar · ← apagar · ↑ cadeado · soltar continua · pausa nativa
 * · prévia para ouvir/apagar/continuar/enviar.
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
  const reviewFlagRef = useRef(false);
  const buzzRef = useRef({ cancel: false, lock: false });
  const urlRef = useRef('');
  const blobRef = useRef(null);
  const mountedRef = useRef(true);
  const actionRef = useRef({});

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
    reviewFlagRef.current = false;
    buzzRef.current = { cancel: false, lock: false };
  }, [clearPreview, stopSamplers, stopStream]);

  const buildPreview = useCallback(() => {
    const blob = new Blob(chunksRef.current, {
      type: recorderRef.current?.mimeType || 'audio/webm',
    });
    if (!blob.size) return false;
    blobRef.current = blob;
    const url = URL.createObjectURL(blob);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    setPreviewUrl(url);
    setBlobReady(true);
    dispatch({ type: E.SET_DURATION, duration: Math.round(elapsedRef.current / 1000) });
    return true;
  }, []);

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

  // Uma única fonte de verdade para o fim da gravação.
  const handleStop = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    stopStream();
    stopSamplers();
    const stale = !recorder || sessionRef.current !== recorder.__session;
    const discarded = discardRef.current;
    if (stale || discarded) {
      resetAll();
      return;
    }
    if (elapsedRef.current < MIN_DURATION_MS) {
      notify('Segure um pouco mais para gravar um áudio.');
      sessionRef.current += 1;
      dispatch({ type: E.CANCEL });
      return;
    }
    if (!buildPreview()) return;
    if (autoSendRef.current) {
      autoSendRef.current = false;
      void sendNow();
    } else if (reviewFlagRef.current) {
      reviewFlagRef.current = false;
      dispatch({ type: E.STOP });
    }
  }, [buildPreview, notify, resetAll, sendNow, stopSamplers, stopStream]);
  actionRef.current.handleStop = handleStop;

  const attachAnalyser = useCallback((stream) => {
    if (analyserRef.current || typeof window === 'undefined') return;
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
  }, []);

  const start = useCallback(async (session, resume = false) => {
    let recorder = recorderRef.current;

    // Retomada nativa: mantém o mesmo MediaRecorder e o mesmo blob.
    if (resume && recorder?.state === 'paused') {
      recorder.resume();
      startedRef.current = Date.now() - elapsedRef.current;
      dispatch({ type: E.RESUME, session });
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
    recorder.onstop = () => actionRef.current.handleStop();
    recorder.onerror = () => {
      notify('Ocorreu um erro na gravação.');
      cancel();
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
      const rec = recorderRef.current;
      if (rec?.state !== 'recording') return;
      const elapsed = Date.now() - startedRef.current;
      elapsedRef.current = elapsed;
      dispatch({ type: E.TICK, elapsed: Math.floor(elapsed / 1000) });
      if (elapsed >= MAX_DURATION_MS) stop(false);
    }, 200);

    attachAnalyser(stream);
  }, [attachAnalyser, clearPreview, notify, stopStream]);

  const stop = useCallback((forReview) => {
    if (forReview) reviewFlagRef.current = true;
    else autoSendRef.current = true;
    pressedRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
      recorder.stop();
    }
  }, []);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.pause();
      dispatch({ type: E.PAUSE });
      buzz(12);
    }
  }, []);

  const cancel = useCallback(() => {
    discardRef.current = true;
    pressedRef.current = false;
    autoSendRef.current = false;
    reviewFlagRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
      recorder.onstop = () => { recorderRef.current = null; resetAll(); };
      recorder.stop();
    } else {
      resetAll();
    }
    sessionRef.current += 1;
    dispatch({ type: E.CANCEL });
    buzz(20);
  }, [resetAll]);
  actionRef.current.cancel = cancel;

  const finishFromReview = useCallback(() => {
    // A gravação já foi finalizada; o blob está pronto na prévia.
    dispatch({ type: E.STOP });
  }, []);

  const resume = useCallback(() => {
    if (stateRef.current.status !== S.PAUSED) return;
    const recorder = recorderRef.current;
    if (recorder?.state === 'paused') {
      clearPreview();
      setBlobReady(false);
      recorder.resume();
      startedRef.current = Date.now() - elapsedRef.current;
      dispatch({ type: E.RESUME });
      return;
    }
    // Fallback: recria o gravador se o navegador não manteve o paused.
    clearPreview();
    setBlobReady(false);
    const session = stateRef.current.session + 1;
    sessionRef.current = session;
    void start(session, true);
  }, [clearPreview, start]);

  const reRecord = useCallback(() => {
    resetAll();
    sessionRef.current += 1;
    dispatch({ type: E.RESET });
  }, [resetAll]);

  const retry = useCallback(() => {
    if (stateRef.current.status !== S.ERROR) return;
    if (!blobRef.current) { reRecord(); return; }
    dispatch({ type: E.RETRY });
    void sendNow();
  }, [reRecord, sendNow]);

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
    const s = gestureScale();
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
      stop(false);
    } else if (status === S.CANCEL_PENDING) {
      cancel();
    }
    // LOCKED_RECORDING: soltar não encerra.
  };

  const done = () => {
    // Da prévia: volta a gravar (continuar) ou finaliza ( STOP ).
    finishFromReview();
  };

  // Interrupções preservam o áudio já capturado.
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
    onActiveChange?.(false);
    const recorder = recorderRef.current;
    if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
      recorder.onstop = () => { recorderRef.current = null; };
      recorder.stop();
    }
    resetAll();
  }, [onActiveChange, resetAll]);

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
          aria-label={held
            ? 'Gravando: solte para enviar, arraste à esquerda para apagar ou para cima para bloquear'
            : label}
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
          <span className="vr-lock" title={paused ? 'Pausada' : 'Bloqueada'}>
            <Icon name={paused ? 'pause' : 'lock'} />
          </span>
          <span className="vr-center">
            <span className={`vr-rec-dot${paused ? ' paused' : ''}`} />
            <b>{formatAudioTime(state.elapsed)}</b>
            {waveNode}
            <small>{paused ? 'Pausada — ouça, apague ou continue' : 'Gravando — mãos livres'}</small>
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
          <button
            type="button"
            className="vr-send"
            onClick={() => { dispatch({ type: E.SEND }); void sendNow(); }}
            aria-label="Enviar áudio"
            title="Enviar"
          >
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
