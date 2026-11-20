import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { fmt, hm } from '../lib/utils';
import { art } from '../lib/art';
import { mediaOf } from '../lib/media';
import * as remote from '../lib/remote';
import { MAX_OPTIONS } from '../lib/interactive';
import { Avatar, LiveAvatar } from './Avatar';
import EmojiPicker from './EmojiPicker';
import EmojiText from './EmojiText';
import AnimatedEmoji from './AnimatedEmoji';
import { REACTIONS, fxFor } from '../lib/reactionFx';
import Empty from './Empty';
import { Icon } from './Icon';
import { Verified } from './Brand';
import Post from './Post';
import Interactive from './Interactive';
import AudioPlayer from './AudioPlayer';
import PrivateAudio from './PrivateAudio';
import PrivateMedia from './PrivateMedia';
import VoiceRecorder from './VoiceRecorder';

const NAV = [
  ['publicacoes', 'Publicações', 'chat'],
  ['comunicados', 'Comunicados', 'mega'],
  ['galeria', 'Galeria', 'camera'],
  ['enquetes', 'Enquetes', 'chart'],
  ['eventos', 'Eventos', 'clock'],
  ['classificados', 'Classificados', 'tag'],
  ['membros', 'Membros', 'users'],
  ['admin', 'Administração', 'shield'],
];

function personOf(data, id) {
  if (id === 'me') return data.me;
  return data.users?.[id] || { id, name: String(id || '').slice(0, 8) };
}

// Barra de digitação da comunidade, no mesmo estilo da aba Mensagens.
function CommunityChatComposer({ community, canPost, replyTarget, onCancelReply, focusRef }) {
  const { ui, actions } = useApp();
  const [text, setText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const media = ui.draft?.media || [];
  const format = ui.draft?.format || 'classic';
  const options = ui.draft?.options || [];
  const isPoll = format === 'poll';

  function submit(event) {
    event.preventDefault();
    const filled = options.filter((option) => String(option || '').trim()).length;
    if (isPoll && filled < 2) {
      actions.notify?.('Escreva pelo menos duas alternativas.');
      return;
    }
    if (!text.trim() && !media.length && !isPoll) return;
    if (replyTarget) {
      // Resposta encadeada: vira comentário do posts original, com parent_id.
      actions.addComment(replyTarget.postId, text, replyTarget.commentId || null);
      onCancelReply?.();
    } else {
      actions.publish(text, community.id);
      actions.resetDraft();
    }
    setText('');
    setPickerOpen(false);
  }

  if (!canPost) {
    return (
      <div className="card comm-chat-locked">
        <Icon name="lock" />
        <span>Entre na comunidade para participar das conversas.</span>
      </div>
    );
  }

  return (
    <form className="comm-chat-composer" onSubmit={submit}>
      {replyTarget ? (
        <div className="comm-reply-banner">
          <Icon name="comment" />
          <span>
            Respondendo a <b>{replyTarget.name}</b>
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Cancelar resposta">
            <Icon name="x" />
          </button>
        </div>
      ) : null}
      {pickerOpen ? (
        <>
          <button
            className="pop-scrim"
            type="button"
            aria-label="Fechar emojis"
            onClick={() => setPickerOpen(false)}
          />
          <div className="comm-chat-picker">
            <EmojiPicker
              embedded
              onPick={(emoji) => {
                setText((value) => value + emoji);
                setPickerOpen(false);
                inputRef.current?.focus();
              }}
              onClose={() => setPickerOpen(false)}
            />
          </div>
        </>
      ) : null}
      <div className="comm-post-formats" role="tablist" aria-label="Tipo de publicação">
        <button
          type="button"
          role="tab"
          aria-selected={format === 'classic'}
          className={format === 'classic' ? 'on' : ''}
          onClick={() => actions.setDraftFormat('classic')}
        >
          <Icon name="chat" /> Mensagem
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isPoll}
          className={isPoll ? 'on' : ''}
          onClick={() => actions.setDraftFormat('poll')}
        >
          <Icon name="chart" /> Enquete
        </button>
      </div>
      {isPoll ? (
        <div className="comm-post-options">
          {options.map((option, index) => (
            <div className="comm-post-option" key={index}>
              <span className="opt-num">{index + 1}</span>
              <input
                className="in"
                maxLength={90}
                placeholder={`Alternativa ${index + 1}`}
                value={option || ''}
                onChange={(event) => actions.setDraftOption(index, event.target.value)}
              />
              <button
                type="button"
                className="icon-btn sm"
                aria-label={`Remover alternativa ${index + 1}`}
                disabled={options.length <= 2}
                onClick={() => actions.removeDraftOption(index)}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
          {options.length < MAX_OPTIONS ? (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => actions.addDraftOption()}
            >
              <Icon name="plus" /> Alternativa
            </button>
          ) : null}
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files?.length) actions.attachMedia(event.target.files);
          event.target.value = '';
        }}
      />
      {media.length ? (
        <div className="comm-chat-media">
          {media.map((item, index) => (
            <div className="comm-chat-thumb" key={index}>
              {item.kind === 'video' ? (
                <video src={item.src} muted preload="metadata" />
              ) : (
                <img src={item.src} alt="Mídia selecionada" />
              )}
              <button
                type="button"
                aria-label="Remover mídia"
                onClick={() => actions.removeDraftMedia(index)}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className={`comm-chat-bar${voiceActive ? ' recording' : ''}`}>
        <button
          className={`icon-btn ${pickerOpen ? 'on' : ''}`}
          type="button"
          aria-label="Emojis"
          title="Emojis"
          onClick={() => setPickerOpen((open) => !open)}
        >
          <Icon name="smile" />
        </button>
        <textarea
          ref={(node) => {
            inputRef.current = node;
            if (focusRef) focusRef.current = node;
          }}
          className="comm-chat-input"
          rows={1}
          maxLength={600}
          placeholder={`Escreva para ${community.name}…`}
          aria-label="Escrever na comunidade"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {text.trim() || media.length || isPoll ? (
          <button className="icon-btn send" type="submit" aria-label="Enviar" title="Enviar">
            <Icon name="send" />
          </button>
        ) : null}
        <VoiceRecorder
          compact
          onSend={(blob, meta) => actions.sendCommunityAudio(community.id, blob, meta)}
          onError={(message) => actions.notify?.(message)}
          onActiveChange={setVoiceActive}
        />
        <button
          className="icon-btn"
          type="button"
          aria-label="Anexar fotos ou vídeos"
          title="Anexar fotos ou vídeos"
          onClick={() => fileRef.current?.click()}
        >
          <Icon name="paperclip" />
        </button>
      </div>
    </form>
  );
}

// Reações do chat da comunidade com o mesmo conjunto e animações do feed.
function CommunityReactions({ post }) {
  const { ui, actions } = useApp();
  const [open, setOpen] = useState(false);
  const choices = ui.settings?.reactions?.length ? ui.settings.reactions : REACTIONS;
  const total = post.likes || 0;

  const react = (emoji) => {
    actions.reactPost(post.id, emoji);
    setOpen(false);
  };

  return (
    <span className="comm-reactions">
      <span className="comm-reactions-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <button
          type="button"
          className={`comm-react-btn${post.myReaction ? ' on' : ''}`}
          onClick={() => react(post.myReaction || '❤️')}
          aria-label={post.myReaction ? 'Remover reação' : 'Reagir'}
          title="Reagir"
        >
          {post.myReaction ? (
            <AnimatedEmoji emoji={post.myReaction} size={17} />
          ) : (
            <Icon name="heart" />
          )}
          <span>{total}</span>
        </button>
        <button
          type="button"
          className="comm-react-more"
          onClick={() => setOpen((value) => !value)}
          aria-label="Escolher reação"
          title="Mais reações"
          aria-expanded={open}
        >
          <Icon name="plus" />
        </button>
        {open ? (
          <span className="comm-react-picker" role="menu" aria-label="Escolher reação">
            {choices.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`fx-${fxFor(emoji)}${post.myReaction === emoji ? ' on' : ''}`}
                onClick={() => react(emoji)}
                aria-label={`Reagir com ${emoji}`}
              >
                <AnimatedEmoji emoji={emoji} size={22} />
              </button>
            ))}
            <button type="button" className="comm-react-custom" onClick={() => { setOpen(false); actions.openReactions?.(); }} aria-label="Personalizar reações">
              <Icon name="settings" />
            </button>
          </span>
        ) : null}
      </span>
    </span>
  );
}

// Conversa da comunidade: mensagens em balões, como um chat amplo.
function CommunityChat({ posts, canPost, community }) {
  const { data, actions } = useApp();
  const boxRef = useRef(null);
  const prevCount = useRef(posts.length);
  const [replyTarget, setReplyTarget] = useState(null);
  const composerFocusRef = useRef(null);
  const replyTo = (target) => {
    setReplyTarget(target);
    window.setTimeout(() => {
      const field = composerFocusRef.current;
      if (!field) return;
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field.focus({ preventScroll: true });
    }, 60);
  };
  // data.posts vem do mais novo para o mais antigo; no chat vai do mais antigo
  // para o mais novo, como nas conversas.
  const messages = useMemo(() => [...posts].reverse(), [posts]);

  useEffect(() => {
    if (posts.length > prevCount.current) {
      boxRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
    prevCount.current = posts.length;
  }, [posts.length]);

  return (
    <div className="comm-chat">
      <div className="comm-chat-list" ref={boxRef}>
        {messages.map((post) => {
          const person = personOf(data, post.by);
          const mine = post.by === 'me';
          const allMedia = mediaOf(post).filter((item) => item.src);
          const interactive = post.interactive;
          const imageVote = interactive?.format === 'imageVote';
          const items = imageVote
            ? []
            : allMedia.filter((item) => ['photo', 'video'].includes(item.kind));
          const audios = allMedia.filter((item) => item.kind === 'audio');
          return (
            <div className={`comm-chat-msg${mine ? ' me' : ''}`} key={post.id}>
              {!mine ? <Avatar user={person} size={32} /> : null}
              <div className="comm-chat-body">
                <div className="comm-chat-head">
                  <b>{person.name}</b> <time>{hm(post.ts)}</time>
                </div>
                <div className="comm-chat-bubble">
                  {post.text ? <p><EmojiText text={post.text} size={19} /></p> : null}
                  {items.map((item, index) =>
                    item.storageBucket === 'community-private' && item.storagePath ? (
                      <PrivateMedia
                        key={index}
                        path={item.storagePath}
                        bucket={item.storageBucket}
                        kind={item.kind === 'video' ? 'video' : 'photo'}
                        alt="Mídia da comunidade"
                      />
                    ) : item.kind === 'video' ? (
                      <video
                        key={index}
                        src={item.src}
                        controls
                        preload="metadata"
                        onClick={(event) => {
                          event.stopPropagation();
                          actions.openClips(post.id);
                        }}
                      />
                    ) : (
                      <img key={index} src={item.src} alt="Foto da comunidade" loading="lazy" />
                    )
                  )}
                  {audios.map((item, index) =>
                    item.storageBucket === 'community-private' && item.storagePath ? (
                      <PrivateAudio
                        key={`a${index}`}
                        path={item.storagePath}
                        bucket={item.storageBucket}
                        duration={item.duration || item.dur}
                        waves={item.waves}
                        sender={person.name}
                      />
                    ) : (
                      <AudioPlayer
                        key={`a${index}`}
                        src={item.src}
                        duration={item.duration || item.dur}
                        waves={item.waves}
                        sender={person.name}
                      />
                    )
                  )}
                  {interactive ? <Interactive post={post} /> : null}
                  <div className="comm-chat-actions">
                    <CommunityReactions post={post} />
                    {mine && !community.private ? (
                      <button
                        type="button"
                        onClick={() => actions.shareCommunityPostToFeed(post.id)}
                        aria-label="Compartilhar no feed"
                        title="Compartilhar no feed"
                      >
                        <Icon name="share" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => replyTo({ postId: post.id, name: person.name })}
                      aria-label="Responder"
                      title="Responder"
                    >
                      <Icon name="comment" />
                    </button>
                  </div>
                  {(post.comments || []).length ? (
                    <div className="comm-chat-comments">
                      {post.comments.map((comment) => {
                        const commentAuthor = personOf(data, comment.by);
                        return (
                          <div className={`comm-chat-comment${comment.parentId ? ' reply' : ''}`} key={comment.id}>
                            <b>{commentAuthor.name}</b>
                            <EmojiText text={comment.text} size={14} />
                            <button
                              type="button"
                              onClick={() =>
                                replyTo({
                                  postId: post.id,
                                  commentId: comment.id,
                                  name: commentAuthor.name,
                                })
                              }
                              aria-label={`Responder ${commentAuthor.name}`}
                            >
                              <Icon name="comment" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {!posts.length ? (
          <Empty
            title="Nenhuma mensagem ainda"
            text="Seja a primeira pessoa a escrever nesta comunidade."
          />
        ) : null}
      </div>
      <CommunityChatComposer
        community={community}
        canPost={canPost}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        focusRef={composerFocusRef}
      />
    </div>
  );
}

export default function CommunitySpace({ community, onAdmin }) {
  const { data, ui, actions } = useApp();
  const [tab, setTab] = useState('publicacoes');
  const extras = data.commExtras || { events: [], rsvps: [], classifieds: [] };

  const owner = community.owner === 'me';
  const mod = (community.mods || []).includes('me');
  const canManage = owner || mod;
  const uid = data.me?.id || 'me';

  const posts = useMemo(
    () => (data.posts || []).filter((p) => p.communityId === community.id),
    [data.posts, community.id]
  );
  // Galeria = somente mídias publicadas dentro das publicações da comunidade.
  const gallery = useMemo(
    () =>
      posts.flatMap((post) =>
        mediaOf(post)
          .filter((item) => item.src && ['photo', 'video', 'audio', 'file'].includes(item.kind))
          .map((item, index) => ({
            id: `${post.id}-${index}`,
            kind: item.kind,
            src: item.src,
            title: String(post.text || '').trim().slice(0, 60) ||
              (item.kind === 'audio' ? 'Áudio' : item.kind === 'video' ? 'Vídeo' : 'Foto'),
            author_id: post.by,
            post_id: post.id,
            ts: post.ts,
            storagePath: item.storagePath,
            storageBucket: item.storageBucket,
          }))
      ),
    [posts]
  );
  const announcements = (extras.announcements || []).filter(
    (a) => a.community_id === community.id
  );
  const events = (extras.events || []).filter((e) => e.community_id === community.id);
  const classifieds = (extras.classifieds || []).filter((c) => c.community_id === community.id);
  const rsvps = extras.rsvps || [];
  const topics = [...(community.topics || [])].sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned)
  );
  const members = community.members || [];

  const [galleryFilter, setGalleryFilter] = useState('todos');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annPriority, setAnnPriority] = useState(0);
  const [annPinned, setAnnPinned] = useState(false);
  const [annImage, setAnnImage] = useState('');
  const [annEditingId, setAnnEditingId] = useState(null);
  const [topic, setTopic] = useState('');
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [clTitle, setClTitle] = useState('');
  const [clCat, setClCat] = useState('venda');
  const [clFilter, setClFilter] = useState('todos');
  const [clDesc, setClDesc] = useState('');
  const [clPrice, setClPrice] = useState('');
  const [clContact, setClContact] = useState('');
  const [clImages, setClImages] = useState([]);
  const [clUploading, setClUploading] = useState(false);
  const [clLightbox, setClLightbox] = useState(null);
  const clFileRef = useRef(null);

  const pickClassifiedImages = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    const items = files
      .filter((file) => file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024)
      .slice(0, Math.max(0, 6 - clImages.length))
      .map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url: URL.createObjectURL(file),
      }));
    if (items.length < files.length) {
      actions.notify?.('Use até 6 imagens de no máximo 10 MB cada.');
    }
    setClImages((current) => [...current, ...items].slice(0, 6));
  };

  const removeClassifiedImage = (id) => {
    setClImages((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.url) URL.revokeObjectURL(item.url);
      return current.filter((entry) => entry.id !== id);
    });
  };

  const uploadClassifiedImages = async () => {
    const uidValue = data.me?.id || uid;
    const uploaded = [];
    for (const item of clImages) {
      if (community.private) {
        const result = await remote.uploadPrivateMedia(item.file, community.id, uidValue);
        if (result) {
          uploaded.push({ storagePath: result.path, storageBucket: result.bucket });
        }
      } else {
        const url = await remote.uploadMedia(item.file, uidValue);
        if (url) uploaded.push({ src: url });
      }
    }
    clImages.forEach((item) => {
      if (item.url) URL.revokeObjectURL(item.url);
    });
    setClImages([]);
    return uploaded;
  };

  // Comunidades abertas permitem que qualquer pessoa participe.
  const canPost = !community.private || community.joined || canManage;
  const backToFluxo = () => actions.go('conexoes');
  const navItems = NAV.filter(([key]) => key !== 'admin' || canManage);

  return (
    <div className="comm-page">
      <header className="comm-hero">
        <div
          className="comm-cover"
          style={{
            backgroundImage: `url('${community.coverUrl || art(community.id, 1200, 400)}')`,
          }}
        >
          <button className="btn ghost comm-back" onClick={backToFluxo}>
            <Icon name="back" /> Voltar ao Fluxo
          </button>
        </div>
        <div className="comm-hero-body">
          <div className="comm-icon">
            {community.iconUrl ? (
              <img src={community.iconUrl} alt="" />
            ) : (
              <Avatar user={personOf(data, community.owner)} size={72} />
            )}
          </div>
          <div className="comm-hero-info">
            <h1>
              {community.name} <Verified user={personOf(data, community.owner)} />
            </h1>
            <p className="muted">{community.desc || 'Comunidade no Fluxo'}</p>
            <div className="comm-pills">
              <span className="pill">
                {community.private ? <Icon name="lock" /> : <Icon name="globe" />}{' '}
                {community.private ? 'Privada' : 'Pública'}
              </span>
              <span className="pill">
                <Icon name="users" /> {fmt(members.length)} participantes
              </span>
              <span className="pill">
                <Icon name="image" /> {gallery.length} mídias
              </span>
            </div>
          </div>
          <div className="comm-hero-actions">
            <button
              className={`btn ${community.joined ? 'ghost' : 'primary'}`}
              onClick={() => actions.toggleComm(community.id)}
            >
              {community.joined
                ? 'Sair da comunidade'
                : community.private
                  ? 'Solicitar entrada'
                  : 'Entrar na comunidade'}
            </button>
            {canManage ? (
              <button className="btn tonal" onClick={() => setTab('admin')}>
                <Icon name="shield" /> Administração
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="comm-layout">
        <nav className="comm-nav" aria-label="Navegação da comunidade">
          <div className="comm-nav-title">
            <Icon name="spark" /> Espaço da comunidade
          </div>
          {navItems.map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? 'on' : ''}
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
            >
              <Icon name={icon} /> <span>{label}</span>
            </button>
          ))}
        </nav>

        <main className="comm-main">
          {tab === 'publicacoes' ? (
            <div className="comm-section comm-chat-section">
              <h2 className="h2">Publicações</h2>
              <CommunityChat posts={posts} canPost={canPost} community={community} />
            </div>
          ) : null}

          {tab === 'comunicados' ? (
            <div className="comm-section">
              <h2 className="h2">Comunicados</h2>
              {canManage ? (
                <form
                  className="comm-form comm-ann-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!annTitle.trim()) return;
                    const fields = {
                      title: annTitle,
                      body: annBody,
                      priority: annPriority,
                      pinned: annPinned,
                      imageUrl: annImage.trim() || null,
                    };
                    if (annEditingId) actions.updateCommunityAnnouncement(annEditingId, fields);
                    else actions.addCommunityAnnouncement(community.id, fields);
                    setAnnTitle('');
                    setAnnBody('');
                    setAnnPriority(0);
                    setAnnPinned(false);
                    setAnnImage('');
                    setAnnEditingId(null);
                  }}
                >
                  <input
                    className="in"
                    placeholder="Título do comunicado"
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                  />
                  <textarea
                    className="in"
                    rows={3}
                    placeholder="Mensagem (opcional)"
                    value={annBody}
                    onChange={(e) => setAnnBody(e.target.value)}
                  />
                  <div className="comm-ann-row">
                    <label>
                      Prioridade
                      <input
                        className="in"
                        type="number"
                        min={0}
                        max={10}
                        value={annPriority}
                        onChange={(e) => setAnnPriority(Number(e.target.value))}
                      />
                    </label>
                    <label className="comm-ann-check">
                      <input
                        type="checkbox"
                        checked={annPinned}
                        onChange={(e) => setAnnPinned(e.target.checked)}
                      />
                      Fixar no topo
                    </label>
                  </div>
                  <input
                    className="in"
                    placeholder="URL da imagem (opcional)"
                    value={annImage}
                    onChange={(e) => setAnnImage(e.target.value)}
                  />
                  <button className="btn primary" type="submit">
                    <Icon name={annEditingId ? 'check' : 'plus'} />
                    {annEditingId ? 'Salvar' : 'Publicar comunicado'}
                  </button>
                  {annEditingId ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setAnnEditingId(null);
                        setAnnTitle('');
                        setAnnBody('');
                      }}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </form>
              ) : null}
              {announcements.length ? (
                <div className="comm-ann-list">
                  {announcements.map((item) => (
                    <article
                      key={item.id}
                      className={`comm-ann${item.pinned ? ' pinned' : ''}`}
                      onClick={() => actions.markAnnouncementRead(item.id)}
                    >
                      <div className="comm-ann-head">
                        {item.pinned ? (
                          <span className="pill acc"><Icon name="mega" /> Fixado</span>
                        ) : null}
                        {Number(item.priority) > 0 ? (
                          <span className="pill">Prioridade {item.priority}</span>
                        ) : null}
                        <time>{hm(item.created_at ? Date.parse(item.created_at) : item.ts)}</time>
                      </div>
                      <h3>{item.title}</h3>
                      {item.body ? <p>{item.body}</p> : null}
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.title} loading="lazy" />
                      ) : null}
                      <div className="comm-ann-foot">
                        <span>Por {personOf(data, item.author_id).name}</span>
                        <span>{item.readCount || 0} visualizações</span>
                        {canManage ? (
                          <>
                            <button
                              type="button"
                              className="icon-btn"
                              title={item.pinned ? 'Desafixar' : 'Fixar'}
                              onClick={() =>
                                actions.updateCommunityAnnouncement(item.id, { pinned: !item.pinned })
                              }
                            >
                              <Icon name="mega" />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Editar"
                              onClick={() => {
                                setAnnEditingId(item.id);
                                setAnnTitle(item.title);
                                setAnnBody(item.body || '');
                                setAnnPriority(item.priority || 0);
                                setAnnPinned(!!item.pinned);
                                setAnnImage(item.image_url || '');
                              }}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              type="button"
                              className="icon-btn danger"
                              title="Remover"
                              onClick={() => actions.removeCommunityAnnouncement(item.id)}
                            >
                              <Icon name="trash" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Sem comunicados"
                  text="Avisos importantes da administração aparecem aqui."
                />
              )}
              <h3 className="h3">Avisos rápidos</h3>
              {topics.length ? (
                topics.map((t) => (
                  <div key={t.id} className="comm-topic">
                    <div className="grow">
                      {t.pinned ? (
                        <span className="pill acc"><Icon name="mega" /> Fixado</span>
                      ) : null}
                      <b>{t.title}</b>
                      <div className="muted sm">{personOf(data, t.by).name}</div>
                    </div>
                    {canManage ? (
                      <>
                        <button
                          className="icon-btn"
                          title={t.pinned ? 'Desafixar' : 'Fixar'}
                          onClick={() => actions.pinCommunityTopic(community.id, t.id)}
                        >
                          <Icon name="mega" />
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Remover"
                          onClick={() => actions.deleteTopic(community.id, t.id)}
                        >
                          <Icon name="trash" />
                        </button>
                      </>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="muted sm">Nenhum aviso rápido.</p>
              )}
              {canManage ? (
                <form
                  className="comm-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!topic.trim()) return;
                    actions.addTopic(community.id, topic.trim());
                    setTopic('');
                  }}
                >
                  <input
                    className="in"
                    placeholder="Novo aviso rápido"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                  <button className="btn primary" type="submit">
                    <Icon name="plus" /> Publicar
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {tab === 'galeria' ? (
            <div className="comm-section">
              <h2 className="h2">Galeria da comunidade</h2>
              <p className="muted sm">
                Fotos, vídeos, áudios e arquivos publicados pela comunidade aparecem aqui.
              </p>
              <div className="comm-gallery-filters" role="tablist" aria-label="Categorias da galeria">
                {[
                  ['todos', 'Todos'],
                  ['photo', 'Fotos'],
                  ['video', 'Vídeos'],
                  ['audio', 'Áudios'],
                  ['file', 'Arquivos'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={galleryFilter === key}
                    className={galleryFilter === key ? 'on' : ''}
                    onClick={() => setGalleryFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {gallery.filter((g) => galleryFilter === 'todos' || g.kind === galleryFilter).length ? (
                <div className="comm-gallery">
                  {gallery
                    .filter((g) => galleryFilter === 'todos' || g.kind === galleryFilter)
                    .map((g) => (
                    <div key={g.id} className="comm-gallery-item">
                      {g.storageBucket === 'community-private' && g.storagePath &&
                      ['photo', 'video'].includes(g.kind) ? (
                        <PrivateMedia
                          path={g.storagePath}
                          bucket={g.storageBucket}
                          kind={g.kind === 'video' ? 'video' : 'photo'}
                          alt={g.title || 'Mídia da comunidade'}
                        />
                      ) : g.kind === 'video' ? (
                        <video
                          src={g.src}
                          controls
                          preload="metadata"
                          onClick={(event) => {
                            event.stopPropagation();
                            actions.openClips(g.post_id);
                          }}
                        />
                      ) : g.kind === 'audio' ? (
                        g.storageBucket === 'community-private' && g.storagePath ? (
                          <PrivateAudio
                            path={g.storagePath}
                            bucket={g.storageBucket}
                            waves={g.waves}
                            sender={personOf(data, g.author_id).name}
                          />
                        ) : (
                          <AudioPlayer
                            src={g.src}
                            waves={g.waves}
                            sender={personOf(data, g.author_id).name}
                          />
                        )
                      ) : g.kind === 'file' ? (
                        <div className="comm-gallery-file">
                          <Icon name="file" />
                          <span className="ell">{g.title || 'Arquivo'}</span>
                        </div>
                      ) : (
                        <img src={g.src} alt={g.title || 'Mídia'} loading="lazy" />
                      )}
                      <div className="comm-gallery-meta">
                        <b className="ell">{g.title || 'Sem título'}</b>
                        <span className="muted sm">
                          {personOf(data, g.author_id).name}
                        </span>
                        <button
                          type="button"
                          className="comm-gallery-locate"
                          onClick={() => actions.openPost(g.post_id)}
                          title="Localizar publicação original"
                        >
                          <Icon name="link" /> Ver original
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Galeria vazia"
                  text="Publique fotos, vídeos ou áudios para preencher a galeria."
                />
              )}
            </div>
          ) : null}

          {tab === 'enquetes' ? (
            <div className="comm-section">
              <h2 className="h2">Enquetes</h2>
              {posts.filter(
                (p) =>
                  p.interactive?.format === 'poll' ||
                  p.interactive?.format === 'imageVote'
              ).length ? (
                <div className="comm-posts">
                  {posts
                    .filter(
                      (p) =>
                        p.interactive?.format === 'poll' ||
                        p.interactive?.format === 'imageVote'
                    )
                    .map((p) => (
                      <Post key={p.id} post={p} />
                    ))}
                </div>
              ) : (
                <Empty
                  title="Nenhuma enquete"
                  text="Crie enquetes nas publicações da comunidade."
                />
              )}
            </div>
          ) : null}

          {tab === 'eventos' ? (
            <div className="comm-section">
              <h2 className="h2">Eventos</h2>
              {canPost ? (
                <form
                  className="comm-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!evTitle.trim() || !evDate) return;
                    actions.addCommunityEventEntry({
                      community_id: community.id,
                      title: evTitle.trim(),
                      starts_at: new Date(evDate).toISOString(),
                      description: evDesc.trim(),
                    });
                    setEvTitle('');
                    setEvDate('');
                    setEvDesc('');
                  }}
                >
                  <input
                    className="in"
                    placeholder="Nome do evento"
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                  />
                  <input
                    className="in"
                    type="datetime-local"
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                  />
                  <input
                    className="in"
                    placeholder="Descrição / local"
                    value={evDesc}
                    onChange={(e) => setEvDesc(e.target.value)}
                  />
                  <button className="btn primary" type="submit">
                    <Icon name="plus" /> Criar evento
                  </button>
                </form>
              ) : null}
              {events.length ? (
                events.map((ev) => {
                  const going = rsvps.some(
                    (r) => r.event_id === ev.id && r.user_id === uid
                  );
                  const count = rsvps.filter((r) => r.event_id === ev.id).length;
                  return (
                    <div key={ev.id} className="comm-event">
                      <div className="comm-event-date">
                        <b>{new Date(ev.starts_at).getDate()}</b>
                        <span>
                          {new Date(ev.starts_at).toLocaleString('pt-BR', {
                            month: 'short',
                          })}
                        </span>
                      </div>
                      <div className="grow">
                        <b>{ev.title}</b>
                        <div className="muted sm">
                          {hm(ev.starts_at)} · {count} confirmado(s)
                        </div>
                        {ev.description ? (
                          <p className="muted sm">{ev.description}</p>
                        ) : null}
                      </div>
                      <button
                        className={`btn ${going ? 'ghost' : 'primary'}`}
                        onClick={() => actions.toggleCommunityRsvpEntry(ev.id)}
                      >
                        {going ? 'Cancelar' : 'Participar'}
                      </button>
                      {(ev.created_by === uid || canManage) ? (
                        <button
                          className="icon-btn danger"
                          onClick={() =>
                            actions.removeCommunityEventEntry(ev.id)
                          }
                        >
                          <Icon name="trash" />
                        </button>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <Empty
                  title="Nenhum evento"
                  text="Crie eventos e permita confirmação de presença."
                />
              )}
            </div>
          ) : null}

          {tab === 'classificados' ? (
            <div className="comm-section">
              <h2 className="h2">Classificados</h2>
              <div className="comm-gallery-filters" role="tablist" aria-label="Filtros de classificados">
                {[
                  ['todos', 'Todos'],
                  ['venda', 'Venda'],
                  ['servico', 'Serviços'],
                  ['trabalho', 'Trabalho'],
                  ['parceria', 'Parcerias'],
                  ['outros', 'Outros'],
                  ['active', 'Disponíveis'],
                  ['sold', 'Vendidos'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={clFilter === key}
                    className={clFilter === key ? 'on' : ''}
                    onClick={() => setClFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {canPost ? (
                <form
                  className="comm-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!clTitle.trim() || clUploading) return;
                    setClUploading(true);
                    try {
                      const images = await uploadClassifiedImages();
                      actions.addCommunityClassifiedEntry({
                        community_id: community.id,
                        title: clTitle.trim(),
                        category: clCat,
                        description: clDesc.trim(),
                        price: clPrice.trim(),
                        contact: clContact.trim(),
                        images,
                      });
                      setClTitle('');
                      setClDesc('');
                      setClPrice('');
                      setClContact('');
                    } catch {
                      actions.notify?.('Não foi possível enviar as imagens.');
                    } finally {
                      setClUploading(false);
                    }
                  }}
                >
                  <input
                    className="in"
                    placeholder="Título do anúncio"
                    value={clTitle}
                    onChange={(e) => setClTitle(e.target.value)}
                  />
                  <select
                    className="in"
                    value={clCat}
                    onChange={(e) => setClCat(e.target.value)}
                  >
                    <option value="venda">Venda</option>
                    <option value="servico">Serviço</option>
                    <option value="trabalho">Trabalho</option>
                    <option value="parceria">Parceria</option>
                    <option value="outros">Outros</option>
                  </select>
                  <input
                    className="in"
                    placeholder="Descrição"
                    value={clDesc}
                    onChange={(e) => setClDesc(e.target.value)}
                  />
                  <input
                    className="in"
                    placeholder="Preço"
                    value={clPrice}
                    onChange={(e) => setClPrice(e.target.value)}
                  />
                  <input
                    className="in"
                    placeholder="Contato"
                    value={clContact}
                    onChange={(e) => setClContact(e.target.value)}
                  />
                  <input
                    ref={clFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={pickClassifiedImages}
                  />
                  {clImages.length ? (
                    <div className="cl-images">
                      {clImages.map((item) => (
                        <span className="cl-image" key={item.id}>
                          <img src={item.url} alt="Foto do anúncio" />
                          <button type="button" onClick={() => removeClassifiedImage(item.id)} aria-label="Remover foto">
                            <Icon name="x" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" className="btn tonal sm" onClick={() => clFileRef.current?.click()}>
                    <Icon name="camera" /> Adicionar fotos ({clImages.length}/6)
                  </button>
                  <button className="btn primary" type="submit" disabled={clUploading}>
                    <Icon name="plus" /> {clUploading ? 'Enviando fotos…' : 'Publicar anúncio'}
                  </button>
                </form>
              ) : null}
              {classifieds.filter((c) =>
                ['active', 'sold'].includes(clFilter)
                  ? (c.status || 'active') === clFilter
                  : clFilter === 'todos' || c.category === clFilter
              ).length ? (
                classifieds
                  .filter((c) =>
                    ['active', 'sold'].includes(clFilter)
                      ? (c.status || 'active') === clFilter
                      : clFilter === 'todos' || c.category === clFilter
                  )
                  .map((c) => (
                  <div key={c.id} className={`comm-classified${c.status === 'sold' ? ' sold' : ''}`}>
                    <div className="grow">
                      {Array.isArray(c.images) && c.images.length ? (
                        <div className="cl-card-images">
                          {c.images.slice(0, 4).map((image, index) => {
                            const src = typeof image === 'string' ? image : image?.src;
                            if (image?.storagePath && image?.storageBucket) {
                              return (
                                <PrivateMedia
                                  key={index}
                                  path={image.storagePath}
                                  bucket={image.storageBucket}
                                  kind="photo"
                                  className="cl-card-image"
                                  alt={`Foto de ${c.title}`}
                                />
                              );
                            }
                            return src ? (
                              <button
                                key={index}
                                type="button"
                                className="cl-card-image-btn"
                                onClick={() => setClLightbox({ images: c.images, index })}
                                aria-label={`Ampliar foto ${index + 1}`}
                              >
                                <img className="cl-card-image" src={src} alt={`Foto de ${c.title}`} />
                              </button>
                            ) : null;
                          })}
                          {c.images.length > 4 ? (
                            <span className="cl-card-more">+{c.images.length - 4}</span>
                          ) : null}
                        </div>
                      ) : null}
                      <span className="pill">{c.category}</span>
                      {c.status === 'sold' ? <span className="pill hot">Vendido</span> : null}
                      <b>{c.title}</b>
                      {c.description ? (
                        <p className="muted sm">{c.description}</p>
                      ) : null}
                      <div className="muted sm">
                        {c.price ? `Preço: ${c.price}` : ''}{' '}
                        {c.contact ? `· ${c.contact}` : ''}
                      </div>
                    </div>
                    <div className="comm-classified-actions">
                    {c.contact ? (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Copiar contato"
                        onClick={() => {
                          navigator.clipboard?.writeText(String(c.contact)).then(
                            () => actions.notify?.('Contato copiado'),
                            () => actions.notify?.('Não foi possível copiar')
                          );
                        }}
                      >
                        <Icon name="link" />
                      </button>
                    ) : null}
                    {c.author_id !== uid ? (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Denunciar anúncio"
                        onClick={() => {
                          const reason = window.prompt('Motivo da denúncia', '');
                          if (reason !== null) actions.reportCommunityClassified(c.id, reason);
                        }}
                      >
                        <Icon name="shield" />
                      </button>
                    ) : null}
                    {(c.author_id === uid || canManage) ? (
                      <>
                        <button
                          type="button"
                          className="icon-btn"
                          title={c.status === 'sold' ? 'Marcar como disponível' : 'Marcar como vendido'}
                          onClick={() =>
                            actions.editCommunityClassifiedEntry(c.id, {
                              status: c.status === 'sold' ? 'active' : 'sold',
                            })
                          }
                        >
                          <Icon name="check" />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => {
                            const t = window.prompt('Novo título', c.title);
                            if (t?.trim())
                              actions.editCommunityClassifiedEntry(c.id, {
                                title: t.trim(),
                              });
                          }}
                        >
                          <Icon name="edit" />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() =>
                            actions.removeCommunityClassifiedEntry(c.id)
                          }
                        >
                          <Icon name="trash" />
                        </button>
                      </>
                    ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  title="Nenhum anúncio"
                  text="Venda, divulgue serviços ou encontre oportunidades."
                />
              )}
            </div>
          ) : null}

          {tab === 'membros' ? (
            <div className="comm-section">
              <h2 className="h2">Membros</h2>
              <div className="comm-members">
                {members.map((id) => {
                  const person = personOf(data, id);
                  const role = community.mods?.includes(id)
                    ? 'Moderador'
                    : id === community.owner
                      ? 'Criador'
                      : 'Membro';
                  return (
                    <button
                      key={id}
                      type="button"
                      className="comm-member"
                      onClick={() => actions.openUser?.(id)}
                    >
                      <LiveAvatar user={person} size={40} data={data} />
                      <span className="grow">
                        <b>{person.name}</b>
                        <span className="muted sm"> {role}</span>
                      </span>
                      <Icon name="chevron-right" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tab === 'admin' && canManage ? (
            <div className="comm-section">
              <h2 className="h2">Administração</h2>
              <p className="muted">
                Gerencie membros, moderadores e privacidade da comunidade.
              </p>
              <button
                className="btn primary"
                onClick={onAdmin || (() => actions.openCommAdmin?.(community.id))}
              >
                <Icon name="shield" /> Abrir painel completo
              </button>
            </div>
          ) : null}
        </main>
      </div>
      {clLightbox ? (
        <div className="cl-lightbox" role="dialog" aria-modal="true" onClick={() => setClLightbox(null)}>
          <button type="button" className="icon-btn cl-lightbox-close" onClick={() => setClLightbox(null)} aria-label="Fechar">
            <Icon name="x" />
          </button>
          <button
            type="button"
            className="cl-lightbox-nav prev"
            onClick={(event) => {
              event.stopPropagation();
              setClLightbox((cur) => ({
                ...cur,
                index: (cur.index - 1 + cur.images.length) % cur.images.length,
              }));
            }}
            aria-label="Foto anterior"
          >
            <Icon name="back" />
          </button>
          <img
            src={
              typeof clLightbox.images[clLightbox.index] === 'string'
                ? clLightbox.images[clLightbox.index]
                : clLightbox.images[clLightbox.index]?.src
            }
            alt="Foto do anúncio ampliada"
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            className="cl-lightbox-nav next"
            onClick={(event) => {
              event.stopPropagation();
              setClLightbox((cur) => ({
                ...cur,
                index: (cur.index + 1) % cur.images.length,
              }));
            }}
            aria-label="Próxima foto"
          >
            <Icon name="back" className="flip" />
          </button>
          <span className="cl-lightbox-count">
            {clLightbox.index + 1} / {clLightbox.images.length}
          </span>
        </div>
      ) : null}
    </div>
  );
}
