import { useEffect, useRef, useState } from 'react';
import { art } from '../lib/art';
import { mediaOf } from '../lib/media';
import { userOf } from '../lib/selectors';
import { ago, fmt, fmtDur } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar, LiveAvatar } from './Avatar';
import { TagText } from './Brand';
import { Icon } from './Icon';

const REACTIONS = ['❤️', '🔥', '👏', '😂', '😮', '😢', '🎉', '💜'];

function MediaItem({ item, author, index }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const seed = item.seed || `${author.id}-${index}`;
  const fallback = art(seed, 900, 700);
  const picture = item.src && failedSrc !== item.src ? item.src : fallback;

  if (item.kind === 'video') {
    if (item.src) {
      return (
        <video
          className="media-video"
          src={item.src}
          controls
          playsInline
          preload="metadata"
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
        {item.dur ? <span className="dur">{fmtDur(item.dur)}</span> : null}
      </div>
    );
  }

  return (
    <img
      src={picture}
      alt={`Foto publicada por ${author.name}`}
      loading="lazy"
      onError={() => {
        if (item.src && failedSrc !== item.src) setFailedSrc(item.src);
      }}
    />
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
  const { actions } = useApp();
  const ref = useRef(null);
  const close = () => {
    if (ref.current) ref.current.open = false;
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
            <button type="button" onClick={() => { close(); onShare(); }}>
              <Icon name="share" /> Compartilhar com alguém
            </button>
            <button type="button" onClick={() => { close(); actions.sharePost(post.id); }}>
              <Icon name="link" /> Copiar link
            </button>
            <button type="button" onClick={() => { close(); actions.toggleSave(post.id); }}>
              <Icon name="bookmark" /> {post.saved ? 'Remover dos salvos' : 'Salvar'}
            </button>
          </>
        )}
      </div>
    </details>
  );
}

export default function Post({ post, detail = false }) {
  const { data, ui, actions } = useApp();
  const [comment, setComment] = useState('');
  const author = userOf(data, post.by);
  const open = detail || !!ui.open[post.id];
  const following = data.follows.includes(post.by);
  const totalLikes = post.likes || 0;

  function submitComment(event) {
    event.preventDefault();
    if (post.commentsDisabled) return;
    actions.addComment(post.id, comment);
    setComment('');
  }

  function openDetail(event) {
    if (detail) return;
    if (
      event.target.closest(
        'button, a, input, textarea, select, label, video, .vid, .acts, .cmts, .reaction-wrap, .carousel, .post-menu'
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
      onClick={openDetail}
      onKeyDown={openDetailKey}
      tabIndex={detail ? undefined : 0}
      aria-label={detail ? undefined : `Abrir publicação de ${author.name}`}
      title={detail ? undefined : 'Abrir comentários'}
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

      {post.text ? (
        <p className="txt">
          <TagText text={post.text} />
        </p>
      ) : null}

      <Media post={post} author={author} />

      <footer className="acts">
        <div className="reaction-wrap">
          <button
            className={post.myReaction ? 'on' : ''}
            aria-pressed={!!post.myReaction}
            onClick={() => actions.reactPost(post.id, post.myReaction || '❤️')}
            title="Reagir"
          >
            {post.myReaction ? (
              <span className="reaction-emoji">{post.myReaction}</span>
            ) : (
              <Icon name="heart" />
            )}{' '}
            {fmt(totalLikes)}
          </button>
          <div className="react-picker" role="menu" aria-label="Escolher reação">
            {REACTIONS.map((emoji) => (
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
        <button onClick={() => actions.toggleComments(post.id)}>
          <Icon name="comment" /> {post.comments.length}
        </button>
        <span className="sp" />
        <button
          className={`sv ${post.saved ? 'on' : ''}`}
          onClick={() => actions.toggleSave(post.id)}
          aria-label="Salvar"
        >
          <Icon name="bookmark" className={post.saved ? 'fill' : ''} />
        </button>
        <button
          onClick={() => actions.openSharePost(post.id)}
          aria-label="Compartilhar com alguém"
          title="Compartilhar"
        >
          <Icon name="share" />
        </button>
      </footer>

      {open && (
        <div className="cmts">
          {detail ? (
            <div className="cmts-head">
              <b>Comentários</b>
              <span className="muted sm">{post.comments.length}</span>
            </div>
          ) : null}
          {detail && !post.comments.length ? (
            <p className="muted sm">Nenhum comentário ainda.</p>
          ) : null}
          {post.comments.map((c, index) => {
            const commentAuthor = userOf(data, c.by);
            return (
              <div className="cm" key={c.id || index}>
                <Avatar user={commentAuthor} size={30} />
                <div style={{ minWidth: 0 }}>
                  <b>{commentAuthor.name}</b>{' '}
                  <span className="muted sm">{ago(c.ts)}</span>
                  <p>
                    <TagText text={c.text} />
                  </p>
                </div>
              </div>
            );
          })}
          {post.commentsDisabled ? (
            <p className="muted sm cmts-off">
              <Icon name="shield" /> Comentários desativados pelo autor.
            </p>
          ) : (
            <form className="cmform" onSubmit={submitComment}>
              <input
                className="in"
                type="text"
                maxLength={240}
                placeholder="Escreva um comentário"
                aria-label="Comentário"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
              <button className="btn primary sm" type="submit">
                Enviar
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
