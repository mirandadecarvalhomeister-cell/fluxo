import { useState } from 'react';
import {
  INTERACTIVE_FORMATS,
  MAX_OPTIONS,
  MAX_SCHEDULE_MINUTES,
  RESULT_RELEASE_OPTIONS,
  SCHEDULE_UNITS,
  formatMeta,
  isSchedulable,
  scheduleFromDraft,
  scheduleSummary,
} from '../lib/interactive';
import {
  FEED_FORMATS,
  FEED_MODES,
  applyFeedPreferences,
  communityActivity,
  communityAffinity,
  feedPrefs,
  interestTerms,
  spontaneousTopics,
} from '../lib/feed';
import { MAX_POST_MEDIA } from '../lib/media';
import { commIcon } from '../lib/art';
import { mediaDisplayStyle } from '../lib/mediaEdit';
import { userOf } from '../lib/selectors';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';
import Empty from './Empty';
import { Icon } from './Icon';
import MediaEditor, { EditOverlay } from './MediaEditor';
import MentionField from './MentionField';
import Post from './Post';
import PostComposerTrigger from './PostComposerTrigger';
import RichTextTools from './RichTextTools';
import MediaManager from './MediaManager';

export function Composer({ inModal = false }) {
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
  const joinedComms = (data.comms || []).filter((item) => item.joined);

  const placeholder =
    format === 'poll'
      ? `Faça uma pergunta para a galera votar, ${first}…`
      : format === 'imageVote'
          ? 'Qual é a melhor? Descreva a votação…'
          : format === 'challenge'
            ? `Qual desafio você propõe, ${first}?`
            : `O que está rolando no seu fluxo, ${first}? Use @ para mencionar alguém.`;

  return (
    <form
      className={inModal ? 'composer composer-in-modal' : 'card composer'}
      onSubmit={(event) => {
        event.preventDefault();
        actions.publish(draft.text);
        if (inModal) actions.closeModal();
      }}
    >
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Avatar user={data.me} size={44} />
        <MentionField
          multiline
          id="ctext"
          rows={2}
          maxLength={600}
          placeholder={placeholder}
          value={draft.text}
          onChange={(next) => actions.setDraftText(next)}
        />
      </div>
      <RichTextTools
        value={draft.text}
        onChange={(next) => actions.setDraftText(next)}
      />

      <div className="fmt-tabs" role="tablist" aria-label="Formato da publicação">
        {INTERACTIVE_FORMATS.map((item) => (
          <button
            type="button"
            role="tab"
            key={item.id}
            data-format={item.id}
            className={format === item.id ? 'on' : ''}
            aria-selected={format === item.id}
            onClick={() => actions.setDraftFormat(item.id)}
            title={item.hint}
          >
            <span className="fmt-ic">
              <Icon name={item.icon} />
            </span>
            <span className="fmt-name">{item.short}</span>
          </button>
        ))}
      </div>
      <p className="fmt-hint">{meta.hint}</p>

      {isSchedulable(format) ? (
        <div className="sched">
          <div className="sched-tabs" role="tablist" aria-label="Modo da publicação">
            <button
              type="button"
              role="tab"
              aria-selected={draft.schedule?.mode !== 'scheduled'}
              className={draft.schedule?.mode !== 'scheduled' ? 'on' : ''}
              onClick={() => actions.setDraftSchedule({ mode: 'now' })}
            >
              Publicação comum
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={draft.schedule?.mode === 'scheduled'}
              className={draft.schedule?.mode === 'scheduled' ? 'on' : ''}
              onClick={() => actions.setDraftSchedule({ mode: 'scheduled' })}
            >
              Publicação programada
            </button>
          </div>

          {draft.schedule?.mode === 'scheduled' ? (
            <>
              <div className="sched-row">
                <label htmlFor="sched-duration">Encerra em</label>
                <input
                  id="sched-duration"
                  className="in sched-num"
                  type="number"
                  min="1"
                  max={
                    (draft.schedule?.durationUnit || 'minutes') === 'hours'
                      ? MAX_SCHEDULE_MINUTES / 60
                      : MAX_SCHEDULE_MINUTES
                  }
                  value={draft.schedule?.durationValue ?? 30}
                  onChange={(event) =>
                    actions.setDraftSchedule({ durationValue: event.target.value })
                  }
                />
                <select
                  className="in sched-unit"
                  value={draft.schedule?.durationUnit || 'minutes'}
                  onChange={(event) =>
                    actions.setDraftSchedule({ durationUnit: event.target.value })
                  }
                  aria-label="Unidade de duração"
                >
                  {SCHEDULE_UNITS.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sched-row">
                <label htmlFor="sched-release">Resultados</label>
                <select
                  id="sched-release"
                  className="in"
                  value={draft.schedule?.releaseMinutes ?? 0}
                  onChange={(event) =>
                    actions.setDraftSchedule({ releaseMinutes: Number(event.target.value) })
                  }
                >
                  {RESULT_RELEASE_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes === 0 ? 'Liberar na hora' : `Liberar ${minutes} min depois`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="sched-summary">
                <Icon name="clock" />
                {scheduleSummary(scheduleFromDraft(draft.schedule))}
                <span className="muted sm"> · máximo de 24 horas</span>
              </p>
              <p className="muted sm">
                Participação única: cada pessoa vota ou responde uma vez e não pode
                alterar depois de enviar.
              </p>
            </>
          ) : (
            <p className="muted sm">
              Fica disponível normalmente no Fluxo, com as interações tradicionais da
              modalidade.
            </p>
          )}
        </div>
      ) : null}

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

      <MediaManager
        media={media}
        max={MAX_POST_MEDIA}
        onFiles={(files) => actions.attachMedia(files)}
        onEdit={setEditing}
        onRemove={(index) => actions.removeDraftMedia(index)}
        onReorder={(from, to) => actions.reorderDraftMedia(from, to)}
        onCover={(index) => actions.reorderDraftMedia(index, 0)}
      />

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
          {joinedComms.length ? (
            <label className="composer-comm">
              <Icon name="users" />
              <select
                value={draft.communityId || ''}
                onChange={(event) => actions.setDraftCommunity(event.target.value)}
                aria-label="Publicar em uma comunidade"
              >
                <option value="">Feed geral</option>
                {joinedComms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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

function FeedControls({ prefs, suggestions }) {
  const { actions, data } = useApp();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [commCat, setCommCat] = useState('todas');
  const categories = [...new Set((data.comms || []).map((item) => item.category).filter(Boolean))].slice(0, 8);
  const discover = suggestions.filter((item) => commCat === 'todas' || item.category === commCat);

  const toggleFormat = (id) => {
    const next = prefs.formats.includes(id)
      ? prefs.formats.filter((item) => item !== id)
      : [...prefs.formats, id];
    actions.setFeedPref({ formats: next });
  };

  return (
    <div className="feed-controls">
      <div className="feed-modes" role="tablist" aria-label="Modo de visualização do feed">
        {FEED_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={prefs.mode === mode.id}
            className={prefs.mode === mode.id ? 'on' : ''}
            onClick={() => actions.setFeedPref({ mode: mode.id })}
            title={mode.hint}
          >
            {mode.label}
          </button>
        ))}
        <span className="grow" />
        <button
          type="button"
          className={`feed-tool${filtersOpen || prefs.formats.length ? ' on' : ''}`}
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
          aria-label="Filtros de formato"
          title="Filtrar formatos"
        >
          <Icon name="filter" />
          {prefs.formats.length ? <i>{prefs.formats.length}</i> : null}
        </button>
        <button
          type="button"
          className="feed-tool"
          onClick={actions.openFeedPrefs}
          aria-label="Preferências do feed"
          title="Preferências do feed"
        >
          <Icon name="settings" />
        </button>
      </div>

      {filtersOpen ? (
        <div className="feed-filters" role="group" aria-label="Formatos exibidos">
          <button
            type="button"
            className={!prefs.formats.length ? 'on' : ''}
            onClick={() => actions.setFeedPref({ formats: [] })}
          >
            Todos
          </button>
          {FEED_FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              className={prefs.formats.includes(format.id) ? 'on' : ''}
              onClick={() => toggleFormat(format.id)}
              aria-pressed={prefs.formats.includes(format.id)}
            >
              {format.label}
            </button>
          ))}
        </div>
      ) : null}

      {suggestions.length ? (
        <div className="feed-suggest">
          <span className="feed-suggest-title">
            <Icon name="spark" /> Comunidades para descobrir
          </span>
          {categories.length ? (
            <div className="feed-suggest-cats" role="tablist" aria-label="Categorias de comunidades">
              {['todas', ...categories].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={commCat === cat}
                  className={commCat === cat ? 'on' : ''}
                  onClick={() => setCommCat(cat)}
                >
                  {cat === 'todas' ? 'Todas' : cat}
                </button>
              ))}
            </div>
          ) : null}
          <div className="feed-suggest-row">
            {discover.map((item) => (
              <button
                key={item.id}
                type="button"
                className="feed-suggest-card"
                onClick={() => actions.openComm(item.id)}
              >
                <span
                  className="feed-suggest-cover"
                  style={{ backgroundImage: `url('${commIcon(item, 240)}')` }}
                />
                <b className="ell">{item.name}</b>
                <small>
                  {item.subs} participantes · {item.activity?.level || 'Tranquila'}
                </small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SpontaneousTopics({ topics }) {
  const { actions } = useApp();
  if (!topics.length) return null;
  return (
    <div className="feed-spontaneous">
      <span className="feed-suggest-title">
        <Icon name="spark" /> Conversas virando assunto
      </span>
      <div className="feed-spontaneous-row">
        {topics.map((topic) => (
          <div className="feed-spontaneous-card" key={topic.key}>
            <b className="ell">#{topic.term}</b>
            <small>
              {topic.count} {topic.count === 1 ? 'conversa' : 'conversas'} em alta
            </small>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => actions.openNewCommFromTopic(topic.term)}
            >
              <Icon name="plus" /> Criar comunidade
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

import { ListSkeleton } from './Skeleton';

export default function Feed() {
  const { data, ui, ready, actions } = useApp();
  const [loadingMore, setLoadingMore] = useState(false);
  const prefs = feedPrefs(ui.settings);
  const followedTerms = interestTerms(data.me, data.comms);
  const commById = new Map((data.comms || []).map((item) => [item.id, item]));
  // Publicações de comunidade vivem dentro da comunidade (e do Radar quando
  // estão em alta), nunca no feed principal.
  const enriched = data.posts
    .filter((post) => (!post.communityId || post.shareToFeed) && post.kind !== 'audio')
    .map((post) => {
    const community = post.communityId ? commById.get(post.communityId) : null;
    return {
      ...post,
      communityName: community?.name,
      communityCat: community?.cat,
    };
  });
  const list = applyFeedPreferences(enriched, {
    prefs,
    follows: data.follows || [],
    comms: data.comms || [],
    terms: followedTerms,
    level: prefs.level,
  });
  const suggestions = (data.comms || [])
    .filter((item) => !item.joined && !prefs.mutedComms.includes(item.id))
    .map((item) => ({
      ...item,
      activity: communityActivity(item, enriched),
      affinity: communityAffinity(item, followedTerms),
    }))
    .sort(
      (a, b) =>
        b.affinity - a.affinity ||
        b.activity.recent - a.activity.recent ||
        b.subs - a.subs
    )
    .slice(0, 4);
  const spontaneous = spontaneousTopics(enriched, data.comms);

  return (
    <>
      <PostComposerTrigger />
      <FeedControls prefs={prefs} suggestions={suggestions} />
      {prefs.mode !== 'communities' ? (
        <SpontaneousTopics topics={spontaneous} />
      ) : null}
      {!ready ? (
        <ListSkeleton count={3} />
      ) : (
      <div className="posts">
        {list.length ? (
          list.map((post) => <Post key={post.id} post={post} />)
        ) : (
          <Empty
            title="Nada por aqui ainda"
            text={
              prefs.formats.length
                ? 'Nenhum conteúdo com esses filtros. Ajuste os formatos ou volte para todos.'
                : prefs.mode === 'communities'
                  ? 'Entre em comunidades para acompanhar as discussões delas aqui.'
                  : 'Siga mais pessoas ou explore novas comunidades para encher o seu feed.'
            }
          />
        )}
      </div>
      )}
      {ready && list.length ? (
        <div className="feed-more">
          <button
            type="button"
            className="btn"
            disabled={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              try {
                await actions.loadMoreFeed();
              } finally {
                setLoadingMore(false);
              }
            }}
          >
            {loadingMore ? 'Carregando…' : 'Carregar mais publicações'}
          </button>
        </div>
      ) : null}
    </>
  );
}
