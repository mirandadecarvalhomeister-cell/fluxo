import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../lib/utils';
import { mediaOf } from '../lib/media';
import { userOf } from '../lib/selectors';
import { useApp } from '../store/AppContext';
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
        actions.setClipIndex(Math.min(items.length - 1, active + 1));
      }
      if (['ArrowUp', 'PageUp'].includes(event.key)) {
        event.preventDefault();
        actions.setClipIndex(Math.max(0, active - 1));
      }
      if (event.key === ' ') {
        event.preventDefault();
        const video = itemRefs.current[active];
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
          const index = Number(entry.target.dataset.ClipIndex);
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
    Object.values(itemRefs.current).forEach((video) => {
      if (video) video.muted = muted;
    });
  }, [muted]);

  if (!state || !current) return null;

  const post = current.post;
  const author = userOf(data, post.by);
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
            data-Clip-index={index}
            ref={(node) => {
              if (node) itemRefs.current[index] = node.querySelector('video');
            }}
          >
            <video
              src={item.src}
              muted={muted}
              playsInline
              loop
              preload={Math.abs(index - active) <= 1 ? 'auto' : 'metadata'}
              onClick={() => {
                const video = itemRefs.current[index];
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
        <div className="clips-nav" aria-hidden="true">
          <button
            type="button"
            disabled={active === 0}
            onClick={() => actions.setClipIndex(active - 1)}
            aria-label="Vídeo anterior"
          >
            <Icon name="back" />
          </button>
          <span>{active + 1} / {items.length}</span>
          <button
            type="button"
            disabled={active === items.length - 1}
            onClick={() => actions.setClipIndex(active + 1)}
            aria-label="Próximo vídeo"
          >
            <Icon name="back" className="flip" />
          </button>
        </div>
      ) : null}

      <div className="clips-rail">
        <button type="button" onClick={() => actions.openUser(post.by)} aria-label={`Perfil de ${author.name}`}>
          <Avatar user={author} size={42} />
        </button>
        <button
          type="button"
          className={post.myReaction ? 'on' : ''}
          onClick={() => actions.reactPost(post.id, '❤️')}
          aria-label="Curtir vídeo"
        >
          <Icon name="heart" className={post.myReaction ? 'fill' : ''} />
          <span>{fmt(post.likes || 0)}</span>
        </button>
        <button type="button" onClick={() => { close(); actions.openPost(post.id); }} aria-label="Comentar vídeo">
          <Icon name="comment" />
          <span>{fmt((post.comments || []).length)}</span>
        </button>
        <button type="button" onClick={() => actions.openSharePost(post.id)} aria-label="Compartilhar vídeo">
          <Icon name="share" />
        </button>
      </div>

      <div className="clips-info">
        <div className="clips-author">
          <b>{author.name}</b>
          {author.handle ? <span>@{author.handle}</span> : null}
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
    </div>
  );
}

