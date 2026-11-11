import { useEffect, useRef, useState } from 'react';
import { art } from '../lib/art';
import { userOf } from '../lib/selectors';
import { hm } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { TagText } from './Brand';
import EmojiPicker from './EmojiPicker';
import { Icon } from './Icon';

const ATTACH_LABEL = {
  photo: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  file: 'Arquivo',
  post: 'Publicação compartilhada',
  story: 'Resposta ao story',
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

function Attachment({ attachment }) {
  if (attachment.kind === 'post') {
    return <PostAttachment attachment={attachment} />;
  }
  if (attachment.kind === 'story') {
    return <StoryAttachment attachment={attachment} />;
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
      <img
        className="att-img"
        src={attachment.src}
        alt={attachment.name || 'Foto'}
        loading="lazy"
      />
    );
  }
  if (attachment.kind === 'video') {
    return <video className="att-video" src={attachment.src} controls playsInline />;
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

function ChatMessage({ message, index, chat, author, onMenu }) {
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
          className={`b ${message.me ? 'me' : 'them'} ${message.liked ? 'liked' : ''}`}
          title="Segure para mais opções"
        >
          {message.text ? (
            <p>
              <TagText text={message.text} />
            </p>
          ) : null}
          {message.attachment ? <Attachment attachment={message.attachment} /> : null}
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

function CameraCapture({ onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const discardRef = useRef(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [facing, setFacing] = useState('user');

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
          });
        } catch {
          if (!cancelled) setError('Não foi possível acessar a câmera.');
          return;
        }
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setReady(true);
    };

    start();

    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

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
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob, 'photo', `camera-${Date.now()}.jpg`);
      },
      'image/jpeg',
      0.9
    );
  };

  const startRecording = () => {
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
        setRecording(false);
        setSeconds(0);
        if (discardRef.current) {
          chunksRef.current = [];
          return;
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'video/webm',
        });
        if (blob.size) {
          onCapture(blob, 'video', `camera-${Date.now()}.webm`);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      setError('Não foi possível gravar o vídeo.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const cancelRecording = () => {
    discardRef.current = true;
    stopRecording();
  };

  const flipCamera = async () => {
    if (recording) return;
    const next = facing === 'user' ? 'environment' : 'user';
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next },
        audio: true,
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: next },
        });
      } catch {
        setError('Não foi possível trocar a câmera.');
        return;
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    setFacing(next);
    setReady(true);
    setError('');
  };

  return (
    <div className="cam-overlay" role="dialog" aria-modal="true" aria-label="Câmera">
      <div className="cam-box">
        <video
          ref={videoRef}
          className="cam-video"
          muted
          playsInline
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
        />
        {!ready && !error ? <p className="muted sm">Abrindo câmera…</p> : null}
        {error ? <p className="cam-error">{error}</p> : null}
        {recording ? <span className="cam-rec">{fmtTime(seconds)}</span> : null}
        <div className="cam-actions">
          <button className="btn ghost" type="button" onClick={close}>
            Fechar
          </button>
          {recording ? (
            <>
              <button className="btn primary" type="button" onClick={stopRecording}>
                <Icon name="stop" /> Parar
              </button>
              <button className="btn ghost" type="button" onClick={cancelRecording}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                className="btn ghost"
                type="button"
                onClick={flipCamera}
                disabled={!ready}
              >
                <Icon name="camera" /> Virar
              </button>
              <button className="btn ghost" type="button" onClick={takePhoto} disabled={!ready}>
                Tirar foto
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={startRecording}
                disabled={!ready}
              >
                Gravar vídeo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Messages() {
  const { data, ui, actions } = useApp();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [headMenu, setHeadMenu] = useState(false);
  const [wallOpen, setWallOpen] = useState(false);
  const [menu, setMenu] = useState(null);
  const [recording, setRecording] = useState(false);
  const [holding, setHolding] = useState(false);
  const [cancelHint, setCancelHint] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const boxRef = useRef(null);
  const formRef = useRef(null);
  const inputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const discardRef = useRef(false);
  const canceledRef = useRef(false);
  const holdRef = useRef(null);
  const startedAtRef = useRef(0);
  const inputHoldRef = useRef(null);

  const chat = data.chats.find((c) => c.id === ui.chat);
  const person = chat ? userOf(data, chat.with) : null;
  const query = ui.chatQ.toLowerCase();
  const mutedChat = (ui.settings.mutedChats || []).includes(chat?.with);
  const wall = chat ? (ui.settings.chatWalls || {})[chat.with] : null;

  const list = data.chats
    .filter((c) => userOf(data, c.with).name.toLowerCase().includes(query))
    .sort(
      (a, b) => (b.msgs[b.msgs.length - 1]?.ts || 0) - (a.msgs[a.msgs.length - 1]?.ts || 0)
    );

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat?.id, chat?.msgs.length]);

  useEffect(() => {
    setHeadMenu(false);
    setWallOpen(false);
    setMenu(null);
    setEmojiOpen(false);
    setAttachOpen(false);
  }, [chat?.id]);

  useEffect(
    () => () => {
      clearInterval(timerRef.current);
      clearTimeout(inputHoldRef.current?.id);
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    },
    []
  );

  const insertEmoji = (emoji) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      input?.focus();
      const caret = start + emoji.length;
      try {
        input?.setSelectionRange(caret, caret);
      } catch {
        /* campo sem seleção */
      }
    });
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
    setAttachOpen(false);
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

  const wallStyle = wall
    ? {
        backgroundImage: `linear-gradient(180deg,rgba(10,7,24,.42),rgba(10,7,24,.6)),url('${art(
          wall,
          900,
          1400
        )}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined;

  const closePickers = () => {
    setEmojiOpen(false);
    setAttachOpen(false);
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
                    <Avatar user={item} size={46} />
                    <div className="grow">
                      <div className="t">
                        <b className="ell">
                          {item.name}
                          {muted ? <Icon name="volumeoff" className="ci-mute" /> : null}
                        </b>
                        <span>{last ? hm(last.ts) : ''}</span>
                      </div>
                      <div className="t">
                        <span className="pv ell" style={{ fontSize: 13, color: 'var(--muted)' }}>
                          {lastOf(c)}
                        </span>
                        {c.unread ? (
                          <span className="badge" style={{ margin: 0 }}>
                            {c.unread}
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
                <button className="icon-btn back" onClick={actions.backChat} aria-label="Voltar">
                  <Icon name="back" />
                </button>
                <button
                  type="button"
                  className="chead-user"
                  onClick={() => actions.openUser(chat.with)}
                  title={`Ver perfil de ${person.name}`}
                >
                  <Avatar user={person} size={42} />
                  <span>
                    <b className="ell">{person.name}</b>
                    <span className="muted sm">Conversa direta</span>
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
                className={wall ? 'has-wall' : ''}
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
                {emojiOpen ? (
                  <>
                    <button
                      className="pop-scrim"
                      type="button"
                      aria-label="Fechar emojis"
                      onClick={() => setEmojiOpen(false)}
                    />
                    <EmojiPicker
                      onPick={insertEmoji}
                      onClose={() => setEmojiOpen(false)}
                    />
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
                    />
                    <button
                      className={`icon-btn msg-composer-btn ${emojiOpen ? 'on' : ''}`}
                      type="button"
                      onClick={() => {
                        setEmojiOpen((value) => !value);
                        setAttachOpen(false);
                        inputRef.current?.focus();
                      }}
                      aria-label="Emojis"
                      aria-pressed={emojiOpen}
                      title="Emojis"
                    >
                      <Icon name="smile" />
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
