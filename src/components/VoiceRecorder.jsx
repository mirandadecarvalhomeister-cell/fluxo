import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Icon } from './Icon';
import AudioPlayer, { formatAudioTime } from './AudioPlayer';
import { stopAllPlayback } from '../lib/audioPlayback';
import { friendlyError } from '../lib/errors';
import {
  voiceReducer,
  initialVoiceState,
  voiceSelectors,
  VOICE_STATE as S,
  VOICE_EVENT as E,
  CANCEL_THRESHOLD,
  LOCK_THRESHOLD,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
} from '../lib/voiceRecording';

const WAVE_BARS = 36;

const gestureScale = () => (typeof window !== 'undefined' && window.innerWidth < 600 ? 0.8 : 1);

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* vibração não suportada */
  }
}

/**
 * Gravador de voz com gestos (WhatsApp-style), máquina de estados explícita e
 * prévia obrigatória antes do envio.
 *
 * Props:
 *   onSend(blob, meta)  -> Promise | void. Chamado somente após confirmação.
 *   disabled            -> desabilita o microfone
 *   compact             -> variante para o composer da comunidade
 *   onError(message)    -> aviso amigável (opcional)
 */
export default function VoiceRecorder({
  onSend,
  disabled = false,
  compact = false,
  onError,
  label = 'Segure para gravar áudio',
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
  const hapticRef = useRef({ cancel: false, lock: false });
  const previewUrlRef = useRef('');
  const blobRef = useRef(null);
  const mountedRef = useRef(true);

  const notify = useCallback(
    (message) => {
      if (typeof onError === 'function') onError(message);
    },
    [onError]
  );

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopSampling = useCallback(() => {
    if (sampleTimerRef.current) {
      clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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
    hapticRef.current = { cancel: false, lock: false };
  }, [clearPreview, stopSampling, stopStream]);

  const discard = useCallback(() => {
    discardRef.current = true;
    pressedRef.current = false;
    sendLockRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else resetArtifacts();
    sessionRef.current += 1;
    dispatch({ type: E.CANCEL });
    vibrate(20);
  }, [resetArtifacts]);

  // Liberação garantida do microfone em qualquer desmontagem.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      resetArtifacts();
    };
  }, [resetArtifacts]);

  const beginRecording = useCallback(
    async (session) => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        dispatch({ type: E.RECORD_FAILED, session, error: 'Gravação não suportada neste navegador.' });
        notify('Gravação de áudio não é suportada neste navegador.');
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        dispatch({ type: E.RECORD_FAILED, session, error: 'Permissão de microfone negada.' });
        notify('Permissão de microfone negada. Libere o acesso para gravar áudio.');
        return;
      }

      // A gravação pode ter sido cancelada enquanto o navegador pedia permissão.
      if (
        sessionRef.current !== session ||
        !pressedRef.current ||
        discardRef.current
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(
        (type) => MediaRecorder.isTypeSupported?.(type)
      );
      let recorder;
      try {
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch {
        stopStream();
        dispatch({ type: E.RECORD_FAILED, session, error: 'Não foi possível iniciar a gravação.' });
        notify('Não foi possível iniciar a gravação.');
        return;
      }
      recorderRef.current = recorder;
      chunksRef.current = [];
      waveRef.current = [];
      setWaves([]);
      startedAtRef.current = Date.now();
      discardRef.current = false;
      setBlobReady(false);
      clearPreview();

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopStream();
        stopSampling();
        const stale = sessionRef.current !== session;
        const discarded = discardRef.current;
        const duration = Math.max(0, Date.now() - startedAtRef.current);
        if (stale || discarded) {
          chunksRef.current = [];
          waveRef.current = [];
          setWaves([]);
          return;
        }
        if (duration < MIN_DURATION_MS || !chunksRef.current.length) {
          chunksRef.current = [];
          notify('Segure um pouco mais para gravar um áudio.');
          sessionRef.current += 1;
          dispatch({ type: E.CANCEL });
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) {
          sessionRef.current += 1;
          dispatch({ type: E.CANCEL });
          return;
        }
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setBlobReady(true);
        dispatch({ type: E.SET_DURATION, duration: Math.round(duration / 1000) });
      };

      // Analisador para ondas reais enquanto grava.
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
            for (let index = 0; index < buffer.length; index += 1) {
              const value = (buffer[index] - 128) / 128;
              sum += value * value;
            }
            const rms = Math.sqrt(sum / buffer.length);
            const amplitude = Math.max(0.12, Math.min(1, rms * 4.2));
            waveRef.current = [...waveRef.current, amplitude].slice(-96);
            setWaves([...waveRef.current]);
          }, 80);
        }
      } catch {
        /* ondas são decorativas se o analisador falhar */
      }

      try {
        recorder.start(250);
      } catch {
        stopStream();
        stopSampling();
        dispatch({ type: E.RECORD_FAILED, session, error: 'Falha ao iniciar a gravação.' });
        notify('Falha ao iniciar a gravação.');
        return;
      }
      dispatch({ type: E.RECORD_STARTED, session });
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        dispatch({ type: E.TICK, elapsed: Math.floor(elapsed / 1000) });
        if (elapsed >= MAX_DURATION_MS && recorder.state === 'recording') recorder.stop();
      }, 250);
    },
    [clearPreview, notify, stopSampling, stopStream]
  );

  const onPointerDown = (event) => {
    if (disabled || event.pointerType === 'mouse' && event.button !== 0) return;
    if (stateRef.current.status !== S.IDLE && stateRef.current.status !== S.SENT && stateRef.current.status !== S.ERROR) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* captura indisponível */
    }
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    hapticRef.current = { cancel: false, lock: false };
    pressedRef.current = true;
    const nextSession = stateRef.current.session + 1;
    sessionRef.current = nextSession;
    stopAllPlayback();
    dispatch({ type: E.PRESS });
    beginRecording(nextSession);
  };

  const onPointerMove = (event) => {
    const origin = dragOriginRef.current;
    const status = stateRef.current.status;
    if (!origin) return;
    if (status !== S.RECORDING && status !== S.CANCEL_PENDING) return;
    const scale = gestureScale();
    const dx = Math.round((event.clientX - origin.x) / scale);
    const dy = Math.round((event.clientY - origin.y) / scale);
    const cancel = -dx >= CANCEL_THRESHOLD;
    const lock = -dy >= LOCK_THRESHOLD && !cancel;
    if (cancel && !hapticRef.current.cancel) {
      hapticRef.current.cancel = true;
      vibrate(18);
    }
    if (lock && !hapticRef.current.lock) {
      hapticRef.current.lock = true;
      vibrate([12, 30, 18]);
    }
    if (!cancel) hapticRef.current.cancel = false;
    if (!lock) hapticRef.current.lock = false;
    dispatch({ type: E.MOVE, dx, dy });
  };

  const finish = useCallback(() => {
    pressedRef.current = false;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    else if (sessionRef.current && !blobRef.current && !discardRef.current) {
      // Gravação já encerrada pelo limite de duração.
      stopStream();
      stopSampling();
    }
  }, [stopSampling, stopStream]);

  const onPointerUp = () => {
    const status = stateRef.current.status;
    dragOriginRef.current = null;
    if (status === S.RECORDING) {
      dispatch({ type: E.RELEASE });
      finish();
    } else if (status === S.CANCEL_PENDING) {
      discard();
    }
    // LOCKED_RECORDING: soltar o dedo não interrompe nada.
  };

  const onPointerCancel = () => {
    dragOriginRef.current = null;
    if (voiceSelectors.isRecording(stateRef.current) && !voiceSelectors.isLocked(stateRef.current)) {
      discard();
    }
  };

  const onLostCapture = () => {
    if (stateRef.current.status === S.RECORDING) onPointerUp();
  };

  const stop = () => {
    dispatch({ type: E.STOP });
    finish();
  };

  const reRecord = () => {
    resetArtifacts();
    sessionRef.current += 1;
    dispatch({ type: E.RESET });
  };

  const send = async () => {
    if (sendLockRef.current) return;
    if (stateRef.current.status !== S.REVIEW || !blobRef.current || typeof onSend !== 'function') return;
    sendLockRef.current = true;
    const blob = blobRef.current;
    const meta = {
      duration: Math.max(1, Math.round(stateRef.current.duration || 0)),
      waves: [...waveRef.current],
      mime: blob.type || 'audio/webm',
    };
    dispatch({ type: E.SEND });
    try {
      await onSend(blob, meta);
      if (!mountedRef.current) return;
      dispatch({ type: E.UPLOAD_OK });
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        resetArtifacts();
        sessionRef.current += 1;
        dispatch({ type: E.RESET });
      }, 420);
    } catch (error) {
      if (!mountedRef.current) return;
      dispatch({
        type: E.UPLOAD_FAIL,
        error: friendlyError(error, 'Falha no envio. Tente novamente.'),
      });
      notify('Falha no envio do áudio. Tente novamente.');
    } finally {
      sendLockRef.current = false;
    }
  };

  const retry = () => {
    if (stateRef.current.status !== S.ERROR) return;
    dispatch({ type: E.RETRY });
  };

  // Interrupções do sistema: nunca deixar o microfone ligado sem controle.
  useEffect(() => {
    const onInterrupt = () => {
      const status = stateRef.current.status;
      if (status === S.RECORDING || status === S.CANCEL_PENDING) {
        discard();
      } else if (status === S.LOCKED_RECORDING) {
        stop();
      }
    };
    const onPageHide = () => {
      if (voiceSelectors.isRecording(stateRef.current)) discard();
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
  const reviewing = status === S.REVIEW;
  const uploading = status === S.UPLOADING;
  const errored = status === S.ERROR;
  const scale = gestureScale();
  const offsetX = held ? Math.min(0, state.dragX) * scale : 0;
  const offsetY = held ? Math.min(0, state.dragY) * 0.45 * scale : 0;
  const waveBars = Array.from({ length: WAVE_BARS }, (_, index) => {
    if (waves.length) {
      return waves[Math.min(waves.length - 1, Math.floor((index / WAVE_BARS) * waves.length))] || 0.14;
    }
    return 0.16 + ((index * 7) % 5) * 0.06;
  });

  return (
    <div className={`voice-recorder ${compact ? 'compact' : ''} ${className}`.trim()}>
      {held ? (
        <>
          <div
            className={`vr-cancel-target${state.cancelProgress > 0.65 ? ' hot' : ''}`}
            style={{ opacity: Math.min(1, 0.35 + state.cancelProgress) }}
            aria-hidden="true"
          >
            <Icon name="trash" />
          </div>
          <div
            className={`vr-lock-target${state.lockProgress > 0.65 ? ' hot' : ''}`}
            style={{ opacity: Math.min(1, 0.35 + state.lockProgress) }}
            aria-hidden="true"
          >
            <Icon name="lock" />
            <span>Deslize para cima para bloquear</span>
          </div>
        </>
      ) : null}

      {!reviewing && !uploading && !errored ? (
        <div
          className={`vr-mic-wrap${held ? ' held' : ''}${locked ? ' locked' : ''}`}
          style={held ? { transform: `translate(${offsetX}px, ${offsetY}px)` } : undefined}
        >
          {locked ? (
            <div className="vr-locked" role="status" aria-live="polite">
              <span className="vr-lock-badge"><Icon name="lock" /></span>
              <span className="vr-rec-dot" />
              <b>{formatAudioTime(state.elapsed)}</b>
              <span className="vr-locked-wave" aria-hidden="true">
                {waveBars.map((bar, index) => (
                  <i key={index} style={{ height: `${Math.round(bar * 100)}%` }} />
                ))}
              </span>
              <button type="button" className="vr-stop" onClick={stop} aria-label="Parar gravação" title="Parar">
                <Icon name="stop" />
              </button>
              <button type="button" className="vr-delete" onClick={discard} aria-label="Excluir gravação" title="Excluir">
                <Icon name="trash" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`icon-btn mic-btn${held ? ' on' : ''}${state.cancelProgress > 0.65 ? ' cancel' : ''}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onLostPointerCapture={onLostCapture}
              onContextMenu={(event) => event.preventDefault()}
              aria-label={label}
              title={label}
              disabled={disabled}
            >
              <Icon name="mic" />
            </button>
          )}
        </div>
      ) : null}

      {held ? (
        <div className={`vr-floating${state.cancelProgress > 0.65 ? ' cancel' : ''}`} aria-hidden="true">
          <span className="vr-rec-dot" />
          <b>{formatAudioTime(state.elapsed)}</b>
          <span className="vr-floating-wave">
            {waveBars.map((bar, index) => (
              <i key={index} style={{ height: `${Math.round(bar * 100)}%` }} />
            ))}
          </span>
          <small>{state.cancelProgress > 0.65 ? 'Solte para cancelar' : 'Solte para enviar'}</small>
        </div>
      ) : null}

      {reviewing && blobReady && previewUrl ? (
        <div className="vr-review" role="group" aria-label="Prévia do áudio">
          <AudioPlayer
            src={previewUrl}
            duration={state.duration}
            waves={waveRef.current}
            className="vr-review-player"
          />
          <div className="vr-review-actions">
            <button type="button" onClick={discard} aria-label="Apagar áudio" title="Apagar">
              <Icon name="trash" />
            </button>
            <button type="button" onClick={reRecord} aria-label="Gravar novamente" title="Gravar novamente">
              <Icon name="mic" />
            </button>
            <button type="button" className="vr-send" onClick={send} aria-label="Enviar áudio" title="Enviar">
              <Icon name="send" />
            </button>
          </div>
        </div>
      ) : null}

      {reviewing && !blobReady ? (
        <div className="vr-processing" role="status">Processando áudio…</div>
      ) : null}

      {uploading ? (
        <div className="vr-uploading" role="status">
          <span className="vr-spinner" />
          <span>Enviando áudio…</span>
        </div>
      ) : null}

      {errored ? (
        <div className="vr-error" role="alert">
          <span>{state.error || 'Não foi possível gravar o áudio.'}</span>
          <button type="button" onClick={retry}>Tentar novamente</button>
          <button type="button" onClick={reRecord} aria-label="Cancelar">Cancelar</button>
        </div>
      ) : null}
    </div>
  );
}
