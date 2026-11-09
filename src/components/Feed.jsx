import { MAX_POST_MEDIA } from '../lib/media';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import Empty from './Empty';
import { Icon } from './Icon';
import Post from './Post';

function Composer() {
  const { data, ui, actions } = useApp();
  const draft = ui.draft;
  const media = draft.media || [];
  const first = data.me.name.split(' ')[0];

  return (
    <form
      className="card composer"
      onSubmit={(event) => {
        event.preventDefault();
        actions.publish(draft.text);
      }}
    >
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Avatar user={data.me} size={44} />
        <textarea
          id="ctext"
          rows={2}
          maxLength={600}
          placeholder={`O que está rolando no seu fluxo, ${first}?`}
          value={draft.text}
          onChange={(event) => actions.setDraftText(event.target.value)}
        />
      </div>

      {media.length ? (
        <div className="cprev-list" aria-label="Prévia das mídias selecionadas">
          {media.map((item, index) => (
            <div className="cprev-item" key={`${item.src}-${index}`}>
              {item.kind === 'photo' ? (
                <img src={item.src} alt={`Prévia ${index + 1}`} />
              ) : (
                <video src={item.src} muted playsInline preload="metadata" />
              )}
              <span className="cprev-tag">
                {item.kind === 'photo' ? <Icon name="image" /> : <Icon name="video" />}
              </span>
              <button
                type="button"
                className="x"
                onClick={() => actions.removeDraftMedia(index)}
                aria-label="Remover mídia"
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="comp-actions">
        <div className="row">
          <label className="btn ghost sm" htmlFor="cmedia">
            <Icon name="image" /> Fotos e vídeos
          </label>
          <input
            id="cmedia"
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(event) => {
              const files = event.target.files;
              if (files?.length) actions.attachMedia(files);
              event.target.value = '';
            }}
          />
          <span className="muted sm">
            {media.length}/{MAX_POST_MEDIA}
          </span>
        </div>
        <div className="row">
          <span className="muted sm">{draft.text.length}/600</span>
          <button className="btn primary" type="submit">
            Publicar
          </button>
        </div>
      </div>
    </form>
  );
}

export default function Feed() {
  const { data, ui, actions } = useApp();
  const tab = ui.feedTab;
  const list = data.posts
    .filter((p) => tab === 'all' || p.by === 'me' || data.follows.includes(p.by))
    .sort((a, b) => b.ts - a.ts);

  return (
    <>
      <div className="pagehead">
        <h1>Feed</h1>
        <div className="seg">
          <button
            className={tab === 'all' ? 'on' : ''}
            onClick={() => actions.setFeedTab('all')}
          >
            Para você
          </button>
          <button
            className={tab === 'fol' ? 'on' : ''}
            onClick={() => actions.setFeedTab('fol')}
          >
            Seguindo
          </button>
        </div>
      </div>
      <Composer />
      <div className="posts">
        {list.length ? (
          list.map((post) => <Post key={post.id} post={post} />)
        ) : (
          <Empty
            title="Nada por aqui ainda"
            text="Siga mais pessoas para encher o seu feed."
          />
        )}
      </div>
    </>
  );
}
