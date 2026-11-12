import { useEffect, useRef, useState } from 'react';
import { art } from '../lib/art';
import { normalizeInteractive } from '../lib/interactive';
import { mediaOf } from '../lib/media';
import { hasEdits, mediaDisplayStyle } from '../lib/mediaEdit';
import { userOf } from '../lib/selectors';
import { useCompact } from '../lib/useCompact';
import { ago, fmt, fmtDur } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { LiveAvatar } from './Avatar';
import { TagText } from './Brand';
import CommentSheet, { Comments } from './Comments';
import { Icon } from './Icon';
import Interactive from './Interactive';
import { EditWrap } from './MediaEditor';
import { FeedVideo } from './VideoPlayer';

const REACTIONS = ['❤️', '🔥', '👏', '😂', '😮', '😢', '🎉', '💜'];

function MediaItem({ item, author, index }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const seed = item.seed || `${author.id}-${index}`;
  const fallback = art(seed, 900, 700);
  const picture = item.src && failedSrc !== item.src ? item.src : fallback;
  const edit = item.edit && hasEdits(item.edit) ? item.edit : null;
  const style = mediaDisplayStyle(edit);

  if (item.kind === 'video') {
    if (item.src && !videoFailed) {
      return (
        <FeedVideo
          src={item.src}
          style={style}
          onError={() => setVideoFailed(true)}
        />
      );
    }
    return (
      <div
        className="media-video media-fallback"
        style={{ backgroundImage: `url('${fallback}')` }}
        role="img"
        aria-label={`Vídeo publicado por ${author.name}`}
      >
        <span className="playbtn">
          <Icon name="play" className="fill" />
        </span>
        {videoFailed && item.src ? (
          <span className="dur">Vídeo indisponível</span>
        ) : item.dur ? (
          <span className="dur">{fmtDur(item.dur)}</span>
        ) : null}
      </div>
    );
  }

  return (
    <EditWrap edit={edit}>
      <img
        src={picture}
        alt={`Foto publicada por ${author.name}`}
        loading="lazy"
        style={style}
        onError={() => {
          if (item.src && failedSrc !== item.src) setFailedSrc(item.src);
        }}
      />
    </EditWrap>
  );
}

function Media({ post, author }) {
  const items = mediaOf(post);
  const [index, setIndex] = useState(0);
  const trackRef = useRef(null);

  useEffect(() => {
    setIndex(0);
    if (trackRef.current) trackRef.current.scrollLeft = 0;
  }, [items.length]);

  if (!items.length) return null;

  if (items.length === 1) {
    return (
      <div className="media">
        <MediaItem item={items[0]} author={author} index={0} />
      </div>
    );
  }

  const goTo = (target) => {
    const next = Math.max(0, Math.min(items.length - 1, target));
    const track = trackRef.current;
    if (track) {
      track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
    }
    setIndex(next);
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const current = Math.round(track.scrollLeft / track.clientWidth);
    if (current !== index) setIndex(current);
  };

  return (
    <div className="carousel">
      <div className="car-track" ref={trackRef} onScroll={onScroll}>
        {items.map((item, itemIndex) => (
          <div className="car-slide" key={itemIndex}>
            <MediaItem item={item} author={author} index={itemIndex} />
          </div>
        ))}
      </div>
      <span className="car-count">
        {index + 1}/{items.length}
      </span>
      {index > 0 ? (
        <button
          type="button"
          className="car-nav prev"
          onClick={() => goTo(index - 1)}
          aria-label="Mídia anterior"
        >
          <Icon name="back" />
        </button>
      ) : null}
      {index < items.length - 1 ? (
        <button
          type="button"
          className="car-nav next"
          onClick={() => goTo(index + 1)}
          aria-label="Próxima mídia"
        >
          <Icon name="back" />
        </button>
      ) : null}
      <div className="car-dots" role="tablist" aria-label="Mídias da publicação">
        {items.map((_, dotIndex) => (
          <button
            type="button"
            key={dotIndex}
            className={dotIndex === index ? 'on' : ''}
            onClick={() => goTo(dotIndex)}
            aria-label={`Ir para a mídia ${dotIndex + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function PostMenu({ post, onEdit, onShare }) {
  const { data, actions } = useApp();
  const ref = useRef(null);
  const following = data.follows.includes(post.by);
  const author = userOf(data, post.by);
  const close = () => {
    if (ref.current) ref.current.open = false;
  };

  const act = (fn) => {
    close();
    fn();
  };

  useEffect(() => {
    const onDocClick = (event) => {
      if (ref.current?.open && !ref.current.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <details className="post-menu" ref={ref}>
      <summary className="icon-btn" aria-label="Gerenciar publicação" title="Opções">
        <Icon name="more" />
      </summary>
      <div className="menu-pop">
        {post.by === 'me' ? (
          <>
            <button type="button" onClick={() => { close(); onEdit(); }}>
              <Icon name="edit" /> Editar publicação
            </button>
            <button
              type="button"
              onClick={() => { close(); actions.toggleCommentsDisabled(post.id); }}
            >
              <Icon name="comment" />{' '}
              {post.commentsDisabled ? 'Ativar comentários' : 'Desativar comentários'}
            </button>
            <button type="button" onClick={() => { close(); onShare(); }}>
              <Icon name="share" /> Compartilhar com alguém
            </button>
            <button type="button" onClick={() => { close(); actions.sharePost(post.id); }}>
              <Icon name="link" /> Copiar link
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => { close(); actions.deletePost(post.id); }}
            >
              <Icon name="trash" /> Excluir publicação
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => act(() => actions.feedFeedback(post.id, 'notInterested'))}>
              <Icon name="eyeoff" /> Não tenho interesse
            </button>
            <button type="button" onClick={() => act(() => actions.feedFeedback(post.id, 'lessLike'))}>
              <Icon name="minus" /> Mostrar menos conteúdos assim
            </button>
            <button type="button" onClick={() => act(() => actions.feedFeedback(post.id, 'muteTopic', String(post.text || '').split(/\s+/).find((word) => word.length > 4) || 'assunto'))}>
              <Icon name="filter" /> Silenciar este assunto
            </button>
            <button type="button" onClick={() => act(() => actions.feedFeedback(post.id, 'hideProfile'))}>
              <Icon name="eyeoff" /> Ocultar publicações deste perfil
            </button>
            {following ? (
              <button type="button" onClick={() => act(() => actions.follow(post.by))}>
                <Icon name="user" /> Deixar de seguir {author.name.split(' ')[0]}
              </button>
            ) : null}
            <button type="button" onClick={() => act(() => onShare())}>
              <Icon name="share" /> Compartilhar com alguém
            </button>
            <button type="button" onClick={() => act(() => actions.sharePost(post.id))}>
              <Icon name="link" /> Copiar link
            </button>
            <button type="button" onClick={() => act(() => actions.toggleSave(post.id))}>
              <Icon name="bookmark" /> {post.saved ? 'Remover dos salvos' : 'Salvar'}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => act(() => actions.reportPost(post.id))}
            >
              <Icon name="shield" /> Denunciar publicação
            </button>
          </>
        )}
      </div>
    </details>
  );
}

export default function Post({ post, detail = false }) {
  const { data, ui, actions } = useApp();
  const compact = useCompact();
  const detailCommentsRef = useRef(null);
  const cardRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const author = userOf(data, post.by);
  const open = !!ui.open[post.id];
  const following = data.follows.includes(post.by);
  const totalLikes = post.likes || 0;
  const interactive = normalizeInteractive(post.interactive);
  const media = mediaOf(post);
  const hasMedia = media.length > 0 || post.kind === 'photo' || post.kind === 'video';
  const longText = !detail && (post.text || '').length > 320;
  const reactionChoices =
    interactive?.format === 'reactions' && interactive.reactions.length
      ? interactive.reactions
      : REACTIONS;

  // Publicação com foto/vídeo conta uma visualização depois de 50% visível
  // por pelo menos 1 segundo. O próprio autor não conta.
  useEffect(() => {
    if (!hasMedia || post.by === 'me') return undefined;
    const element = cardRef.current;
    if (!element) return undefined;
    if (!('IntersectionObserver' in window)) {
      actions.viewPost(post.id);
      return undefined;
    }
    let timer = null;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio >= 0.5) {
            if (!timer) {
              timer = window.setTimeout(() => {
                timer = null;
                actions.viewPost(post.id);
                observer.disconnect();
              }, 1000);
            }
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        });
      },
      { threshold: [0, 0.5, 0.75] }
    );
    observer.observe(element);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, hasMedia, post.by]);

  function openComments() {
    if (detail) {
      detailCommentsRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
      return;
    }
    actions.toggleComments(post.id);
  }

  function openDetail(event) {
    if (detail) return;
    if (
      event.target.closest(
        'button, a, input, textarea, select, label, video, .fv, .vid, .acts, .cmts, .interactive, .reaction-wrap, .carousel, .post-menu'
      )
    ) {
      return;
    }
    actions.openPost(post.id);
  }

  function openDetailKey(event) {
    if (detail || event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      actions.openPost(post.id);
    }
  }

  return (
    <article
      className={`card post${detail ? ' post-detail' : ''}`}
      data-post={post.id}
      ref={cardRef}
      onClick={openDetail}
      onKeyDown={openDetailKey}
      tabIndex={detail ? undefined : 0}
      aria-label={detail ? undefined : `Abrir publicação de ${author.name}`}
      title={detail ? undefined : 'Abrir publicação'}
    >
      <header className="post-h">
        <LiveAvatar user={author} size={44} data={data} />
        <div className="who">
          <b className="ell">{author.name}</b>
          <span className="sub ell">
            @{author.handle} · {ago(post.ts)}
          </span>
        </div>
        {post.by !== 'me' ? (
          <button
            className={`btn sm ${following ? 'ghost' : 'tonal'}`}
            onClick={() => actions.follow(post.by)}
          >
            {following ? 'Seguindo' : 'Seguir'}
          </button>
        ) : null}
        <PostMenu
          post={post}
          onEdit={() => actions.openEditPost(post.id)}
          onShare={() => actions.openSharePost(post.id)}
        />
      </header>

      {post.communityId ? (
        <button
          type="button"
          className="post-comm"
          onClick={(event) => {
            event.stopPropagation();
            actions.openComm(post.communityId);
          }}
          title="Abrir comunidade"
        >
          <Icon name="users" />
          <span>{post.communityName || 'Comunidade'}</span>
        </button>
      ) : null}

      {post.text ? (
        <div className="txt-wrap">
          <p className={`txt${longText && !expanded ? ' clamped' : ''}`}>
            <TagText text={post.text} />
          </p>
          {longText ? (
            <button
              type="button"
              className="read-more"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((value) => !value);
              }}
            >
              {expanded ? 'Ler menos' : 'Ler mais'}
            </button>
          ) : null}
        </div>
      ) : null}

      {interactive?.format !== 'imageVote' ? <Media post={post} author={author} /> : null}

      <Interactive post={post} />

      {hasMedia && (post.views > 0 || post.by === 'me') ? (
        <div className="views-row">
          <span className="views-pill" title={`${post.views || 0} visualizações`}>
            <Icon name="eye" /> {fmt(post.views || 0)}
          </span>
        </div>
      ) : null}

      {post.feedReason ? (
        <div className="feed-reason">
          <Icon name="spark" />
          <span>{post.feedReason}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              actions.feedFeedback(post.id, 'notInterested');
            }}
          >
            Não tenho interesse
          </button>
        </div>
      ) : null}

      <footer className="acts">
        <div className="reaction-wrap">
          <button
            type="button"
            className={`act-btn act-like ${post.myReaction ? 'on' : ''}`}
            aria-pressed={!!post.myReaction}
            onClick={() => actions.reactPost(post.id, post.myReaction || '❤️')}
            aria-label={post.myReaction ? 'Remover reação' : 'Reagir'}
            title="Reagir"
          >
            <Icon name="heart" className="act-ic" />
            <span className="act-count">{fmt(totalLikes)}</span>
          </button>
          <div className="react-picker" role="menu" aria-label="Escolher reação">
            {reactionChoices.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={post.myReaction === emoji ? 'on' : ''}
                onClick={() => actions.reactPost(post.id, emoji)}
                aria-label={`Reagir com ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className={`act-btn act-comment ${!detail && open ? 'on' : ''}`}
          onClick={openComments}
          aria-expanded={detail ? true : open}
          aria-label="Abrir comentários"
          title="Comentar"
        >
          <Icon name="comment" className="act-ic" />
          <span className="act-count">{post.comments.length}</span>
        </button>
        <span className="sp" />
        <button
          type="button"
          className={`act-btn act-save ${post.saved ? 'on' : ''}`}
          onClick={() => actions.toggleSave(post.id)}
          aria-label={post.saved ? 'Remover dos salvos' : 'Salvar'}
          title={post.saved ? 'Remover dos salvos' : 'Salvar'}
        >
          <Icon name="bookmark" className="act-ic" />
        </button>
        <button
          type="button"
          className="act-btn act-share"
          onClick={() => actions.openSharePost(post.id)}
          aria-label="Compartilhar com alguém"
          title="Compartilhar"
        >
          <Icon name="share" className="act-ic" />
        </button>
      </footer>

      {open && !detail ? (
        compact ? (
          <CommentSheet
            post={post}
            onClose={() => actions.toggleComments(post.id)}
          />
        ) : (
          <div className="cmts cmts-inline">
            <div className="cmts-head">
              <span className="cmts-title">
                <Icon name="comment" />
                <b>Comentários</b>
                <i>{post.comments.length}</i>
              </span>
            </div>
            <Comments post={post} />
          </div>
        )
      ) : null}

      {detail ? (
        <div className="cmts cmts-detail" ref={detailCommentsRef}>
          <div className="cmts-head">
            <span className="cmts-title">
              <Icon name="comment" />
              <b>Comentários</b>
              <i>{post.comments.length}</i>
            </span>
            <span className="cmts-grab" aria-hidden="true" />
          </div>
          <Comments post={post} />
        </div>
      ) : null}
    </article>
  );
}
