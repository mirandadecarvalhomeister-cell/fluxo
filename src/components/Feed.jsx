import { useState } from 'react';
import {
  DEFAULT_REACTIONS,
  INTERACTIVE_FORMATS,
  MAX_OPTIONS,
  REACTION_CHOICES,
  formatMeta,
} from '../lib/interactive';
import { MAX_POST_MEDIA } from '../lib/media';
import { mediaDisplayStyle } from '../lib/mediaEdit';
import { userOf } from '../lib/selectors';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import Empty from './Empty';
import { Icon } from './Icon';
import MediaEditor, { EditOverlay } from './MediaEditor';
import Post from './Post';

function Composer() {
  const { data, ui, actions } = useApp();
  const draft = ui.draft;
  const media = draft.media || [];
  const format = draft.format || 'classic';
  const meta = formatMeta(format);
  const first = data.me.name.split(' ')[0];
  const [editing, setEditing] = useState(null);
  const editingItem = editing !== null ? media[editing] : null;
  const options = draft.options || [];
  const invited = draft.invited || [];
  const friends = (data.follows || []).filter((id) => id !== 'me');

  const placeholder =
    format === 'poll'
      ? `Faça uma pergunta para a galera votar, ${first}…`
      : format === 'question'
        ? `Qual pergunta você quer fazer, ${first}?`
        : format === 'imageVote'
          ? 'Qual é a melhor? Descreva a votação…'
          : format === 'challenge'
            ? `Qual desafio você propõe, ${first}?`
            : format === 'reactions'
              ? 'O que está rolando? Escolha as reações ideais…'
              : `O que está rolando no seu fluxo, ${first}? Use @ para mencionar alguém.`;

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
          placeholder={placeholder}
          value={draft.text}
          onChange={(event) => actions.setDraftText(event.target.value)}
        />
      </div>

      <div className="fmt-tabs" role="tablist" aria-label="Formato da publicação">
        {INTERACTIVE_FORMATS.map((item) => (
          <button
            type="button"
            role="tab"
            key={item.id}
            className={format === item.id ? 'on' : ''}
            aria-selected={format === item.id}
            onClick={() => actions.setDraftFormat(item.id)}
            title={item.hint}
          >
            <Icon name={item.icon} />
            <span>{item.short}</span>
          </button>
        ))}
      </div>
      <p className="fmt-hint">{meta.hint}</p>

      {format === 'poll' ? (
        <div className="fmt-fields">
          {options.map((option, index) => (
            <div className="opt-row" key={option.id || index}>
              <span className={`opt-num${option.label.trim() ? ' filled' : ''}`}>
                {index + 1}
              </span>
              <input
                className="in"
                type="text"
                maxLength={90}
                placeholder={`Alternativa ${index + 1}`}
                value={option.label}
                onChange={(event) => actions.setDraftOption(index, event.target.value)}
              />
              <button
                type="button"
                className="icon-btn sm"
                onClick={() => actions.removeDraftOption(index)}
                aria-label={`Remover alternativa ${index + 1}`}
                disabled={options.length <= 2}
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
          {options.length < MAX_OPTIONS ? (
            <button
              type="button"
              className="btn ghost sm opt-add"
              onClick={actions.addDraftOption}
            >
              <Icon name="plus" /> Adicionar alternativa
            </button>
          ) : null}
        </div>
      ) : null}

      {format === 'imageVote' ? (
        <div className="fmt-fields">
          {media.length < 2 ? (
            <p className="fmt-alert">
              <Icon name="image" /> Anexe pelo menos duas mídias para comparar.
            </p>
          ) : null}
          {media.map((item, index) => {
            const option =
              options.find((entry) => entry?.mediaIndex === index) || options[index] || {};
            return (
              <div className="imgopt-row" key={`${item.src}-${index}`}>
                <span className="imgopt-thumb">
                  {item.kind === 'photo' ? (
                    <img src={item.src} alt="" style={mediaDisplayStyle(item.edit)} />
                  ) : (
                    <video src={item.src} muted playsInline preload="metadata" />
                  )}
                </span>
                <input
                  className="in"
                  type="text"
                  maxLength={60}
                  placeholder={`Legenda da opção ${index + 1}`}
                  value={option.label || ''}
                  onChange={(event) => actions.setDraftOption(index, event.target.value)}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      {format === 'challenge' ? (
        <div className="fmt-fields">
          <p className="fmt-alert">
            <Icon name="users" /> Convide amigos para acompanhar e participar do desafio.
          </p>
          {friends.length ? (
            <div className="invite-chips">
              {friends.map((id) => {
                const person = userOf(data, id);
                const on = invited.includes(id);
                return (
                  <button
                    type="button"
                    className={`invite-chip${on ? ' on' : ''}`}
                    key={id}
                    onClick={() => actions.toggleDraftInvite(id)}
                    aria-pressed={on}
                  >
                    <Avatar user={person} size={22} />
                    <span>{person.name.split(' ')[0]}</span>
                    {on ? <Icon name="check" /> : <Icon name="plus" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="muted sm">
              Siga pessoas para poder convidá-las para os seus desafios.
            </p>
          )}
        </div>
      ) : null}

      {format === 'reactions' ? (
        <div className="fmt-fields">
          <div className="react-choice">
            {REACTION_CHOICES.map((emoji) => {
              const on = (draft.reactions || DEFAULT_REACTIONS).includes(emoji);
              return (
                <button
                  type="button"
                  key={emoji}
                  className={on ? 'on' : ''}
                  onClick={() => actions.toggleDraftReaction(emoji)}
                  aria-pressed={on}
                  aria-label={`${on ? 'Remover' : 'Adicionar'} reação ${emoji}`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
          <p className="muted sm">
            {(draft.reactions || DEFAULT_REACTIONS).length} de 8 reações escolhidas.
          </p>
        </div>
      ) : null}

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
  const { data } = useApp();
  const list = data.posts
    .filter((p) => p.kind !== 'story')
    .sort((a, b) => b.ts - a.ts);

  return (
    <>
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
