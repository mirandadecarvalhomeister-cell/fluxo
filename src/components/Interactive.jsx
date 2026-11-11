import { useEffect, useState } from 'react';
import { art } from '../lib/art';
import {
  MAX_ANSWER,
  countAnswers,
  formatMeta,
  interactionsOfKind,
  myInteraction,
  normalizeInteractive,
  participantsOf,
  tallyVotes,
} from '../lib/interactive';
import { mediaDisplayStyle } from '../lib/mediaEdit';
import { userOf } from '../lib/selectors';
import { ago, fmt } from '../lib/utils';
import { useApp } from '../store/AppContext';
import { Avatar } from './Avatar';

function People({ rows, label, one }) {
  const { data } = useApp();
  const unique = [];
  const seen = new Set();
  rows.forEach((row) => {
    if (!row?.by || seen.has(row.by)) return;
    seen.add(row.by);
    unique.push(row);
  });
  if (!unique.length) return null;
  const names = unique
    .slice(0, 3)
    .map((row) => userOf(data, row.by).name)
    .join(', ');
  return (
    <span className="int-people" title={`${names}${unique.length > 3 ? '…' : ''}`}>
      <span className="int-avatars">
        {unique.slice(0, 4).map((row) => (
          <Avatar key={row.by} user={userOf(data, row.by)} size={22} />
        ))}
      </span>
      <span className="int-people-label">
        {fmt(unique.length)} {unique.length === 1 && one ? one : label}
      </span>
    </span>
  );
}

function Poll({ post }) {
  const { actions } = useApp();
  const { options, total } = tallyVotes(post);
  const mine = myInteraction(post, 'vote');
  const reveal = !!mine || post.by === 'me';

  return (
    <>
      <div className="poll-list" role="group" aria-label="Alternativas da enquete">
        {options.map((option) => {
          const chosen = mine?.optionId === option.id;
          return (
            <button
              type="button"
              key={option.id}
              className={`poll-opt${chosen ? ' on' : ''}${
                reveal && option.leading ? ' win' : ''
              }`}
              onClick={() => actions.votePost(post.id, option.id)}
              aria-pressed={chosen}
            >
              {reveal ? (
                <span
                  className="poll-fill"
                  style={{ width: `${Math.max(option.percent, option.count ? 2 : 0)}%` }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="poll-label">{option.label}</span>
              {reveal ? (
                <span className="poll-pct">
                  {option.percent}%
                  <small>{fmt(option.count)}</small>
                </span>
              ) : (
                <span className="poll-dot" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      <p className="int-meta">
        <People rows={interactionsOfKind(post, 'vote')} label="votaram" one="votou" />
        <span className="int-hint">
          {reveal
            ? `${fmt(total)} ${total === 1 ? 'voto' : 'votos'} · toque para trocar o seu`
            : 'Toque em uma alternativa para votar e ver os resultados'}
        </span>
      </p>
    </>
  );
}

function ImageVote({ post }) {
  const { actions } = useApp();
  const { options, total } = tallyVotes(post);
  const mine = myInteraction(post, 'vote');
  const reveal = !!mine || post.by === 'me';
  const media = post.media || [];

  return (
    <>
      <div className="imgvote" role="group" aria-label="Votação com imagens">
        {options.map((option) => {
          const item = media[option.mediaIndex];
          const chosen = mine?.optionId === option.id;
          const picture = item?.src || art(item?.seed || `${post.id}-${option.mediaIndex}`, 640, 520);
          return (
            <button
              type="button"
              key={option.id}
              className={`imgvote-opt${chosen ? ' on' : ''}${
                reveal && option.leading ? ' win' : ''
              }`}
              onClick={() => actions.votePost(post.id, option.id)}
              aria-pressed={chosen}
            >
              <span className="imgvote-pic">
                {item?.kind === 'video' && item.src ? (
                  <video
                    src={item.src}
                    muted
                    playsInline
                    preload="metadata"
                    style={mediaDisplayStyle(item.edit)}
                  />
                ) : (
                  <img
                    src={picture}
                    alt={option.label}
                    loading="lazy"
                    style={mediaDisplayStyle(item?.edit)}
                  />
                )}
                {chosen ? <span className="imgvote-check">✓</span> : null}
              </span>
              <span className="imgvote-foot">
                <b>{option.label}</b>
                {reveal ? (
                  <span className="imgvote-result">
                    <span className="imgvote-bar" aria-hidden="true">
                      <i style={{ width: `${option.percent}%` }} />
                    </span>
                    <span className="imgvote-pct">{option.percent}%</span>
                  </span>
                ) : (
                  <span className="imgvote-cta">Votar</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="int-meta">
        <People rows={interactionsOfKind(post, 'vote')} label="votaram" one="votou" />
        <span className="int-hint">
          {reveal
            ? `${fmt(total)} ${total === 1 ? 'voto' : 'votos'} · você pode trocar seu voto`
            : 'Escolha a sua imagem favorita para ver o resultado'}
        </span>
      </p>
    </>
  );
}

function Question({ post }) {
  const { data, actions } = useApp();
  const [text, setText] = useState('');
  const answers = interactionsOfKind(post, 'answer').sort((a, b) => b.ts - a.ts);
  const mine = myInteraction(post, 'answer');
  const reveal = !!mine || post.by === 'me';

  useEffect(() => {
    if (mine?.text) setText(mine.text);
  }, [mine?.id, mine?.text]);

  return (
    <>
      <form
        className="int-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          actions.answerPost(post.id, text);
          setText('');
        }}
      >
        <input
          className="in"
          type="text"
          maxLength={MAX_ANSWER}
          placeholder={mine ? 'Atualize a sua resposta…' : 'Escreva a sua resposta…'}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Sua resposta"
        />
        <button className="btn primary sm" type="submit" disabled={!text.trim()}>
          {mine ? 'Atualizar' : 'Responder'}
        </button>
      </form>
      <div className="int-answers-head">
        <b>
          {fmt(countAnswers(post))}{' '}
          {countAnswers(post) === 1 ? 'resposta' : 'respostas'}
        </b>
        <span className="int-hint">
          {reveal ? 'Atualizadas em tempo real' : 'Responda para ver o que a comunidade disse'}
        </span>
      </div>
      {reveal ? (
        answers.length ? (
          <div className="int-answers">
            {answers.map((row) => {
              const person = userOf(data, row.by);
              return (
                <div className="int-answer" key={row.id}>
                  <Avatar user={person} size={28} />
                  <div>
                    <b>{person.name}</b>{' '}
                    <span className="muted sm">{ago(row.ts)}</span>
                    <p>{row.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted sm">Nenhuma resposta ainda. Seja a primeira pessoa.</p>
        )
      ) : null}
    </>
  );
}

function Challenge({ post }) {
  const { data, actions } = useApp();
  const interactive = normalizeInteractive(post.interactive);
  const joins = participantsOf(post, 'join');
  const mine = myInteraction(post, 'join');
  const invited = interactive?.invited || [];
  const invitedMe = invited.includes('me');
  const joinedIds = new Set(joins.map((row) => row.by));
  const pending = invited.filter((id) => id !== 'me' && !joinedIds.has(id));
  const friends = (data.follows || [])
    .filter((id) => id !== 'me' && !joinedIds.has(id) && !invited.includes(id))
    .slice(0, 10);
  const [picking, setPicking] = useState(false);

  return (
    <>
      <div className="chal-top">
        <div>
          <b>
            {fmt(joins.length)}{' '}
            {joins.length === 1 ? 'participante' : 'participantes'}
          </b>
          <span className="int-hint">
            {invitedMe && !mine
              ? 'Você foi convidado a participar deste desafio.'
              : 'Entre no desafio e acompanhe quem topou.'}
          </span>
        </div>
        <button
          type="button"
          className={`btn sm ${mine ? 'tonal' : 'primary'}`}
          onClick={() => actions.joinChallenge(post.id)}
          aria-pressed={!!mine}
        >
          {mine ? 'Participando' : invitedMe ? 'Aceitar desafio' : 'Participar'}
        </button>
      </div>
      {joins.length ? (
        <div className="chal-people">
          {joins.slice(0, 8).map((row) => {
            const person = userOf(data, row.by);
            return (
              <span className="chal-person" key={row.by} title={person.name}>
                <Avatar user={person} size={30} />
                <span>{person.name.split(' ')[0]}</span>
              </span>
            );
          })}
          {joins.length > 8 ? (
            <span className="chal-more">+{joins.length - 8}</span>
          ) : null}
        </div>
      ) : null}
      {pending.length ? (
        <p className="chal-pending">
          <span className="muted sm">Convidados:</span>{' '}
          {pending.slice(0, 5).map((id) => (
            <span className="chal-tag" key={id}>
              @{userOf(data, id).handle || userOf(data, id).name}
            </span>
          ))}
        </p>
      ) : null}
      {friends.length ? (
        <div className="chal-invite">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setPicking((value) => !value)}
            aria-expanded={picking}
          >
            {picking ? 'Fechar convites' : 'Convidar amigos'}
          </button>
          {picking ? (
            <div className="chal-friends">
              {friends.map((id) => (
                <button
                  type="button"
                  className="chal-friend"
                  key={id}
                  onClick={() => actions.inviteToChallenge(post.id, id)}
                >
                  <Avatar user={userOf(data, id)} size={26} />
                  <span>{userOf(data, id).name.split(' ')[0]}</span>
                  <b>+</b>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Reactions({ post }) {
  const { actions } = useApp();
  const interactive = normalizeInteractive(post.interactive);
  const counts = post.reactionCounts || {};
  const reactions = interactive?.reactions || [];
  return (
    <>
      <div className="int-reacts" role="group" aria-label="Reações personalizadas">
        {reactions.map((emoji) => {
          const mine = post.myReaction === emoji;
          return (
            <button
              type="button"
              key={emoji}
              className={mine ? 'on' : ''}
              onClick={() => actions.reactPost(post.id, emoji)}
              aria-pressed={mine}
              title={`Reagir com ${emoji}`}
            >
              <span className="int-react-emoji">{emoji}</span>
              <span className="int-react-count">{fmt(counts[emoji] || 0)}</span>
            </button>
          );
        })}
      </div>
      <p className="int-hint">Reações escolhidas pelo autor desta publicação.</p>
    </>
  );
}

export default function Interactive({ post }) {
  const interactive = normalizeInteractive(post.interactive);
  if (!interactive) return null;
  const meta = formatMeta(interactive.format);
  const participants =
    interactive.format === 'question'
      ? countAnswers(post)
      : interactive.format === 'challenge'
        ? participantsOf(post, 'join').length
        : tallyVotes(post).total;

  return (
    <section
      className={`interactive int-${interactive.format}`}
      aria-label={`Publicação interativa: ${meta.label}`}
    >
      <div className="int-head">
        <span className={`int-badge int-badge-${interactive.format}`}>
          <svg className="ic" aria-hidden="true">
            <use href={`#i-${meta.icon}`} />
          </svg>
        </span>
        <div className="int-title">
          <b>{meta.short}</b>
          <span className="int-sub">
            {interactive.format === 'poll' || interactive.format === 'imageVote'
              ? `${fmt(participants)} ${participants === 1 ? 'voto' : 'votos'}`
              : interactive.format === 'question'
                ? `${fmt(participants)} ${participants === 1 ? 'resposta' : 'respostas'}`
                : interactive.format === 'challenge'
                  ? `${fmt(participants)} ${participants === 1 ? 'participante' : 'participantes'}`
                  : 'Toque em uma reação para participar'}
          </span>
        </div>
        {(interactive.format === 'poll' ||
          interactive.format === 'imageVote' ||
          interactive.format === 'question') && (
          <span className="int-live" title="Atualiza em tempo real">
            <i aria-hidden="true" /> ao vivo
          </span>
        )}
      </div>

      {interactive.format === 'poll' ? <Poll post={post} /> : null}
      {interactive.format === 'imageVote' ? <ImageVote post={post} /> : null}
      {interactive.format === 'question' ? <Question post={post} /> : null}
      {interactive.format === 'challenge' ? <Challenge post={post} /> : null}
      {interactive.format === 'reactions' ? <Reactions post={post} /> : null}
    </section>
  );
}
