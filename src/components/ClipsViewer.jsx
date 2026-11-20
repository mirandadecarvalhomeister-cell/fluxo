import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../lib/utils';
import { mediaOf } from '../lib/media';
import { userOf } from '../lib/selectors';
import { useApp } from '../store/AppContext';
import { REACTIONS, fxFor } from '../lib/reactionFx';
import AnimatedEmoji from './AnimatedEmoji';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

const clock = (value) => {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Visualizador de vídeos em formato Clips: tela inteira, navegação vertical
 * por gesto/roda/teclado, autoplay do item visível e ações sociais na lateral.
 */
export default function ClipsViewer() {
  const { data, ui, actions } = useApp();
  const state = ui.clips;
  const trackRef = useRef(null);
  const itemRefs = useRef({});
  const [active, setActive] = useState(state?.index || 0);
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState({ time: 0, duration: 0 });
  const [muted, setMuted] = useState(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [panel, setPanel] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [panelDragY, setPanelDragY] = useState(0);
  const panelDragRef = useRef(null);

  const items = useMemo(() => {
    if (!data?.posts) return [];
    return data.posts
      .filter((post) => {
        const media = mediaOf(post);
        return media.some((item) => item.kind === 'video' && item.src);
      })
      .sort((a, b) => b.ts - a.ts)
      .map((post) => {
        const video = mediaOf(post).find((item) => item.kind === 'video' && item.src);
        return { postId: post.id, src: video.src, post };
      });
  }, [data?.posts]);

  const current = items[active];
  const close = useCallback(() => actions.closeClips(), [actions]);

  useEffect(() => {
    setPanel(null);
    setReactionOpen(false);
    setCommentText('');
  }, [active]);

  // Trava a rolagem da página enquanto o visualizador está aberto.
  useEffect(() => {
    if (!state) return undefined;
    document.documentElement.classList.add('video-open');
    document.body.classList.add('video-open');
    return () => {
      document.documentElement.classList.remove('video-open');
      document.body.classList.remove('video-open');
    };
  }, [state]);

  // Teclado: setas/PageUp/PageDown navegam, espaço pausa, Esc fecha.
  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') { close(); return; }
      if (['ArrowDown', 'PageDown'].includes(event.key)) {
        event.preventDefault();
        const next = Math.min(items.length - 1, active + 1);
        setActive(next);
        actions.setClipIndex(next);
      }
      if (['ArrowUp', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        const next = Math.max(0, active - 1);
        setActive(next);
        actions.setClipIndex(next);
      }
      if (event.key === ' ') {
        event.preventDefault();
        const video = itemRefs.current[active]?.querySelector('video');
        if (!video) return;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, actions, close, items.length, state]);

  // Achata o item ativo ao centro e sincroniza o índice da UI.
  useEffect(() => {
    if (!state || !trackRef.current) return;
    const node = itemRefs.current[active];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [active, state]);

  // Observa qual item está visível para tocar apenas ele.
  useEffect(() => {
    if (!state) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.dataset.clipIndex);
          const video = entry.target.querySelector('video');
          if (!video) return;
          if (entry.intersectionRatio >= 0.65) {
            setActive(index);
            video.muted = muted;
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.65, 1] }
    );
    Object.values(itemRefs.current).forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [items.length, muted, state]);

  useEffect(() => {
    Object.values(itemRefs.current).forEach((node) => {
      const video = node?.querySelector('video');
      if (video) video.muted = muted;
    });
  }, [muted]);

  if (!state || !current) return null;

  const post = current.post;
  const authorId = post.authorId || post.author_id || post.by;
  const author = userOf(data, authorId);
  const authorName = post.authorName || author.name;
  const followingAuthor = (data?.follows || []).includes(authorId);
  const text = String(post.text || '');
  const shownText = expanded || text.length <= 130 ? text : `${text.slice(0, 130)}…`;
  const played = progress.duration ? (progress.time / progress.duration) * 100 : 0;

  return (
    <div className="clips-root" role="dialog" aria-modal="true" aria-label="Vídeos">
      <div className="clips-top">
        <button type="button" className="icon-btn" onClick={close} aria-label="Fechar vídeos">
          <Icon name="x" />
        </button>
        <b>Clips</b>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
        >
          <Icon name={muted ? 'volumeoff' : 'volume'} />
        </button>
      </div>

      <div className="clips-track" ref={trackRef}>
        {items.map((item, index) => (
          <div
            className="clips-item"
            key={item.postId}
            data-clip-index={index}
            ref={(node) => {
              if (node) itemRefs.current[index] = node;
            }}
          >
            <video
              src={item.src}
              muted={muted}
              playsInline
              loop
              preload={Math.abs(index - active) <= 1 ? 'auto' : 'metadata'}
              onClick={() => {
                const video = itemRefs.current[index]?.querySelector('video');
                if (!video) return;
                if (video.paused) video.play().catch(() => {});
                else video.pause();
              }}
              onTimeUpdate={(event) => {
                if (index !== active) return;
                const video = event.currentTarget;
                setProgress({
                  time: video.currentTime || 0,
                  duration: Number.isFinite(video.duration) ? video.duration : 0,
                });
              }}
            />
          </div>
        ))}
      </div>

      {items.length > 1 ? (
        <div className="clips-nav">
          <button
            type="button"
            disabled={active === 0}
            onClick={() => {
              const next = Math.max(0, active - 1);
              setActive(next);
              actions.setClipIndex(next);
            }}
            aria-label="Vídeo anterior"
            title="Vídeo anterior"
          >
            <Icon name="back" className="nav-up" />
          </button>
          <span>{active + 1} / {items.length}</span>
          <button
            type="button"
            disabled={active === items.length - 1}
            onClick={() => {
              const next = Math.min(items.length - 1, active + 1);
              setActive(next);
              actions.setClipIndex(next);
            }}
            aria-label="Próximo vídeo"
            title="Próximo vídeo"
          >
            <Icon name="back" className="nav-down" />
          </button>
        </div>
      ) : null}

      <div className="clips-rail">
        <span
          className="clips-react-wrap"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={post.myReaction ? 'on' : ''}
            onClick={() => {
              if (post.myReaction) actions.reactPost(post.id, post.myReaction);
              else setReactionOpen((value) => !value);
            }}
            aria-label={post.myReaction ? 'Remover reação' : 'Reagir ao vídeo'}
            aria-expanded={reactionOpen}
          >
            {post.myReaction ? (
              <AnimatedEmoji emoji={post.myReaction} size={26} />
            ) : (
              <Icon name="heart" />
            )}
            <span>{fmt(post.likes || 0)}</span>
          </button>
          {reactionOpen ? (
            <span className="clips-react-picker" role="menu" aria-label="Escolher reação">
              {(ui.settings?.reactions?.length ? ui.settings.reactions : REACTIONS).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`fx-${fxFor(emoji)}${post.myReaction === emoji ? ' on' : ''}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.reactPost(post.id, emoji);
                    setReactionOpen(false);
                  }}
                  aria-label={`Reagir com ${emoji}`}
                >
                  <AnimatedEmoji emoji={emoji} size={22} />
                </button>
              ))}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          className={panel === 'comments' ? 'on' : ''}
          onClick={() => setPanel((value) => (value === 'comments' ? null : 'comments'))}
          aria-label="Comentar vídeo"
          aria-expanded={panel === 'comments'}
        >
          <Icon name="comment" />
          <span>{fmt((post.comments || []).length)}</span>
        </button>
        <button
          type="button"
          className={panel === 'share' ? 'on' : ''}
          onClick={() => setPanel((value) => (value === 'share' ? null : 'share'))}
          aria-label="Compartilhar vídeo"
          aria-expanded={panel === 'share'}
        >
          <Icon name="share" />
        </button>
      </div>

      <div className="clips-info">
        <div className="clips-author-row">
          <button
            type="button"
            className="clips-author-avatar"
            onClick={() => { close(); actions.openUser(post.by); }}
            aria-label={`Ver perfil de ${author.name}`}
          >
            <Avatar user={author} size={38} />
          </button>
          <div className="clips-author">
            <span className="clips-author-line">
              <button type="button" onClick={() => { close(); actions.openUser(authorId); }}>
                <b>{authorName}</b>
              </button>
              {authorId !== 'me' ? (
                <button
                  type="button"
                  className={`clips-follow${followingAuthor ? ' on' : ''}`}
                  onClick={() => actions.follow(authorId)}
                  aria-label={followingAuthor ? 'Deixar de seguir' : 'Seguir'}
                >
                  {followingAuthor ? 'Seguindo' : 'Seguir'}
                </button>
              ) : null}
            </span>
            {author.handle ? <span>@{author.handle}</span> : null}
          </div>
        </div>
        {shownText ? <p>{shownText}</p> : null}
        {text.length > 130 ? (
          <button type="button" className="clips-more" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'ver menos' : 'ver mais'}
          </button>
        ) : null}
      </div>

      <div className="clips-progress" aria-hidden="true">
        <span style={{ width: `${Math.min(100, played)}%` }} />
        <small>{clock(progress.time)} / {clock(progress.duration)}</small>
      </div>

      {panel ? (
        <aside className="clips-panel" role="dialog" aria-label={panel === 'comments' ? 'Comentários' : 'Compartilhar'}>
          <div
            className="clips-panel-head"
            style={panelDragY ? { transform: `translateY(${panelDragY}px)`, transition: 'none' } : undefined}
            onPointerDown={(event) => {
              if (event.target.closest('button, input, a')) return;
              panelDragRef.current = event.clientY;
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (panelDragRef.current === null) return;
              const dy = event.clientY - panelDragRef.current;
              if (dy > 0) setPanelDragY(dy);
            }}
            onPointerUp={() => {
              const dy = panelDragY;
              panelDragRef.current = null;
              setPanelDragY(0);
              if (dy > 80) setPanel(null);
            }}
            onPointerCancel={() => {
              panelDragRef.current = null;
              setPanelDragY(0);
            }}
          >
            <button
              type="button"
              className="clips-panel-author"
              onClick={() => { close(); actions.openUser(post.by); }}
              aria-label={`Ver perfil de ${author.name}`}
            >
              <Avatar user={author} size={38} />
              <span>
                <b>{author.name}</b>
                <small>{author.handle ? `@${author.handle}` : 'Ver perfil'}</small>
              </span>
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setPanel(null)}
              aria-label="Fechar painel"
            >
              <Icon name="x" />
            </button>
          </div>

          {panel === 'comments' ? (
            <>
              <div className="clips-panel-title">
                <b>Comentários</b>
                <span>{fmt((post.comments || []).length)}</span>
              </div>
              <div className="clips-panel-scroll">
                {(post.comments || []).length ? (
                  post.comments.map((comment) => {
                    const person = userOf(data, comment.by);
                    return (
                      <button
                        type="button"
                        className="clips-comment"
                        key={comment.id}
                        onClick={() => { close(); actions.openUser(comment.by); }}
                      >
                        <Avatar user={person} size={30} />
                        <span>
                          <b>{person.name}</b> {comment.text}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="clips-panel-empty">Seja a primeira pessoa a comentar.</p>
                )}
              </div>
              <form
                className="clips-comment-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = commentText.trim();
                  if (!value) return;
                  actions.addComment(post.id, value);
                  setCommentText('');
                }}
              >
                <input
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Escreva um comentário…"
                  aria-label="Escrever comentário"
                  maxLength={500}
                />
                <button type="submit" className="icon-btn" aria-label="Enviar comentário">
                  <Icon name="send" />
                </button>
              </form>
            </>
          ) : (
            <div className="clips-share-actions">
              <button
                type="button"
                onClick={() => {
                  const url = `${location.href.split('#')[0]}#feed`;
                  navigator.clipboard?.writeText(url).then(
                    () => actions.notify?.('Link copiado'),
                    () => actions.notify?.('Não foi possível copiar')
                  );
                }}
              >
                <Icon name="link" /> Copiar link do vídeo
              </button>
              <button type="button" onClick={() => actions.sharePost(post.id)}>
                <Icon name="share" /> Compartilhar
              </button>
              <button
                type="button"
                onClick={() => { close(); actions.openSharePost(post.id); }}
              >
                <Icon name="chat" /> Enviar para uma conversa
              </button>
            </div>
          )}
        </aside>
      ) : null}
    </div>
  );
}

