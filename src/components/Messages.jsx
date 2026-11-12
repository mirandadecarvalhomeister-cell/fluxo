import { useEffect, useRef, useState } from 'react';
import { art } from '../lib/art';
import { userOf } from '../lib/selectors';
import { fileToDataURL, hm } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { TagText } from './Brand';
import EmojiPicker from './EmojiPicker';
import { Icon } from './Icon';
import StickerPicker from './StickerPicker';

const ATTACH_LABEL = {
  photo: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  file: 'Arquivo',
  post: 'Publicação compartilhada',
  story: 'Resposta ao story',
  sticker: 'Figurinha',
};

const SWIPE_LIMIT = 58;

const WALLS = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'neon', label: 'Neon' },
  { id: 'mare', label: 'Maré' },
  { id: 'sertao', label: 'Sertão' },
  { id: 'jabuticaba', label: 'Jabuticaba' },
  { id: 'roda', label: 'Roda' },
  { id: 'noite', label: 'Noite' },
  { id: 'sol', label: 'Sol' },
];

const fmtTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    Math.floor(seconds % 60)
  ).padStart(2, '0')}`;

const previewOf = (message) => {
  const text = (message.text || '').trim();
  if (text) return text;
  if (message.attachment) return ATTACH_LABEL[message.attachment.kind] || 'Mensagem';
  return 'Mensagem';
};

const lastOf = (chat) => {
  const message = chat.msgs[chat.msgs.length - 1];
  return message ? (message.me ? 'Você: ' : '') + previewOf(message) : 'Sem mensagens';
};

const copyToClipboard = async (value) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
};

function PostAttachment({ attachment }) {
  const { data, actions } = useApp();
  const post = data.posts.find((item) => item.id === attachment.postId);
  const author = userOf(data, attachment.authorId || post?.by);
  const text = attachment.text || post?.text || 'Publicação compartilhada';

  return (
    <button
      type="button"
      className="att-post"
      onClick={() => actions.openPost(attachment.postId)}
    >
      <span className="att-post-h">
        <Avatar user={author} size={26} />
        <b className="ell">{author.name}</b>
      </span>
      <span className="att-post-t">{text}</span>
      <span className="att-post-f">
        <Icon name="link" /> Ver publicação
      </span>
    </button>
  );
}

function StoryAttachment({ attachment }) {
  const { data, actions } = useApp();
  const author = userOf(data, attachment.authorId);
  const isVideo = attachment.mediaKind === 'video';

  return (
    <button
      type="button"
      className="att-post"
      onClick={() => actions.openUser(attachment.authorId)}
    >
      <span className="att-post-h">
        <Avatar user={author} size={26} />
        <b className="ell">{author.name}</b>
      </span>
      {attachment.media ? (
        isVideo ? (
          <video className="att-story-thumb" src={attachment.media} muted playsInline />
        ) : (
          <img className="att-story-thumb" src={attachment.media} alt="Story" />
        )
      ) : null}
      <span className="att-post-t">{attachment.text || 'Story'}</span>
      <span className="att-post-f">
        <Icon name="user" /> Ver perfil de {author.name.split(' ')[0]}
      </span>
    </button>
  );
}

function AudioMessage({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onTime = () => setTime(audio.currentTime || 0);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('ended', onEnd);
      audio.pause();
    };
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setTime(audio.currentTime);
  };

  const progress = duration ? Math.min(100, (time / duration) * 100) : 0;
  const shown = duration ? duration : time;

  return (
    <div className="audio-msg">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className="audio-play"
        onClick={toggle}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        title={playing ? 'Pausar' : 'Reproduzir'}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div className="audio-main">
        <button
          type="button"
          className="audio-bar"
          onClick={seek}
          aria-label="Avançar no áudio"
        >
          <span style={{ width: `${progress}%` }} />
        </button>
        <div className="audio-times">
          <span>{fmtTime(time)}</span>
          <span>{fmtTime(shown)}</span>
        </div>
      </div>
    </div>
  );
}

function Attachment({ attachment, onOpen }) {
  if (attachment.kind === 'post') {
    return <PostAttachment attachment={attachment} />;
  }
  if (attachment.kind === 'story') {
    return <StoryAttachment attachment={attachment} />;
  }
  if (attachment.kind === 'sticker') {
    return (
      <span className={`att-sticker pack-${attachment.pack || 'fluxo'}`} role="img" aria-label="Figurinha">
        <span>{attachment.sticker || '✨'}</span>
      </span>
    );
  }
  if (!attachment.src) {
    return (
      <span className="att-file">
        <Icon name="file" />
        <span className="ell">
          {attachment.name || ATTACH_LABEL[attachment.kind] || 'Arquivo'}
        </span>
      </span>
    );
  }
  if (attachment.kind === 'photo') {
    return (
      <button
        type="button"
        className="att-media"
        onClick={() => onOpen?.({ src: attachment.src, kind: 'photo', name: attachment.name })}
        aria-label="Abrir foto"
      >
        <img
          className="att-img"
          src={attachment.src}
          alt={attachment.name || 'Foto'}
          loading="lazy"
        />
      </button>
    );
  }
  if (attachment.kind === 'video') {
    return (
      <button
        type="button"
        className="att-media att-media-video"
        onClick={() => onOpen?.({ src: attachment.src, kind: 'video', name: attachment.name })}
        aria-label="Abrir vídeo"
      >
        <video
          className="att-video"
          src={attachment.src}
          muted
          playsInline
          preload="metadata"
        />
        <span className="att-play">
          <Icon name="play" className="fill" />
        </span>
      </button>
    );
  }
  if (attachment.kind === 'audio') {
    return <AudioMessage src={attachment.src} />;
  }
  return (
    <a
      className="att-file"
      href={attachment.src}
      download={attachment.name}
      target="_blank"
      rel="noreferrer"
    >
      <Icon name="file" />
      <span className="ell">{attachment.name || 'Arquivo'}</span>
    </a>
  );
}

function ChatMessage({ message, index, chat, author, onMenu, onOpenMedia }) {
  const { actions } = useApp();
  const [revealed, setRevealed] = useState(false);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const pressRef = useRef(null);
  const longRef = useRef(null);
  const movedRef = useRef(false);

  useEffect(() => () => clearTimeout(longRef.current), []);

  const offset = drag != null ? drag : revealed ? -SWIPE_LIMIT : 0;

  const clearLong = () => {
    if (longRef.current) {
      clearTimeout(longRef.current);
      longRef.current = null;
    }
  };

  const onDown = (event) => {
    movedRef.current = false;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('a,button')) return;
    pressRef.current = { x: event.clientX, y: event.clientY };
    if (!revealed) {
      clearLong();
      longRef.current = window.setTimeout(() => {
        longRef.current = null;
        if (!movedRef.current) {
          onMenu({ message, index, chat });
        }
      }, 460);
    }
  };

  const onMove = (event) => {
    const press = pressRef.current;
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      if (longRef.current) {
        clearLong();
        movedRef.current = true;
      }
    }
    if (Math.abs(dx) > Math.abs(dy) + 4) {
      const base = revealed ? -SWIPE_LIMIT : 0;
      const next = Math.max(-SWIPE_LIMIT - 30, Math.min(0, base + dx));
      dragRef.current = next;
      setDrag(next);
    }
  };

  const finish = () => {
    clearLong();
    const wasPressing = !!pressRef.current;
    pressRef.current = null;
    const current = dragRef.current;
    dragRef.current = null;
    if (current != null) {
      setRevealed(current < -SWIPE_LIMIT * 0.45);
      setDrag(null);
    } else if (wasPressing && revealed && !movedRef.current) {
      setRevealed(false);
    }
    window.setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  const cancel = () => {
    clearLong();
    pressRef.current = null;
    dragRef.current = null;
    setDrag(null);
    window.setTimeout(() => {
      movedRef.current = false;
    }, 0);
  };

  return (
    <div
      className={`msg-wrap ${message.me ? 'me' : 'them'} ${
        revealed ? 'revealed' : ''
      } ${drag != null && drag < -16 ? 'dragging' : ''}`}
    >
      <button
        type="button"
        className="msg-trash"
        aria-label="Apagar mensagem"
        title="Apagar mensagem"
        onClick={() => {
          setRevealed(false);
          actions.deleteMessage(chat.id, index);
        }}
      >
        <Icon name="trash" />
      </button>
      <div
        className={`msg-shell ${message.me ? 'me' : 'them'} ${
          message.liked ? 'liked' : ''
        }`}
        style={{
          transform: `translateX(${offset}px)`,
          transition: drag != null ? 'none' : undefined,
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={finish}
        onPointerCancel={cancel}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') finish();
        }}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          if (movedRef.current) return;
          if (revealed) setRevealed(false);
        }}
        onDoubleClick={() => actions.likeMessage(chat.id, index)}
      >
        {!message.me ? <Avatar user={author} size={28} /> : null}
        <div
          className={`b ${message.me ? 'me' : 'them'} ${message.liked ? 'liked' : ''} ${
            message.attachment?.kind === 'sticker' ? 'sticker-bubble' : ''
          }`}
          title="Segure para mais opções"
        >
          {message.text ? (
            <p>
              <TagText text={message.text} />
            </p>
          ) : null}
          {message.attachment ? (
            <Attachment attachment={message.attachment} onOpen={onOpenMedia} />
          ) : null}
          <span className="meta">
            {hm(message.ts)}
            {message.me ? (
              <Icon
                name={message.st === 'read' ? 'dcheck' : 'check'}
                className={`tick ${message.st === 'read' ? 'read' : ''}`}
              />
            ) : null}
          </span>
          {message.liked ? (
            <i className="react">
              <Icon name="heart" className="fill" />
            </i>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MediaViewer({ media, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="media-viewer" role="dialog" aria-modal="true" aria-label="Visualizar mídia">
      <button className="mv-scrim" type="button" onClick={onClose} aria-label="Fechar" />
      <div className="mv-body">
        <button className="mv-close" type="button" onClick={onClose} aria-label="Fechar">
          <Icon name="x" />
        </button>
        {media.kind === 'video' ? (
          <video src={media.src} controls autoPlay playsInline />
        ) : (
          <img src={media.src} alt={media.name || 'Foto'} />
        )}
        <a
          className="mv-download"
          href={media.src}
          download={media.name || undefined}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="download" /> Baixar
        </a>
      </div>
    </div>
  );
}

const ZOOM_MAX = 4;
const RECORD_LIMIT = 60;

function CameraCapture({ onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const holdTimerRef = useRef(null);
  const pinchRef = useRef(null);
  const previewUrlRef = useRef(null);
  const facingRef = useRef('user');
  const discardRef = useRef(false);
  const holdModeRef = useRef(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [facing, setFacing] = useState('user');
  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [torchable, setTorchable] = useState(false);
  const [preview, setPreview] = useState(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const openStream = async (next) => {
    setError('');
    setReady(false);
    const attempts = [
      {
        video: {
          facingMode: { ideal: next },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      },
      { video: { facingMode: { ideal: next } }, audio: true },
      { video: true, audio: true },
    ];
    let stream = null;
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch {
        /* tenta a próxima combinação */
      }
    }
    if (!stream) {
      setError('Não foi possível acessar a câmera.');
      return false;
    }
    stopStream();
    streamRef.current = stream;
    facingRef.current = next;
    setFacing(next);
    setZoom(1);
    setTorch(false);
    const track = stream.getVideoTracks()[0];
    setTorchable(!!track?.getCapabilities?.().torch);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    setReady(true);
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await openStream('user');
      if (!ok && !cancelled) setReady(false);
    })();

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      clearTimeout(holdTimerRef.current);
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopStream();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyZoom = (value) => {
    const next = Math.max(1, Math.min(ZOOM_MAX, Math.round(value * 10) / 10));
    setZoom(next);
    const track = streamRef.current?.getVideoTracks?.()[0];
    const caps = track?.getCapabilities?.();
    if (caps?.zoom?.max) {
      const target = Math.min(
        caps.zoom.max,
        Math.max(caps.zoom.min || 1, next)
      );
      track.applyConstraints({ advanced: [{ zoom: target }] }).catch(() => {});
    }
  };

  const onPinchStart = (event) => {
    if (event.touches.length !== 2) return;
    const [a, b] = event.touches;
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pinchRef.current = { distance, zoom };
  };

  const onPinchMove = (event) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    const [a, b] = event.touches;
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = distance / (pinchRef.current.distance || 1);
    applyZoom(pinchRef.current.zoom * ratio);
  };

  const close = () => {
    discardRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    onClose();
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (facingRef.current === 'user') {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreview({ url, blob, kind: 'photo', name: `camera-${Date.now()}.jpg` });
      },
      'image/jpeg',
      0.92
    );
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const startRecording = () => {
    if (recording || recorderRef.current) return;
    if (!streamRef.current || !window.MediaRecorder) {
      setError('Gravação de vídeo não é suportada neste navegador.');
      return;
    }
    const mime = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ].find((type) => MediaRecorder.isTypeSupported(type));
    try {
      const recorder = new MediaRecorder(
        streamRef.current,
        mime ? { mimeType: mime } : undefined
      );
      chunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearInterval(timerRef.current);
        recorderRef.current = null;
        setRecording(false);
        setSeconds(0);
        if (discardRef.current) {
          chunksRef.current = [];
          return;
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'video/webm',
        });
        if (!blob.size) {
          setError('A gravação ficou vazia.');
          return;
        }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreview({ url, blob, kind: 'video', name: `camera-${Date.now()}.webm` });
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      setSeconds(0);
      let count = 0;
      timerRef.current = setInterval(() => {
        count += 1;
        setSeconds(count);
        if (count >= RECORD_LIMIT) stopRecording();
      }, 1000);
    } catch {
      setError('Não foi possível gravar o vídeo.');
    }
  };

  const onShutterDown = (event) => {
    if (!ready || preview) return;
    event.preventDefault();
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    holdModeRef.current = true;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* ignora */
    }
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (holdModeRef.current) startRecording();
    }, 280);
  };

  const onShutterUp = () => {
    if (!holdModeRef.current) return;
    holdModeRef.current = false;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      takePhoto();
      return;
    }
    stopRecording();
  };

  const onShutterCancel = () => {
    holdModeRef.current = false;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (recorderRef.current?.state === 'recording') {
      discardRef.current = true;
      stopRecording();
    }
  };

  const toggleSideVideo = () => {
    if (preview) return;
    if (recording) stopRecording();
    else startRecording();
  };

  const flipCamera = async () => {
    if (recording) return;
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    const ok = await openStream(next);
    if (!ok) setError('Não foi possível trocar a câmera.');
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch((value) => !value);
    } catch {
      setError('Lanterna indisponível nesta câmera.');
    }
  };

  const discardPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
  };

  const sendPreview = () => {
    if (!preview) return;
    const { blob, kind, name } = preview;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
    onCapture(blob, kind, name);
  };

  const mirror = facing === 'user';
  const zoomLabel = `${zoom.toFixed(1)}x`;

  return (
    <div className="cam-overlay" role="dialog" aria-modal="true" aria-label="Câmera">
      <div
        className="cam-stage"
        onTouchStart={onPinchStart}
        onTouchMove={onPinchMove}
        onTouchEnd={() => {
          pinchRef.current = null;
        }}
      >
        <video
          ref={videoRef}
          className="cam-video"
          muted
          playsInline
          style={{
            transform: `${mirror ? 'scaleX(-1) ' : ''}scale(${zoom})`,
          }}
        />

        <div className="cam-top">
          <button className="cam-round" type="button" onClick={close} aria-label="Fechar câmera">
            <Icon name="x" />
          </button>
          <span className={`cam-timer${recording ? ' on' : ''}`}>
            {recording ? `● ${fmtTime(seconds)}` : 'FluXo Câmera'}
          </span>
          <div className="cam-top-actions">
            {torchable ? (
              <button
                className={`cam-round${torch ? ' on' : ''}`}
                type="button"
                onClick={toggleTorch}
                aria-label="Lanterna"
                aria-pressed={torch}
              >
                <Icon name={torch ? 'flash' : 'flashoff'} />
              </button>
            ) : null}
            <button
              className="cam-round"
              type="button"
              onClick={flipCamera}
              disabled={!ready || recording}
              aria-label="Virar câmera"
            >
              <Icon name="flip" />
            </button>
          </div>
        </div>

        {!ready && !error ? <div className="cam-loading">Abrindo câmera…</div> : null}
        {error ? <div className="cam-error">{error}</div> : null}

        <div className="cam-zoom" aria-label="Zoom da câmera">
          <button type="button" onClick={() => applyZoom(zoom - 0.5)} aria-label="Diminuir zoom">
            <Icon name="minus" />
          </button>
          <input
            type="range"
            min="1"
            max={ZOOM_MAX}
            step="0.1"
            value={zoom}
            onChange={(event) => applyZoom(Number(event.target.value))}
            aria-label="Zoom"
          />
          <button type="button" onClick={() => applyZoom(zoom + 0.5)} aria-label="Aumentar zoom">
            <Icon name="plus" />
          </button>
          <b>{zoomLabel}</b>
        </div>

        <div className="cam-bottom">
          <button
            className={`cam-side${recording ? ' on' : ''}`}
            type="button"
            onClick={toggleSideVideo}
            disabled={!ready}
            aria-label={recording ? 'Parar gravação' : 'Gravar vídeo'}
            title={recording ? 'Parar gravação' : 'Gravar vídeo'}
          >
            <span />
          </button>
          <button
            className={`cam-shutter${recording ? ' on' : ''}`}
            type="button"
            onPointerDown={onShutterDown}
            onPointerUp={onShutterUp}
            onPointerCancel={onShutterCancel}
            disabled={!ready}
            aria-label="Tirar foto ou segurar para gravar"
            title="Toque para foto · segure para gravar"
          >
            <span />
          </button>
          <span className="cam-side-hint">
            {recording ? 'Solte para parar' : 'Segure para gravar'}
          </span>
        </div>
      </div>

      {preview ? (
        <div className="cam-preview">
          <div className="cam-preview-card">
            <header>
              <b>{preview.kind === 'video' ? 'Vídeo gravado' : 'Foto capturada'}</b>
              <button
                className="cam-round"
                type="button"
                onClick={discardPreview}
                aria-label="Descartar"
              >
                <Icon name="x" />
              </button>
            </header>
            {preview.kind === 'video' ? (
              <video src={preview.url} controls autoPlay playsInline />
            ) : (
              <img src={preview.url} alt="Prévia da foto" />
            )}
            <div className="cam-preview-actions">
              <button className="btn ghost" type="button" onClick={discardPreview}>
                Descartar
              </button>
              <button className="btn primary" type="button" onClick={sendPreview}>
                <Icon name="send" /> Enviar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function Messages() {
  const { data, ui, actions, onlinePeople, typingPeople } = useApp();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [headMenu, setHeadMenu] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [forward, setForward] = useState(null);
  const [recording, setRecording] = useState(false);
  const [holding, setHolding] = useState(false);
  const [cancelHint, setCancelHint] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const boxRef = useRef(null);
  const formRef = useRef(null);
  const inputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const wallInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const discardRef = useRef(false);
  const canceledRef = useRef(false);
  const holdRef = useRef(null);
  const startedAtRef = useRef(0);
  const inputHoldRef = useRef(null);
  const caretRef = useRef({ start: 0, end: 0 });
  const backRef = useRef(actions.backChat);
  backRef.current = actions.backChat;

  const chat = data.chats.find((c) => c.id === ui.chat);
  const person = chat ? userOf(data, chat.with) : null;
  const query = ui.chatQ.toLowerCase();
  const mutedChat = (ui.settings.mutedChats || []).includes(chat?.with);
  const wall = chat ? (ui.settings.chatWalls || {})[chat.with] : null;
  const onlineChat = chat ? onlinePeople.includes(chat.with) : false;
  const typingChat = chat ? !!typingPeople[chat.with] : false;

  const list = data.chats
    .filter((c) => userOf(data, c.with).name.toLowerCase().includes(query))
    .sort(
      (a, b) => (b.msgs[b.msgs.length - 1]?.ts || 0) - (a.msgs[a.msgs.length - 1]?.ts || 0)
    );

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat?.id, chat?.msgs.length, typingChat]);

  useEffect(() => {
    setHeadMenu(false);
    setWallOpen(false);
    setMenu(null);
    setEmojiOpen(false);
    setStickerOpen(false);
    setAttachOpen(false);
    setViewer(null);
    setForward(null);
  }, [chat?.id]);

  // Voltar do celular fecha a conversa em vez de sair do app.
  useEffect(() => {
    if (!ui.chatOpen) return undefined;
    if (!history.state?.fluxoChat) {
      try {
        history.pushState({ ...(history.state || {}), fluxoChat: true }, '');
      } catch {
        /* histórico indisponível */
      }
    }
    const onPop = () => backRef.current();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [ui.chatOpen]);

  const closeChat = () => {
    if (history.state?.fluxoChat) history.back();
    else actions.backChat();
  };

  useEffect(
    () => () => {
      clearInterval(timerRef.current);
      clearTimeout(inputHoldRef.current?.id);
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    },
    []
  );

  const saveCaret = () => {
    const input = inputRef.current;
    if (!input) return;
    caretRef.current = {
      start: input.selectionStart ?? text.length,
      end: input.selectionEnd ?? text.length,
    };
  };

  const insertEmoji = (emoji) => {
    const input = inputRef.current;
    const length = text.length;
    const start = Math.min(caretRef.current.start ?? length, length);
    const end = Math.min(Math.max(caretRef.current.end ?? start, start), length);
    const next = text.slice(0, start) + emoji + text.slice(end);
    const caret = start + emoji.length;
    caretRef.current = { start: caret, end: caret };
    setText(next);
    // Não devolve o foco: no celular isso reabriria o teclado.
    if (input && document.activeElement === input) {
      try {
        input.setSelectionRange(caret, caret);
      } catch {
        /* campo sem seleção */
      }
    }
  };

  const openEmoji = () => {
    saveCaret();
    inputRef.current?.blur();
    setEmojiOpen((value) => !value);
    setStickerOpen(false);
    setAttachOpen(false);
  };

  const openStickers = () => {
    saveCaret();
    inputRef.current?.blur();
    setStickerOpen((value) => !value);
    setEmojiOpen(false);
    setAttachOpen(false);
  };

  const sendSticker = (sticker, pack) => {
    setStickerOpen(false);
    actions.sendMessage('', { kind: 'sticker', sticker, pack });
  };

  const pickMedia = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setAttachOpen(false);
    if (!file) return;
    const kind = file.type.startsWith('image/') ? 'photo' : 'video';
    actions.sendChatFile(file, kind);
  };

  const pickFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setAttachOpen(false);
    if (file) actions.sendChatFile(file, 'file');
  };

  const pickWall = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !chat) return;
    try {
      const src = await fileToDataURL(file, 960);
      actions.setChatWallpaper(chat.with, { src });
    } catch {
      actions.notify('Não foi possível usar essa imagem.');
    }
  };

  const startAudio = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      actions.notify('Gravação de áudio não é suportada neste navegador.');
      setHolding(false);
      holdRef.current = null;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!holdRef.current || canceledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        setHolding(false);
        return;
      }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported ? MediaRecorder.isTypeSupported(type) : false
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      discardRef.current = false;
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearInterval(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setRecording(false);
        setRecordSeconds(0);
        const discarded = discardRef.current;
        const tooShort = Date.now() - startedAtRef.current < 700;
        discardRef.current = false;
        if (discarded || tooShort) {
          chunksRef.current = [];
          if (!discarded && tooShort) actions.notify('Segure para gravar um áudio.');
          return;
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size) {
          actions.sendChatBlob(blob, 'audio', `audio-${Date.now()}.webm`);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    } catch {
      actions.notify('Não foi possível acessar o microfone.');
      holdRef.current = null;
      setHolding(false);
    }
  };

  const stopAudio = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const beginHold = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* alguns navegadores não suportam */
    }
    holdRef.current = { x: event.clientX, y: event.clientY, cancel: false };
    canceledRef.current = false;
    discardRef.current = false;
    setCancelHint(false);
    setHolding(true);
    startAudio();
  };

  const moveHold = (event) => {
    const hold = holdRef.current;
    if (!hold) return;
    const dy = event.clientY - hold.y;
    const dx = event.clientX - hold.x;
    const cancel = dy < -70 || Math.abs(dx) > 120;
    if (cancel !== hold.cancel) {
      hold.cancel = cancel;
      canceledRef.current = cancel;
      discardRef.current = cancel;
      setCancelHint(cancel);
    }
  };

  const endHold = () => {
    if (!holdRef.current) return;
    holdRef.current = null;
    setHolding(false);
    setCancelHint(false);
    if (recorderRef.current?.state === 'recording') stopAudio();
    else canceledRef.current = true;
  };

  const cancelHold = () => {
    canceledRef.current = true;
    setCancelHint(false);
    discardRef.current = true;
    endHold();
  };

  const submit = (event) => {
    event?.preventDefault();
    const value = text;
    if (!value.trim()) {
      inputRef.current?.focus();
      return;
    }
    setText('');
    setEmojiOpen(false);
    setStickerOpen(false);
    setAttachOpen(false);
    caretRef.current = { start: 0, end: 0 };
    actions.sendMessage(value);
    requestAnimationFrame(() => {
      const box = boxRef.current;
      if (box) box.scrollTop = box.scrollHeight;
    });
  };

  const growInput = (element) => {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 118)}px`;
  };

  const startInputHold = (event) => {
    if (!text.trim()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearTimeout(inputHoldRef.current?.id);
    const id = window.setTimeout(async () => {
      inputHoldRef.current = null;
      const ok = await copyToClipboard(text);
      actions.notify(ok ? 'Texto copiado' : 'Não foi possível copiar');
    }, 650);
    inputHoldRef.current = { id, x: event.clientX, y: event.clientY };
  };

  const moveInputHold = (event) => {
    const hold = inputHoldRef.current;
    if (!hold) return;
    if (Math.abs(event.clientX - hold.x) > 8 || Math.abs(event.clientY - hold.y) > 8) {
      clearTimeout(hold.id);
      inputHoldRef.current = null;
    }
  };

  const endInputHold = () => {
    if (!inputHoldRef.current) return;
    clearTimeout(inputHoldRef.current.id);
    inputHoldRef.current = null;
  };

  const copyMessage = async (message) => {
    const value =
      (message.text || '').trim() ||
      ATTACH_LABEL[message.attachment?.kind] ||
      'Mensagem';
    const ok = await copyToClipboard(value);
    actions.notify(ok ? 'Mensagem copiada' : 'Não foi possível copiar');
  };

  const wallSrc = wall && typeof wall === 'object' ? wall.src : wall ? art(wall, 900, 1400) : null;
  const wallStyle = wallSrc
    ? {
        backgroundImage: `linear-gradient(180deg,rgba(10,7,24,.42),rgba(10,7,24,.6)),url('${wallSrc}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined;

  const closePickers = () => {
    setEmojiOpen(false);
    setStickerOpen(false);
    setAttachOpen(false);
  };

  const forwardTo = (target) => {
    if (!forward) return;
    const message = forward.message;
    actions.sendMessageTo(target.id, message.text, message.attachment);
    actions.notify(
      `Encaminhado para ${userOf(data, target.with).name.split(' ')[0]}`
    );
    setForward(null);
    setMenu(null);
  };

  return (
    <>
      <div className="pagehead">
        <h1>Mensagens</h1>
      </div>

      <div className={`card chat-app ${ui.chatOpen ? 'open' : ''}`}>
        <div className="clist">
          <div className="top">
            <div style={{ position: 'relative' }}>
              <input
                className="in"
                id="chatQ"
                type="search"
                placeholder="Buscar conversa"
                value={ui.chatQ}
                onChange={(event) => actions.setChatQuery(event.target.value)}
                aria-label="Buscar conversa"
                style={{ paddingLeft: 38 }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                }}
              >
                <Icon name="search" />
              </span>
            </div>
            <button className="btn tonal sm" type="button" onClick={actions.openNewChat}>
              <Icon name="plus" /> Nova conversa
            </button>
          </div>
          <div className="items">
            {list.length ? (
              list.map((c) => {
                const item = userOf(data, c.with);
                const last = c.msgs[c.msgs.length - 1];
                const muted = (ui.settings.mutedChats || []).includes(c.with);
                return (
                  <button
                    className={`ci ${c.id === ui.chat ? 'on' : ''}`}
                    key={c.id}
                    onClick={() => actions.openChat(c.id)}
                  >
                    <Avatar
                      user={item}
                      size={46}
                      online={onlinePeople.includes(c.with)}
                    />
                    <div className="grow">
                      <div className="t">
                        <b className="ell">
                          {item.name}
                          {muted ? <Icon name="volumeoff" className="ci-mute" /> : null}
                        </b>
                        <span>{last ? hm(last.ts) : ''}</span>
                      </div>
                      <div className="t">
                        <span
                          className={`pv ell${typingPeople[c.with] ? ' typing-text' : ''}`}
                          style={{ fontSize: 13, color: 'var(--muted)' }}
                        >
                          {typingPeople[c.with] ? 'digitando…' : lastOf(c)}
                        </span>
                        {c.unread ? (
                          <span
                            className="ci-badge"
                            aria-label={`${c.unread} mensagens não lidas`}
                          >
                            {c.unread > 99 ? '99+' : c.unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="muted sm" style={{ padding: 16 }}>
                Ninguém encontrado.
              </p>
            )}
          </div>
        </div>

        <div className="cpane">
          {chat ? (
            <>
              <div className="chead">
                <button className="icon-btn back" onClick={closeChat} aria-label="Voltar">
                  <Icon name="back" />
                </button>
                <button
                  type="button"
                  className="chead-user"
                  onClick={() => actions.openUser(chat.with)}
                  title={`Ver perfil de ${person.name}`}
                >
                  <Avatar user={person} size={42} online={onlineChat} />
                  <span>
                    <b className="ell">{person.name}</b>
                    <span className={onlineChat ? 'online-label sm' : 'muted sm'}>
                      {onlineChat ? 'Online agora' : 'Conversa direta'}
                    </span>
                  </span>
                </button>
                <button
                  className={`icon-btn bell ${mutedChat ? 'on' : ''}`}
                  type="button"
                  onClick={() => actions.toggleChatMute(chat.with)}
                  aria-pressed={mutedChat}
                  aria-label="Silenciar conversa"
                  title={mutedChat ? 'Reativar conversa' : 'Silenciar conversa'}
                >
                  <Icon name="bell" />
                </button>
                <button
                  className={`icon-btn ${headMenu ? 'on' : ''}`}
                  type="button"
                  onClick={() => setHeadMenu((value) => !value)}
                  aria-label="Mais opções da conversa"
                  aria-expanded={headMenu}
                  title="Mais opções"
                >
                  <Icon name="more" />
                </button>
                {headMenu ? (
                  <>
                    <button
                      className="menu-scrim"
                      type="button"
                      aria-label="Fechar menu"
                      onClick={() => setHeadMenu(false)}
                    />
                    <div className="chat-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setHeadMenu(false);
                          setWallOpen(true);
                        }}
                      >
                        <Icon name="brush" /> Papel de parede
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setHeadMenu(false);
                          actions.toggleChatMute(chat.with);
                        }}
                      >
                        <Icon name={mutedChat ? 'volume' : 'volumeoff'} />
                        {mutedChat ? 'Reativar conversa' : 'Silenciar conversa'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setHeadMenu(false);
                          actions.clearChat(chat.id);
                        }}
                      >
                        <Icon name="broom" /> Limpar histórico
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="danger"
                        onClick={() => {
                          setHeadMenu(false);
                          actions.deleteChat(chat.id);
                        }}
                      >
                        <Icon name="trash" /> Apagar conversa
                      </button>
                    </div>
                  </>
                ) : null}
              </div>

              <div
                id="msgBox"
                ref={boxRef}
                className={wallSrc ? 'has-wall' : ''}
                style={wallStyle}
              >
                <div className="dayline">Hoje</div>
                {chat.msgs.length ? (
                  chat.msgs.map((message, index) => (
                    <ChatMessage
                      key={message.id || `${message.ts}-${index}`}
                      message={message}
                      index={index}
                      chat={chat}
                      author={person}
                      onMenu={setMenu}
                      onOpenMedia={setViewer}
                    />
                  ))
                ) : (
                  <div className="chat-empty">
                    <span className="chat-empty-ic">
                      <Icon name="chat" />
                    </span>
                    <b>Comece a conversa</b>
                    <p className="muted sm">
                      Mande um oi para {person.name.split(' ')[0]}.
                    </p>
                  </div>
                )}
                {typingChat ? (
                  <div className="msg-wrap them typing-row" aria-live="polite">
                    <div className="msg-shell them">
                      <Avatar user={person} size={28} />
                      <div
                        className="b them typing"
                        title={`${person.name} está digitando`}
                        aria-label={`${person.name} está digitando`}
                      >
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <form className="cform" ref={formRef} onSubmit={submit}>
                {attachOpen ? (
                  <>
                    <button
                      className="pop-scrim"
                      type="button"
                      aria-label="Fechar anexos"
                      onClick={() => setAttachOpen(false)}
                    />
                    <div className="attach-menu">
                      <button
                        type="button"
                        onClick={() => mediaInputRef.current?.click()}
                      >
                        <Icon name="image" /> Foto ou vídeo
                      </button>
                      <button type="button" onClick={() => fileInputRef.current?.click()}>
                        <Icon name="file" /> Documento
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachOpen(false);
                          setCameraOpen(true);
                        }}
                      >
                        <Icon name="camera" /> Câmera
                      </button>
                    </div>
                  </>
                ) : null}
                {emojiOpen || stickerOpen ? (
                  <>
                    <button
                      className="pop-scrim"
                      type="button"
                      aria-label="Fechar painel"
                      onClick={() => {
                        setEmojiOpen(false);
                        setStickerOpen(false);
                      }}
                    />
                    {emojiOpen ? (
                      <EmojiPicker
                        onPick={insertEmoji}
                        onClose={() => setEmojiOpen(false)}
                      />
                    ) : (
                      <StickerPicker
                        onPick={sendSticker}
                        onClose={() => setStickerOpen(false)}
                      />
                    )}
                  </>
                ) : null}
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  hidden
                  onChange={pickMedia}
                />
                <input ref={fileInputRef} type="file" hidden onChange={pickFile} />

                {holding || recording ? (
                  <div className={`rec-bar ${cancelHint ? 'cancel' : ''}`}>
                    <span className="rec-dot" />
                    <b>{fmtTime(recordSeconds)}</b>
                    <span className="grow" />
                    <span className="rec-hint">
                      {cancelHint ? 'Solte para cancelar' : 'Solte para enviar'}
                    </span>
                  </div>
                ) : (
                  <div className="msg-composer">
                    <button
                      className="icon-btn msg-composer-btn"
                      type="button"
                      onClick={() => {
                        setAttachOpen((value) => !value);
                        setEmojiOpen(false);
                      }}
                      aria-label="Anexar"
                      title="Anexar"
                    >
                      <Icon name="paperclip" />
                    </button>
                    <textarea
                      className="msg-composer-in"
                      id="msgIn"
                      ref={inputRef}
                      rows={1}
                      maxLength={2000}
                      autoComplete="off"
                      placeholder="Escreva uma mensagem"
                      aria-label="Mensagem"
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        growInput(event.currentTarget);
                        actions.sendTyping(chat.with);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          formRef.current?.requestSubmit();
                        }
                      }}
                      onPointerDown={startInputHold}
                      onPointerMove={moveInputHold}
                      onPointerUp={endInputHold}
                      onPointerCancel={endInputHold}
                      onPointerLeave={endInputHold}
                      onSelect={saveCaret}
                      onBlur={saveCaret}
                    />
                    <button
                      className={`icon-btn msg-composer-btn ${emojiOpen ? 'on' : ''}`}
                      type="button"
                      onClick={openEmoji}
                      aria-label="Emojis"
                      aria-pressed={emojiOpen}
                      title="Emojis"
                    >
                      <Icon name="smile" />
                    </button>
                    <button
                      className={`icon-btn msg-composer-btn ${stickerOpen ? 'on' : ''}`}
                      type="button"
                      onClick={openStickers}
                      aria-label="Figurinhas"
                      aria-pressed={stickerOpen}
                      title="Figurinhas"
                    >
                      <Icon name="sticker" />
                    </button>
                  </div>
                )}

                {text.trim() && !holding && !recording ? (
                  <button
                    className="btn primary send-btn"
                    type="submit"
                    aria-label="Enviar"
                    title="Enviar"
                  >
                    <Icon name="send" />
                  </button>
                ) : (
                  <button
                    className={`icon-btn mic-btn ${holding || recording ? 'on' : ''} ${
                      cancelHint ? 'cancel' : ''
                    }`}
                    type="button"
                    onPointerDown={beginHold}
                    onPointerMove={moveHold}
                    onPointerUp={endHold}
                    onPointerCancel={cancelHold}
                    aria-label="Segure para gravar áudio"
                    title="Segure para gravar"
                  >
                    <Icon name="mic" />
                  </button>
                )}
              </form>
            </>
          ) : (
            <div className="nochat">
              <div>
                <h3>Suas conversas</h3>
                <p className="muted">Escolha uma conversa para começar.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {wallOpen && chat ? (
        <div className="wall-layer">
          <button
            className="sheet-scrim"
            type="button"
            aria-label="Fechar papel de parede"
            onClick={() => setWallOpen(false)}
          />
          <div className="wall-panel" role="dialog" aria-label="Papel de parede">
            <header>
              <b>Papel de parede</b>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setWallOpen(false)}
                aria-label="Fechar"
              >
                <Icon name="x" />
              </button>
            </header>
            <div className="wall-grid">
              <button
                type="button"
                className={`wall-chip ${!wall ? 'on' : ''}`}
                onClick={() => actions.setChatWallpaper(chat.with, null)}
              >
                <span className="wall-default" />
                <i>Padrão</i>
              </button>
              <button
                type="button"
                className={`wall-chip ${wall && typeof wall === 'object' ? 'on' : ''}`}
                onClick={() => wallInputRef.current?.click()}
                title="Escolher uma foto da galeria"
              >
                {wall && typeof wall === 'object' ? (
                  <span style={{ backgroundImage: `url('${wall.src}')` }} />
                ) : (
                  <span className="wall-gallery">
                    <Icon name="image" />
                  </span>
                )}
                <i>Galeria</i>
              </button>
              {WALLS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`wall-chip ${wall === item.id ? 'on' : ''}`}
                  onClick={() => actions.setChatWallpaper(chat.with, item.id)}
                >
                  <span
                    style={{ backgroundImage: `url('${art(item.id, 160, 220)}')` }}
                  />
                  <i>{item.label}</i>
                </button>
              ))}
            </div>
            <input
              ref={wallInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={pickWall}
            />
          </div>
        </div>
      ) : null}

      {menu ? (
        <div className="msg-menu-layer">
          <button
            className="sheet-scrim"
            type="button"
            aria-label="Fechar opções"
            onClick={() => setMenu(null)}
          />
          <div className="msg-menu" role="menu">
            <div className="msg-menu-head">
              <Avatar
                user={menu.message.me ? data.me : userOf(data, menu.chat.with)}
                size={30}
              />
              <span className="ell">{previewOf(menu.message)}</span>
            </div>
            {menu.message.text?.trim() ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  copyMessage(menu.message);
                  setMenu(null);
                }}
              >
                <Icon name="file" /> Copiar texto
              </button>
            ) : null}
            {['photo', 'video'].includes(menu.message.attachment?.kind) ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const attachment = menu.message.attachment;
                  setViewer({
                    src: attachment.src,
                    kind: attachment.kind,
                    name: attachment.name,
                  });
                  setMenu(null);
                }}
              >
                <Icon name="expand" /> Abrir mídia
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setForward(menu);
                setMenu(null);
              }}
            >
              <Icon name="forward" /> Encaminhar
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                actions.likeMessage(menu.chat.id, menu.index);
                setMenu(null);
              }}
            >
              <Icon name="heart" /> {menu.message.liked ? 'Remover reação' : 'Reagir com ❤️'}
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                actions.deleteMessage(menu.chat.id, menu.index);
                setMenu(null);
              }}
            >
              <Icon name="trash" /> Apagar mensagem
            </button>
            <button type="button" role="menuitem" onClick={() => setMenu(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {viewer ? <MediaViewer media={viewer} onClose={() => setViewer(null)} /> : null}

      {forward ? (
        <div className="forward-layer">
          <button
            className="sheet-scrim"
            type="button"
            aria-label="Fechar encaminhamento"
            onClick={() => setForward(null)}
          />
          <div className="forward-panel" role="dialog" aria-label="Encaminhar mensagem">
            <header>
              <b>Encaminhar para</b>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setForward(null)}
                aria-label="Fechar"
              >
                <Icon name="x" />
              </button>
            </header>
            <p className="forward-preview ell">{previewOf(forward.message)}</p>
            <div className="forward-list">
              {data.chats.map((item) => {
                const friend = userOf(data, item.with);
                return (
                  <button key={item.id} type="button" onClick={() => forwardTo(item)}>
                    <Avatar user={friend} size={40} />
                    <span className="grow">
                      <b className="ell">{friend.name}</b>
                      <span className="muted sm ell">@{friend.handle}</span>
                    </span>
                    <Icon name="forward" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {cameraOpen ? (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(blob, kind, name) => {
            setCameraOpen(false);
            actions.sendChatBlob(blob, kind, name);
          }}
        />
      ) : null}
    </>
  );
}
