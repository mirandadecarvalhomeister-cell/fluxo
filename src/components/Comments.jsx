import { useEffect, useState } from 'react';
import { userOf } from '../lib/selectors';
import { ago } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { TagText } from './Brand';
import { Icon } from './Icon';
import MentionField from './MentionField';

export function Comments({ post }) {
  const { data, actions } = useApp();
  const [comment, setComment] = useState('');

  const submit = (event) => {
    event.preventDefault();
    if (post.commentsDisabled) return;
    actions.addComment(post.id, comment);
    setComment('');
  };

  return (
    <div className="cmts-body">
      {post.comments.length ? (
        <div className="cmts-list">
          {post.comments.map((c, index) => {
            const author = userOf(data, c.by);
            return (
              <div className="cm" key={c.id || index}>
                <Avatar user={author} size={34} />
                <div className="cm-main">
                  <div className="cm-head">
                    <b>{author.name}</b>
                    <span className="muted sm">{ago(c.ts)}</span>
                  </div>
                  <p>
                    <TagText text={c.text} />
                  </p>
                </div>
                {c.by === 'me' ? (
                  <button
                    type="button"
                    className="cm-del"
                    onClick={(event) => {
                      event.stopPropagation();
                      actions.deleteComment(post.id, c.id);
                    }}
                    aria-label="Apagar comentário"
                    title="Apagar comentário"
                  >
                    <Icon name="trash" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="cmts-empty">
          <Icon name="comment" />
          Nenhum comentário ainda. Seja a primeira pessoa.
        </p>
      )}

      {post.commentsDisabled ? (
        <p className="muted sm cmts-off">
          <Icon name="shield" /> Comentários desativados pelo autor.
        </p>
      ) : (
        <form className="cmform" onSubmit={submit}>
          <MentionField
            className="in"
            type="text"
            maxLength={240}
            placeholder="Escreva um comentário (use @ para mencionar)"
            aria-label="Comentário"
            value={comment}
            onChange={(next) => setComment(next)}
          />
          <button className="btn primary sm cm-send" type="submit">
            <Icon name="send" />
            <span>Enviar</span>
          </button>
        </form>
      )}
    </div>
  );
}

export default function CommentSheet({ post, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cm-sheet-layer">
      <button
        type="button"
        className="sheet-scrim"
        onClick={onClose}
        aria-label="Fechar comentários"
      />
      <div
        className="cm-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Comentários (${post.comments.length})`}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="cm-sheet-grab" aria-hidden="true" />
        <header className="cm-sheet-head">
          <span className="cm-sheet-title">
            <Icon name="comment" />
            <b>Comentários</b>
            <i>{post.comments.length}</i>
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Fechar comentários"
          >
            <Icon name="x" />
          </button>
        </header>
        <Comments post={post} />
      </div>
    </div>
  );
}
