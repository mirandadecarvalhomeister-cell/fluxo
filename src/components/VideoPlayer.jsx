import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

function clock(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Fecha o vídeo usando o botão voltar do celular quando possível.
export function closeVideoWithHistory(close) {
  if (history.state?.fluxoVideo) history.back();
  else close?.();
}

// Empilha um estado no histórico para que o botão voltar feche o player
// em vez de sair da tela/publicação.
function useVideoHistory(open, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    if (!history.state?.fluxoVideo) {
      try {
        history.pushState({ ...(history.state || {}), fluxoVideo: true }, '');
      } catch {
        /* histórico indisponível */
      }
    }
    const onPop = () => closeRef.current?.();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open]);
}

// Trava a rolagem do feed enquanto o vídeo está expandido.
function useScrollLock(open) {
  useEffect(() => {
    if (!open) return undefined;
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('video-open');
    body.classList.add('video-open');
    return () => {
      html.classList.remove('video-open');
      body.classList.remove('video-open');
    };
  }, [open]);
}

function usePlayer(videoRef) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [chrome, setChrome] = useState(true);
  const hideRef = useRef(0);
  const playingRef = useRef(false);
  playingRef.current = playing;

  // Mostra os controles e agenda o auto-ocultar em 2,6s.
  const wake = useCallback(() => {
    setChrome(true);
    clearTimeout(hideRef.current);
    hideRef.current = window.setTimeout(() => {
      if (playingRef.current) setChrome(false);
    }, 2600);
  }, []);

  useEffect(() => () => clearTimeout(hideRef.current), []);

  const play = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play?.().catch(() => {});
    else el.pause?.();
    wake();
  }, [videoRef, wake]);

  // Liga o som assim que o vídeo é aberto por um toque. O navegador não expõe
  // o volume físico do celular, então usamos o volume máximo do próprio vídeo
  // e deixamos o aparelho controlar a saída de áudio.
  const enableSound = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    if (!el.volume) el.volume = 1;
    setVolume(el.volume || 1);
    setMuted(false);
    wake();
  }, [videoRef, wake]);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    if (!next && !el.volume) el.volume = 1;
    setMuted(next);
    setVolume(el.volume || 1);
    wake();
  }, [videoRef, wake]);

  // Volta ao modo silencioso do feed quando o vídeo é recolhido.
  const mute = useCallback(() => {
    const el = videoRef.current;
    if (el) el.muted = true;
    setMuted(true);
  }, [videoRef]);

  const setVolumeLevel = useCallback(
    (value) => {
      const el = videoRef.current;
      const next = Math.max(0, Math.min(1, Number(value) || 0));
      if (el) {
        el.volume = next;
        el.muted = next === 0;
      }
      setVolume(next);
      setMuted(next === 0);
      wake();
    },
    [videoRef, wake]
  );

  const seek = useCallback(
    (value) => {
      const el = videoRef.current;
      const next = Math.max(0, Number(value) || 0);
      if (el) {
        try {
          el.currentTime = next;
        } catch {
          /* posição indisponível */
        }
      }
      setTime(next);
      wake();
    },
    [videoRef, wake]
  );

  const videoProps = {
    onPlay: () => {
      setPlaying(true);
      wake();
    },
    onPause: () => {
      setPlaying(false);
      setChrome(true);
      clearTimeout(hideRef.current);
    },
    onTimeUpdate: (event) => setTime(event.currentTarget.currentTime || 0),
    onLoadedMetadata: (event) => {
      const el = event.currentTarget;
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      setVolume(el.volume);
      setMuted(el.muted);
    },
    onEnded: () => {
      setPlaying(false);
      setChrome(true);
      clearTimeout(hideRef.current);
    },
  };

  return {
    playing,
    muted,
    time,
    duration,
    volume,
    chrome,
    wake,
    play,
    toggleMute,
    enableSound,
    mute,
    setVolumeLevel,
    seek,
    videoProps,
  };
}

function PlayerControls({ player, onClose, status }) {
  const {
    playing,
    muted,
    time,
    duration,
    volume,
    chrome,
    play,
    toggleMute,
    setVolumeLevel,
    seek,
  } = player;

  return (
    <div
      className={`fv-ui${chrome ? ' on' : ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="fv-top">
        <button
          className="fv-btn"
          type="button"
          onClick={() => closeVideoWithHistory(onClose)}
          aria-label="Fechar vídeo"
        >
          <Icon name="x" />
        </button>
        <span className="fv-status">
          {status || (playing ? 'Reproduzindo' : 'Pausado')}
        </span>
      </div>

      <div className="fv-center">
        <button
          className="fv-play"
          type="button"
          onClick={play}
          aria-label={playing ? 'Pausar vídeo' : 'Reproduzir vídeo'}
        >
          <Icon name={playing ? 'pause' : 'play'} className="fill" />
        </button>
        <button
          className="fv-sound"
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
        >
          <Icon name={muted ? 'volumeoff' : 'volume'} />
          <span>{muted ? 'Sem som' : 'Com som'}</span>
        </button>
      </div>

      <div className="fv-bottom">
        <input
          className="fv-range"
          type="range"
          min="0"
          max={duration || 1}
          step="0.1"
          value={Math.min(time, duration || 1)}
          onChange={(event) => seek(event.target.value)}
          aria-label="Progresso do vídeo"
        />
        <div className="fv-meta">
          <span>
            {clock(time)} / {clock(duration)}
          </span>
          <label className="fv-vol">
            <Icon name={muted ? 'volumeoff' : 'volume'} />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(event) => setVolumeLevel(event.target.value)}
              aria-label="Volume do vídeo"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

// Pré-carrega o próximo vídeo do feed assim que o atual começa.
function primeNext(current) {
  const videos = Array.from(document.querySelectorAll('video[data-feed-video]'));
  const index = videos.indexOf(current);
  const next = videos[index + 1];
  if (next && next.preload !== 'auto') {
    next.preload = 'auto';
    try {
      next.load();
    } catch {
      /* sem suporte */
    }
  }
}

// Vídeo do feed: mudo, em loop, só toca com mais de 60% visível e expande
// para tela cheia sem recriar o elemento de vídeo.
export function FeedVideo({ src, style, onError }) {
  const videoRef = useRef(null);
  const player = usePlayer(videoRef);
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef(null);
  const dragYRef = useRef(0);
  const expandedRef = useRef(false);
  const { wake } = player;

  expandedRef.current = expanded;
  useScrollLock(expanded);
  useVideoHistory(expanded, () => setExpanded(false));

  // Autoplay inteligente: apenas o vídeo com mais de 60% na tela toca.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (expandedRef.current) return;
          if (entry.intersectionRatio >= 0.6) {
            el.play?.().catch(() => {});
            primeNext(el);
          } else {
            el.pause?.();
          }
        });
      },
      { threshold: [0, 0.6, 0.98] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!expanded) {
      player.mute();
      return;
    }
    player.enableSound();
    videoRef.current?.play?.().catch(() => {});
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const close = () => closeVideoWithHistory(() => setExpanded(false));

  const onPointerDown = (event) => {
    if (!expandedRef.current) return;
    if (event.target.closest('button, input, label')) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    wake();
  };

  const onPointerMove = (event) => {
    const start = dragRef.current;
    if (!start) return;
    const dy = event.clientY - start.y;
    const dx = event.clientX - start.x;
    if (dy > 0 && Math.abs(dy) > Math.abs(dx) + 6) {
      dragYRef.current = dy;
      setDragY(dy);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    const dy = dragYRef.current;
    dragYRef.current = 0;
    setDragY(0);
    if (dy > 90) close();
  };

  return (
    <div
      className={`fv${expanded ? ' fv-open' : ''}`}
      style={
        expanded && dragY
          ? { transform: `translateY(${dragY}px)`, transition: 'none' }
          : undefined
      }
      onClick={(event) => {
        if (!expanded) {
          event.preventDefault();
          event.stopPropagation();
          player.enableSound();
          setExpanded(true);
          return;
        }
        wake();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <video
        ref={videoRef}
        className="media-video fv-video"
        src={src}
        data-feed-video=""
        muted={player.muted}
        loop
        playsInline
        preload="metadata"
        style={expanded ? { filter: style?.filter } : style}
        onError={onError}
        {...player.videoProps}
      />

      {!expanded ? (
        <button
          className="fv-mute"
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            player.toggleMute();
          }}
          aria-label={player.muted ? 'Ativar som do vídeo' : 'Silenciar vídeo'}
        >
          <Icon name={player.muted ? 'volumeoff' : 'volume'} />
        </button>
      ) : (
        <PlayerControls player={player} onClose={close} />
      )}
    </div>
  );
}

// Player em tela cheia para vídeos recebidos no chat.
export function VideoViewer({ src, onClose }) {
  const videoRef = useRef(null);
  const player = usePlayer(videoRef);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef(null);
  const dragYRef = useRef(0);
  const { wake } = player;

  useScrollLock(true);
  useVideoHistory(true, onClose);

  useEffect(() => {
    player.enableSound();
    videoRef.current?.play?.().catch(() => {});
    wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => closeVideoWithHistory(onClose);

  const onPointerDown = (event) => {
    if (event.target.closest('button, input, label')) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    wake();
  };

  const onPointerMove = (event) => {
    const start = dragRef.current;
    if (!start) return;
    const dy = event.clientY - start.y;
    const dx = event.clientX - start.x;
    if (dy > 0 && Math.abs(dy) > Math.abs(dx) + 6) {
      dragYRef.current = dy;
      setDragY(dy);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    const dy = dragYRef.current;
    dragYRef.current = 0;
    setDragY(0);
    if (dy > 90) close();
  };

  return (
    <div
      className="vv"
      role="dialog"
      aria-modal="true"
      aria-label="Vídeo"
      style={
        dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <video
        ref={videoRef}
        className="vv-video"
        src={src}
        muted={player.muted}
        playsInline
        preload="auto"
        onClick={wake}
        {...player.videoProps}
      />
      <PlayerControls player={player} onClose={close} />
    </div>
  );
}
