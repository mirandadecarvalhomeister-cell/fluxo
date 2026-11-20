import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { MediaItem } from './Post';
import RichText from './RichText';
import { Verified } from './Brand';

/**
 * Prévia em tempo real da publicação, com os mesmos componentes do feed.
 * É somente leitura: nenhuma ação de curtir/comentar é executada.
 */
export default function PostPreview({ draft }) {
  const { data, ui } = useApp();
  const [mode, setMode] = useState('desktop');
  const media = draft?.media || [];
  const text = String(draft?.text || '');
  const format = draft?.format || 'classic';
  const options = draft?.options || [];
  const previewPost = {
    id: 'preview',
    by: 'me',
    ts: Date.now(),
    text,
    kind: media[0]?.kind || 'text',
    media,
    likes: 0,
    comments: [],
    interactive: format === 'classic' ? null : { format, options },
  };

  return (
    <section className="preview-pane" aria-label="Prévia da publicação">
      <div className="preview-head">
        <div>
          <b>Prévia em tempo real</b>
          <small>Exatamente como aparecerá no feed</small>
        </div>
        <div className="seg preview-modes" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            className={mode === 'desktop' ? 'on' : ''}
            onClick={() => setMode('desktop')}
            aria-pressed={mode === 'desktop'}
          >
            <Icon name="screen" /> Desktop
          </button>
          <button
            type="button"
            className={mode === 'mobile' ? 'on' : ''}
            onClick={() => setMode('mobile')}
            aria-pressed={mode === 'mobile'}
          >
            <Icon name="user" /> Celular
          </button>
        </div>
      </div>
      <div className={`preview-stage ${mode}`}>
        <div className={`card post post-preview${mode === 'mobile' ? ' post-preview-mobile' : ''}`}>
          <header className="post-h">
            <span className="post-av"><Avatar user={data.me} size={mode === 'mobile' ? 36 : 44} /></span>
            <div className="who">
              <b className="ell">{data.me.name} <Verified user={data.me} /></b>
              <span className="sub ell">@{data.me.handle || 'você'} · agora</span>
            </div>
          </header>
          {text ? (
            <div className="txt-wrap">
              <p className="txt"><RichText text={text} /></p>
            </div>
          ) : (
            <p className="preview-empty-text">Seu texto aparecerá aqui.</p>
          )}
          {media.length ? (
            <div className="preview-media">
              {media.map((item, index) => (
                <MediaItem key={`${item.src}-${index}`} item={item} author={data.me} index={index} postId="preview" />
              ))}
            </div>
          ) : null}
          {format !== 'classic' && options.length ? (
            <div className="preview-options">
              {options.filter((option) => String(option?.label || option || '').trim()).map((option, index) => (
                <span key={index}>{String(option?.label || option).trim()}</span>
              ))}
            </div>
          ) : null}
          <footer className="acts preview-acts" aria-hidden="true">
            <span><Icon name="heart" /> 0</span>
            <span><Icon name="comment" /> 0</span>
            <span><Icon name="share" /></span>
          </footer>
        </div>
      </div>
      {ui.draft?.communityId ? (
        <p className="preview-note"> Será publicado em uma comunidade.</p>
      ) : null}
    </section>
  );
}
