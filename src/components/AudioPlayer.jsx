import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { claimPlayback, releasePlayback } from '../lib/audioPlayback';

const SPEEDS = [1, 1.5, 2];
const BAR_COUNT = 42;

export const formatAudioTime = (seconds) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

/** Onda determinística usada quando a mensagem não trouxe amplitudes reais. */
function fallbackWave(seed) {
  let hash = 0;
  const text = String(seed || 'fluxo');
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    const wave = Math.sin(index * 0.55 + (hash % 17)) * 0.5 + 0.5;
    const detail = Math.sin(index * 1.7 + (hash % 7)) * 0.22 + 0.5;
    return Math.max(0.16, Math.min(1, wave * 0.65 + detail * 0.35));
  });
}

function normalizeWave(waves, seed) {
  if (!Array.isArray(waves) || !waves.length) return fallbackWave(seed);
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    const value = Number(waves[Math.floor((index / BAR_COUNT) * waves.length)]) || 0.2;
    return Math.max(0.12, Math.min(1, value));
  });
}

/**
 * Player de áudio profissional e reutilizável.
 * - play/pause, avançar/retroceder 5s, seek por clique na onda
 * - velocidades 1x / 1,5x / 2x
 * - tempo atual e duração, identificação do remetente
 * - reprodução exclusiva em toda a aplicação
 */
export default function AudioPlayer({
  src,
  duration: knownDuration = 0,
  waves,
  sender,
  className = '',
  onReady,
  onError,
}) {
  const audioRef = useRef(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(Number(knownDuration) || 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const bars = useMemo(() => normalizeWave(waves, src), [waves, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onTime = () => setTime(audio.currentTime || 0);
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) {
        const value = audio.duration;
        setDuration(value);
        onReady?.(value);
      }
    };
    const onPlay = () => {
      claimPlayback(audio);
      setPlaying(true);
    };
    const onPause = () => {
      releasePlayback(audio);
      setPlaying(false);
    };
    const onEnded = () => {
      releasePlayback(audio);
      setPlaying(false);
      setTime(0);
    };
    const onErrorEvent = () => onErrorRef.current?.();
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onErrorEvent);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onErrorEvent);
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      releasePlayback(audio);
    };
  }, [src, onReady]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = SPEEDS[speedIndex];
  }, [speedIndex, src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      claimPlayback(audio);
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  const skip = (seconds) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, (audio.currentTime || 0) + seconds));
    setTime(audio.currentTime);
  };

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setTime(audio.currentTime);
  };

  const cycleSpeed = () => setSpeedIndex((index) => (index + 1) % SPEEDS.length);
  const progress = duration ? Math.min(1, time / duration) : 0;

  return (
    <div className={`audio-player ${className}`.trim()}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className="audio-player-play"
        onClick={toggle}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        title={playing ? 'Pausar' : 'Reproduzir'}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div className="audio-player-main">
        <div
          className="audio-player-wave"
          role="slider"
          tabIndex={0}
          aria-label="Progresso do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.ceil(duration) || 1}
          aria-valuenow={Math.floor(time)}
          onClick={seek}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') skip(5);
            if (event.key === 'ArrowLeft') skip(-5);
          }}
        >
          {bars.map((bar, index) => (
            <span
              key={index}
              className={index / BAR_COUNT <= progress ? 'on' : ''}
              style={{ height: `${Math.round(bar * 100)}%` }}
            />
          ))}
        </div>
        <div className="audio-player-meta">
          <button type="button" onClick={() => skip(-5)} title="Voltar 5 segundos" aria-label="Voltar 5 segundos">
            «5
          </button>
          <span className="audio-player-time">{formatAudioTime(time)}</span>
          {sender ? <span className="audio-player-sender ell">{sender}</span> : null}
          <span className="audio-player-time">{formatAudioTime(duration || knownDuration)}</span>
          <button type="button" onClick={() => skip(5)} title="Avançar 5 segundos" aria-label="Avançar 5 segundos">
            5»
          </button>
        </div>
      </div>
      <button
        type="button"
        className="audio-player-speed"
        onClick={cycleSpeed}
        aria-label={`Velocidade ${SPEEDS[speedIndex]}x. Toque para alterar.`}
        title="Alterar velocidade"
      >
        {SPEEDS[speedIndex]}x
      </button>
    </div>
  );
}
