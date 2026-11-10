import { useState } from 'react';
import { MAX_POST_MEDIA } from '../lib/media';
import { mediaDisplayStyle } from '../lib/mediaEdit';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import Empty from './Empty';
import { Icon } from './Icon';
import MediaEditor, { EditOverlay } from './MediaEditor';
import Post from './Post';
import { StoriesBar, StoryViewer, storyGroups } from './Stories';

function Composer() {
  const { data, ui, actions } = useApp();
  const draft = ui.draft;
  const media = draft.media || [];
  const first = data.me.name.split(' ')[0];
  const [editing, setEditing] = useState(null);
  const editingItem = editing !== null ? media[editing] : null;

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
              {item.edit ? (
                <span className="cprev-frame">
                  {item.kind === 'photo' ? (
                    <img src={item.src} alt="" style={mediaDisplayStyle(item.edit)} />
                  ) : (
                    <video
                      src={item.src}
                      muted
                      playsInline
                      preload="metadata"
                      style={mediaDisplayStyle(item.edit)}
                    />
                  )}
                  <EditOverlay edit={item.edit} />
                </span>
              ) : item.kind === 'photo' ? (
                <img src={item.src} alt={`Prévia ${index + 1}`} />
              ) : (
                <video src={item.src} muted playsInline preload="metadata" />
              )}
              <span className="cprev-tag">
                {item.kind === 'photo' ? <Icon name="image" /> : <Icon name="video" />}
              </span>
              <button
                type="button"
                className="cprev-edit"
                onClick={() => setEditing(index)}
                aria-label="Editar mídia"
                title="Editar mídia"
              >
                <Icon name="edit" />
              </button>
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

      {editingItem ? (
        <MediaEditor
          key={`${editing}-${editingItem.src}`}
          kind={editingItem.kind}
          src={editingItem.src}
          fileName={editingItem.name}
          initialEdit={editingItem.edit}
          onDone={(result) => {
            actions.applyMediaEdit(editing, result);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
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
            {media.length}/{MAX_POST_MEDIA} · vídeos até 3 min
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
  const [viewer, setViewer] = useState(null);
  const tab = ui.feedTab;
  const groups = storyGroups(data);
  const list = data.posts
    .filter((p) => p.kind !== 'story')
    .filter((p) => tab === 'all' || p.by === 'me' || data.follows.includes(p.by))
    .sort((a, b) => b.ts - a.ts);

  return (
    <>
      <div className="pagehead">
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
      <StoriesBar
        groups={groups}
        onOpen={setViewer}
        onAdd={actions.openStory}
      />
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
      {viewer ? (
        <StoryViewer
          groups={groups}
          startId={viewer}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </>
  );
}
