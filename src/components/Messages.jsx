import { useEffect, useRef, useState } from 'react';
import { userOf } from '../lib/selectors';
import { hm } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { TagText } from './Brand';
import { Icon } from './Icon';

const EMOJIS = [
  '😀', '😂', '🥰', '😎', '🤔', '😅', '😭', '😡',
  '👍', '👏', '🙏', '💪', '❤️', '🔥', '🎉', '✨',
  '💜', '☕', '🎵', '🚀', '😍', '🤝', '👀', '💯',
];

const ATTACH_LABEL = {
  photo: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  file: 'Arquivo',
  post: 'Publicação compartilhada',
  story: 'Resposta ao story',
};

const fmtTime = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

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
    return <audio className="att-audio" src={attachment.src} controls />;
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
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const discardRef = useRef(false);
  const chat = data.chats.find((c) => c.id === ui.chat);
  const query = ui.chatQ.toLowerCase();
  const mutedChat = (ui.settings.mutedChats || []).includes(chat?.with);

  const list = data.chats
    .filter((c) => userOf(data, c.with).name.toLowerCase().includes(query))
    .sort(
      (a, b) => (b.msgs[b.msgs.length - 1]?.ts || 0) - (a.msgs[a.msgs.length - 1]?.ts || 0)
    );

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat?.id, chat?.msgs.length]);

  useEffect(
    () => () => {
      clearInterval(timerRef.current);
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    },
    []
  );

  const addEmoji = (emoji) => {
    setText((value) => value + emoji);
    setEmojiOpen(false);
    inputRef.current?.focus();
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
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      discardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearInterval(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setRecordSeconds(0);
        if (discardRef.current) {
          chunksRef.current = [];
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
    }
  };

  const stopAudio = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const cancelAudio = () => {
    discardRef.current = true;
    stopAudio();
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
                const person = userOf(data, c.with);
                const last = c.msgs[c.msgs.length - 1];
                return (
                  <button
                    className={`ci ${c.id === ui.chat ? 'on' : ''}`}
                    key={c.id}
                    onClick={() => actions.openChat(c.id)}
                  >
                    <Avatar user={person} size={46} />
                    <div className="grow">
                      <div className="t">
                        <b className="ell">{person.name}</b>
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
                <Avatar user={userOf(data, chat.with)} size={42} />
                <div className="grow">
                  <b className="ell" style={{ display: 'block' }}>
                    {userOf(data, chat.with).name}
                  </b>
                  <span className="muted sm">Conversa direta</span>
                </div>
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
              </div>

              <div id="msgBox" ref={boxRef}>
                <div className="dayline">Hoje</div>
                {chat.msgs.map((message, index) => (
                  <div
                    className={`msg-row ${message.me ? 'me' : 'them'}`}
                    key={index}
                  >
                    {!message.me ? (
                      <Avatar user={userOf(data, chat.with)} size={28} />
                    ) : null}
                    <div
                      className={`b ${message.me ? 'me' : 'them'} ${
                        message.liked ? 'liked' : ''
                      }`}
                      title="Toque duas vezes para reagir"
                      onDoubleClick={() => actions.likeMessage(chat.id, index)}
                    >
                      {message.text ? (
                        <p>
                          <TagText text={message.text} />
                        </p>
                      ) : null}
                      {message.attachment ? (
                        <Attachment attachment={message.attachment} />
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
                ))}
              </div>

              <form
                className="cform"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = text;
                  setText('');
                  setEmojiOpen(false);
                  setAttachOpen(false);
                  actions.sendMessage(value);
                }}
              >
                {attachOpen ? (
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
                ) : null}
                {emojiOpen ? (
                  <div className="emoji-pop" role="menu" aria-label="Emojis">
                    {EMOJIS.map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        onClick={() => addEmoji(emoji)}
                        aria-label={`Emoji ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
                <input
                  ref={mediaInputRef}
                  type="file"
                  accept="image/*,video/*"
                  hidden
                  onChange={pickMedia}
                />
                <input ref={fileInputRef} type="file" hidden onChange={pickFile} />
                <button
                  className="icon-btn"
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
                <button
                  className="icon-btn"
                  type="button"
                  onClick={() => {
                    setEmojiOpen((value) => !value);
                    setAttachOpen(false);
                  }}
                  aria-label="Emojis"
                  title="Emojis"
                >
                  <Icon name="smile" />
                </button>
                {recording ? (
                  <div className="recording-bar">
                    <span className="rec-dot" />
                    <b>{fmtTime(recordSeconds)}</b>
                    <span className="grow" />
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={stopAudio}
                      aria-label="Parar gravação"
                      title="Parar"
                    >
                      <Icon name="stop" />
                    </button>
                    <button className="btn ghost" type="button" onClick={cancelAudio}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className="in"
                      id="msgIn"
                      ref={inputRef}
                      type="text"
                      maxLength={500}
                      autoComplete="off"
                      placeholder="Escreva uma mensagem"
                      aria-label="Mensagem"
                      style={{ borderRadius: 999 }}
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                    />
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={startAudio}
                      aria-label="Gravar áudio"
                      title="Gravar áudio"
                    >
                      <Icon name="mic" />
                    </button>
                    <button
                      className="btn primary"
                      type="submit"
                      aria-label="Enviar"
                      style={{ width: 46, padding: 0 }}
                    >
                      <Icon name="send" />
                    </button>
                  </>
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
