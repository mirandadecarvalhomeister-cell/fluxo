import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { art } from '../lib/art';
import { KINDS } from '../lib/seed';
import { livePollStatus, remainingLabel } from '../lib/interactive';
import { ago, fmt, hm } from '../lib/utils';
import { useNow } from '../lib/useNow';
import { isLiveKitEnabled } from '../lib/livekit';
import { userOf } from '../lib/selectors';
import { useApp } from '../store/AppContext';
import { Avatar, LiveAvatar } from './Avatar';
import AnimatedEmoji from './AnimatedEmoji';
import { Verified } from './Brand';
import EmojiText from './EmojiText';
import Empty from './Empty';
import { Icon } from './Icon';

const LiveStage = lazy(() => import('./LiveStage'));
const Arena = lazy(() => import('../games/arena/Arena'));
const QuizBoom = lazy(() => import('../games/quiz/QuizBoom'));

const QUICK_EMOTES = ['❤️', '🔥', '👏', '😂', '🎉', '👍', '💜', '🚀'];
const liveDirectory = (data) => data.chans.filter((c) => c.live);
const followedChannels = (data) =>
  data.chans.filter(
    (c) => !c.live && (c.joined || c.owner === 'me' || data.follows.includes(c.owner))
  );

function LiveCard({ channel }) {
  const { data, actions } = useApp();
  const owner = userOf(data, channel.owner);
  return (
    <button className="card lcard" onClick={() => actions.openRoom(channel.id)}>
      <div
        className="lthumb"
        style={{ backgroundImage: `url('${art(channel.seed, 640, 400)}')` }}
      >
        <span className="glowb" />
        <span className="tl livepill">AO VIVO</span>
        <span className="tr vpill">
          <Icon name="eye" /> {fmt(channel.viewers)}
        </span>
        {channel.desc && channel.desc !== 'Transmissão ao vivo.' ? (
          <span className="tl lcat">{channel.desc}</span>
        ) : null}
      </div>
      <div className="lbody">
        <Avatar user={owner} size={36} />
        <div className="grow">
          <b className="ell" style={{ display: 'block' }}>
            {channel.title || channel.name}
          </b>
          <span className="muted sm ell" style={{ display: 'block' }}>
            {owner.name} <Verified user={owner} />
            {channel.owner === 'me' ? ' (você)' : ''}
          </span>
        </div>
      </div>
    </button>
  );
}

function ChannelRow({ channel }) {
  const { data, actions } = useApp();
  const owner = userOf(data, channel.owner);
  const last = channel.msgs[channel.msgs.length - 1];
  const kind = KINDS[channel.kind] || KINDS.conversa;
  return (
    <button className="chan" onClick={() => actions.openRoom(channel.id)}>
      <LiveAvatar user={owner} size={48} data={data} />
      <div className="grow">
        <b className="ell" style={{ display: 'block' }}>
          {channel.name}
        </b>
        <span className="kind">
          <Icon name={kind[0]} /> {kind[1]} · {owner.name} <Verified user={owner} />
          {channel.owner === 'me' ? ' (você)' : ''}
        </span>
        <div className="muted sm ell">
          {last
            ? `${userOf(data, last.by).name.split(' ')[0]}: ${last.text}`
            : channel.desc}
        </div>
      </div>
      <div className="meta">
        {channel.live ? (
          <span className="livepill">AO VIVO</span>
        ) : last ? (
          <span>{ago(last.ts)}</span>
        ) : null}
        <span>
          <Icon name="users" /> {fmt(channel.followers)}
        </span>
      </div>
    </button>
  );
}

function LivePollCard({ channel, poll }) {
  const { actions } = useApp();
  const open = livePollStatus(poll) === 'open';
  const now = useNow(open, 1000);
  const status = livePollStatus(poll, now);
  const closed = status !== 'open';
  const votes = poll.votes || [];
  const total = votes.length;
  const mine = votes.find((vote) => vote.by === 'me');
  const counts = new Map();
  votes.forEach((vote) => {
    if (!vote?.optionId) return;
    counts.set(vote.optionId, (counts.get(vote.optionId) || 0) + 1);
  });
  const top = Math.max(0, ...counts.values());
  const owner = channel.owner === 'me';

  return (
    <article className={`livepoll${poll.mode === 'fluxo' ? ' fluxo' : ''}`}>
      <header className="livepoll-head">
        <span className="livepoll-tag">
          <Icon name="chart" /> Enquete {poll.mode === 'fluxo' ? 'do Fluxo' : 'do chat'}
        </span>
        <span className={`livepoll-clock${closed ? ' closed' : ''}`}>
          <Icon name={closed ? 'lock' : 'clock'} />
          {closed
            ? 'Encerrada'
            : poll.closesAt
              ? `Fecha em ${remainingLabel(poll.closesAt - now)}`
              : 'Aberta'}
        </span>
      </header>
      <b className="livepoll-question">{poll.question}</b>
      <div className="poll-list" role="group" aria-label="Alternativas da enquete da live">
        {(poll.options || []).map((option) => {
          const count = counts.get(option.id) || 0;
          const percent = total ? Math.round((count / total) * 100) : 0;
          const chosen = mine?.optionId === option.id;
          return (
            <button
              type="button"
              key={option.id}
              className={`poll-opt${chosen ? ' on' : ''}${closed && count === top ? ' win' : ''}`}
              onClick={() => {
                if (closed || mine) return;
                actions.voteLivePoll(poll.id, option.id);
              }}
              aria-pressed={chosen}
              disabled={closed || !!mine}
            >
              {closed ? (
                <span
                  className="poll-fill"
                  style={{ width: `${Math.max(percent, count ? 2 : 0)}%` }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="poll-label">{option.label}</span>
              {closed ? (
                <span className="poll-pct">
                  {percent}%<small>{fmt(count)}</small>
                </span>
              ) : chosen ? (
                <Icon name="check" />
              ) : (
                <span className="poll-dot" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
      <div className="livepoll-foot">
        <span className="muted sm">
          {closed
            ? `${fmt(total)} ${total === 1 ? 'voto' : 'votos'} · resultado liberado`
            : mine
              ? 'Voto registrado — não pode ser alterado'
              : 'Cada pessoa vota uma vez'}
        </span>
        {poll.mode === 'fluxo' && poll.postId ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => actions.openPost(poll.postId)}
          >
            Ver no Fluxo
          </button>
        ) : null}
        {owner && !closed ? (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => actions.closeLivePoll(poll.id)}
          >
            Encerrar
          </button>
        ) : null}
      </div>
    </article>
  );
}

function NewPollForm({ channel }) {
  const { actions } = useApp();
  const [openForm, setOpenForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [mode, setMode] = useState('chat');
  const [duration, setDuration] = useState(15);
  const [unit, setUnit] = useState('minutes');

  if (!openForm) {
    return (
      <button
        type="button"
        className="btn ghost sm livepoll-new"
        onClick={() => setOpenForm(true)}
      >
        <Icon name="plus" /> Criar enquete
      </button>
    );
  }

  return (
    <form
      className="livepoll-form"
      onSubmit={(event) => {
        event.preventDefault();
        const created = actions.createLivePoll({
          question,
          options,
          mode,
          durationValue: duration,
          durationUnit: unit,
        });
        if (!created) return;
        setQuestion('');
        setOptions(['', '']);
        setMode('chat');
        setDuration(15);
        setUnit('minutes');
        setOpenForm(false);
      }}
    >
      <div className="livepoll-modes" role="tablist" aria-label="Onde a enquete aparece">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'fluxo'}
          className={mode === 'fluxo' ? 'on' : ''}
          onClick={() => setMode('fluxo')}
        >
          <b>Integrada ao Fluxo</b>
          <small>Também vira publicação no feed</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'chat'}
          className={mode === 'chat' ? 'on' : ''}
          onClick={() => setMode('chat')}
        >
          <b>Só no chat</b>
          <small>Exclusiva de quem está assistindo</small>
        </button>
      </div>

      <input
        className="in"
        type="text"
        maxLength={140}
        placeholder="Pergunta da enquete"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        aria-label="Pergunta da enquete"
      />
      {options.map((option, index) => (
        <div className="opt-row" key={index}>
          <span className={`opt-num${option.trim() ? ' filled' : ''}`}>{index + 1}</span>
          <input
            className="in"
            type="text"
            maxLength={90}
            placeholder={`Alternativa ${index + 1}`}
            value={option}
            onChange={(event) =>
              setOptions((list) =>
                list.map((item, position) => (position === index ? event.target.value : item))
              )
            }
          />
          <button
            type="button"
            className="icon-btn sm"
            aria-label={`Remover alternativa ${index + 1}`}
            disabled={options.length <= 2}
            onClick={() =>
              setOptions((list) => list.filter((_, position) => position !== index))
            }
          >
            <Icon name="x" />
          </button>
        </div>
      ))}
      {options.length < 6 ? (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setOptions((list) => [...list, ''])}
        >
          <Icon name="plus" /> Alternativa
        </button>
      ) : null}

      <div className="sched-row">
        <label htmlFor="livepoll-duration">Duração</label>
        <input
          id="livepoll-duration"
          className="in sched-num"
          type="number"
          min="1"
          max={unit === 'hours' ? 24 : 1440}
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
        <select
          className="in sched-unit"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          aria-label="Unidade de duração da enquete"
        >
          <option value="minutes">minutos</option>
          <option value="hours">horas</option>
        </select>
      </div>

      <p className="muted sm">
        Máximo de 24 horas. Cada espectador vota uma vez.
        {mode === 'chat' ? ' A enquete fecha junto com a live.' : ''}
      </p>
      <div className="row">
        <button type="button" className="btn ghost sm" onClick={() => setOpenForm(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn primary sm">
          Publicar enquete
        </button>
      </div>
    </form>
  );
}

function ChannelVideos({ channel, author }) {
  const { data, actions } = useApp();
  const ownerId = typeof channel.owner === 'string' ? channel.owner : author?.id;
  const videos = (data.posts || [])
    .filter((p) => p.kind === 'video' && (p.by === 'me' ? 'me' : p.by?.id) === ownerId)
    .sort((a, b) => b.ts - a.ts);

  if (!videos.length) {
    return (
      <section style={{ margin: '0 0 22px' }}>
        <h2 className="h2" style={{ marginBottom: 10 }}>Vídeos do canal</h2>
        <Empty
          title="Nenhum vídeo ainda"
          text={channel.owner === 'me'
            ? 'Publique um vídeo no feed e ele aparecerá aqui.'
            : 'Este canal ainda não publicou vídeos.'}
        />
      </section>
    );
  }

  return (
    <section style={{ margin: '0 0 22px' }}>
      <div className="sechead">
        <h2 className="h2">Vídeos do canal</h2>
        <span className="muted sm">{videos.length} vídeo(s)</span>
      </div>
      <div className="channel-video-grid">
        {videos.map((post) => {
          const src = post.src || post.media?.[0]?.src;
          return (
            <button
              type="button"
              key={post.id}
              className="channel-video-card"
              onClick={() => actions.openPost(post.id)}
            >
              <div className="channel-video-thumb">
                {src ? (
                  <video src={src} muted preload="metadata" playsInline />
                ) : (
                  <div className="channel-video-ph"><Icon name="video" /></div>
                )}
                <span className="channel-video-play"><Icon name="play" /></span>
              </div>
              <div className="channel-video-info">
                <b className="ell">{post.text || 'Vídeo'}</b>
                <span className="muted sm">
                  {fmt(post.likes || 0)} curtidas · {(post.comments || []).length} comentários
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Room({ channel }) {
  const { data, ui, actions } = useApp();
  const [text, setText] = useState('');
  const [hearts, setHearts] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const boxRef = useRef(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const owner = channel.owner === 'me';
  const author = userOf(data, channel.owner);
  const kind = KINDS[channel.kind] || KINDS.conversa;
  const canPost = channel.kind !== 'avisos' || owner;
  const live = channel.live;
  const liveStage = channel.kind === 'palco' && live;
  const alertOn = (ui.settings.liveChannels || []).includes(channel.id);

  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [channel.msgs.length]);

  useEffect(() => {
    if (!(owner && channel.live && ui.myLive)) {
      setElapsed(0);
      return undefined;
    }
    const start = ui.myLive.start;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [owner, channel.live, ui.myLive]);

  function support() {
    const id = Date.now() + Math.random();
    setHearts((current) => [...current, { id, left: 20 + Math.random() * 60 }]);
    setTimeout(() => {
      setHearts((current) => current.filter((heart) => heart.id !== id));
    }, 1700);
  }

  const clock =
    String(Math.floor(elapsed / 60)).padStart(2, '0') +
    ':' +
    String(elapsed % 60).padStart(2, '0');

  const subscribedCount = (data.chans.find((c) => c.id === channel.id)?.followers) || 0;

  return (
    <>
      <div className="room-head">
        <button className="icon-btn" onClick={actions.backRoom} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <LiveAvatar user={author} size={46} data={data} />
        <div className="grow">
          <h1 style={{ fontSize: '1.4rem' }}>{channel.name}</h1>
          <span className="kind">
            <Icon name={kind[0]} /> {kind[1]} · {author.name} <Verified user={author} /> ·{' '}
            {fmt(channel.followers)} participantes
          </span>
        </div>
        {!owner && channel.kind === 'palco' ? (
          <button
            className={`icon-btn bell ${alertOn ? 'on' : ''}`}
            onClick={() => actions.toggleLiveAlert(channel.id)}
            aria-pressed={alertOn}
            aria-label="Alerta de live"
            title={alertOn ? 'Desativar alerta de live' : 'Avisar quando entrar ao vivo'}
          >
            <Icon name="bell" />
          </button>
        ) : null}
        {owner && channel.kind === 'palco' ? (
          <button
            className="icon-btn"
            onClick={() => actions.openObs(channel.id)}
            aria-label="Transmitir com OBS"
            title="Transmitir com OBS"
          >
            <Icon name="screen" />
          </button>
        ) : null}
        <button
          className="icon-btn"
          onClick={() => actions.shareChannel(channel.id)}
          aria-label="Compartilhar canal"
          title="Compartilhar"
        >
          <Icon name="share" />
        </button>
        {owner ? (
          <button
            className="icon-btn danger"
            onClick={() => actions.deleteChannel(channel.id)}
            aria-label="Excluir canal"
            title="Excluir canal"
          >
            <Icon name="trash" />
          </button>
        ) : (
          <>
            <button
              className={`btn ${channel.subscribed ? 'ghost' : 'primary'}`}
              onClick={() => actions.toggleChannelSubscription(channel.id)}
            >
              {channel.subscribed ? 'Inscrito' : 'Inscrever-se'}
            </button>
            <button
              className={`btn ${channel.joined ? 'ghost' : 'tonal'}`}
              onClick={actions.joinRoom}
            >
              {channel.joined ? 'Sair' : 'Entrar'}
            </button>
          </>
        )}
      </div>

      {!live ? (
        <ChannelVideos channel={channel} author={author} />
      ) : null}

      <div className={`room-grid${liveStage ? ' room-live' : ''}`}>
        <div style={{ minWidth: 0 }}>
          {channel.kind === 'palco' &&
            (!live ? (
              <div
                className="stage off"
                style={{ backgroundImage: `url('${art(channel.seed, 960, 540)}')` }}
              >
                <div className="center">
                  <Avatar user={author} size={92} />
                </div>
                <div className="cap">
                  <div>
                    <b>Palco offline</b>
                    <div className="sm">
                      A próxima transmissão de {author.name}{' '}
                      <Verified user={author} /> aparece aqui.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {channel.livekit && isLiveKitEnabled ? (
                  <Suspense
                    fallback={
                      <div className="stage lk-stage">
                        <div className="lk-status">
                          <span className="lk-dot" /> Carregando transmissão...
                        </div>
                      </div>
                    }
                  >
                    <LiveStage
                      channel={channel}
                      owner={owner}
                      clock={clock}
                      hearts={hearts.map((heart) => (
                        <span
                          className="hf"
                          key={heart.id}
                          style={{ left: `${heart.left}%` }}
                        >
                          <Icon name="heart" className="fill" />
                        </span>
                      ))}
                    />
                  </Suspense>
                ) : (
                  <div
                    className="stage"
                    style={{ backgroundImage: `url('${art(channel.seed, 960, 540)}')` }}
                  >
                    <span className="glowb" />
                    <div className="tl">
                      <span className="livepill">AO VIVO</span>
                      <span className="vpill">{owner ? clock : ''}</span>
                    </div>
                    <div className="tr">
                      <span className="vpill">
                        <Icon name="eye" /> {fmt(channel.viewers)}
                      </span>
                    </div>
                    <div className="center">
                      <span className="ring">
                        <Avatar user={author} size={92} />
                      </span>
                    </div>
                    <div className="cap">
                      <div>
                        <b>{channel.title || channel.name}</b>
                        <div className="sm">
                          {author.name} <Verified user={author} />
                        </div>
                      </div>
                      <div className="row">
                        <div className="eq" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </div>
                    {hearts.map((heart) => (
                      <span
                        className="hf"
                        key={heart.id}
                        style={{ left: `${heart.left}%` }}
                      >
                        <Icon name="heart" className="fill" />
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className="row stage-actions"
                  style={{ margin: '-4px 0 14px', flexWrap: 'wrap' }}
                >
                  <button className="btn tonal" onClick={support}>
                    <Icon name="heart" className="fill" /> Apoiar
                  </button>
                  {owner && (
                    <>
                      <button className="btn hot" onClick={actions.endLive}>
                        Encerrar live
                      </button>
                      <span className="muted sm">
                        {channel.livekit && isLiveKitEnabled
                          ? 'Transmissão real via LiveKit. Sua câmera e microfone estão publicados.'
                          : 'Prévia simulada: câmera e microfone entram quando o site for conectado a um servidor de transmissão.'}
                      </span>
                    </>
                  )}
                </div>
              </>
            ))}

          <div className="card roomchat">
            <div className="roomchat-head">
              <Icon name="chat" />
              <b>
                {live
                  ? 'Chat ao vivo'
                  : channel.kind === 'avisos'
                    ? 'Comentários'
                    : 'Conversa'}
              </b>
              <span className="muted sm">{fmt(channel.msgs.length)}</span>
              {live ? <span className="livepill">AO VIVO</span> : null}
            </div>
            {owner && live ? <NewPollForm channel={channel} /> : null}
            <div id="roomMsgs" ref={boxRef}>
              {(channel.polls || []).slice(0, 6).map((poll) => (
                <LivePollCard key={poll.id} channel={channel} poll={poll} />
              ))}
              {channel.msgs.map((message) => {
                const person = userOf(data, message.by);
                const isOwner = message.by === channel.owner;
                if (channel.kind === 'avisos') {
                  return (
                    <article className="card notice" key={message.id}>
                      <div className="row">
                        <Avatar user={person} size={36} />
                        <div className="grow">
                          <b>
                            {person.name} <Verified user={person} />
                          </b>{' '}
                          <span className="muted sm">{ago(message.ts)}</span>
                        </div>
                      </div>
                      <p>
                        <EmojiText text={message.text} size={18} />
                      </p>
                      <div className="reacts">
                        {Object.keys(message.reacts || {}).map((emoji) => (
                          <button
                            key={emoji}
                            className={message.mine?.[emoji] ? 'on' : ''}
                            onClick={() => actions.reactNotice(channel.id, message.id, emoji)}
                          >
                            {emoji} {message.reacts[emoji]}
                          </button>
                        ))}
                      </div>
                    </article>
                  );
                }
                return (
                  <div className="rmsg" key={message.id}>
                    <Avatar user={person} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div className="rhead">
                        <b className={isOwner ? 'owner' : ''}>
                          {person.name} <Verified user={person} />
                        </b>
                        {isOwner ? <span className="tagc">Criador</span> : null}
                        <time>{hm(message.ts)}</time>
                      </div>
                      <p>
                        <EmojiText text={message.text} size={18} />
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {canPost ? (
              <div className="chat-emotes" aria-label="Emojis rápidos do chat">
                {QUICK_EMOTES.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    title={`Enviar ${emoji}`}
                    aria-label={`Inserir ${emoji}`}
                    onClick={() => {
                      setText((value) => value + emoji);
                      document.getElementById('roomIn')?.focus();
                    }}
                  >
                    <AnimatedEmoji emoji={emoji} size={22} />
                  </button>
                ))}
              </div>
            ) : null}
            {canPost ? (
              <form
                className="cform"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = text;
                  setText('');
                  actions.sendRoomMessage(value);
                }}
              >
                <input
                  className="in"
                  id="roomIn"
                  type="text"
                  maxLength={300}
                  autoComplete="off"
                  placeholder={
                    channel.kind === 'avisos' ? 'Publicar um aviso' : 'Escreva no canal'
                  }
                  aria-label="Mensagem do canal"
                  style={{ borderRadius: 999 }}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <button
                  className="btn primary"
                  type="submit"
                  aria-label="Enviar"
                  style={{ width: 46, padding: 0 }}
                >
                  <Icon name="send" />
                </button>
              </form>
            ) : (
              <p className="noteline">
                Só {author.name.split(' ')[0]} publica aqui. Reaja com um toque.
              </p>
            )}
          </div>
        </div>

        <aside className="card pad room-side">
          <h2 className="h3">Sobre {channel.kind === 'palco' ? 'a live' : 'o canal'}</h2>
          <div className="room-about">
            <Avatar user={author} size={48} data={data} />
            <div>
              <b>
                {author.name} <Verified user={author} />
              </b>
              <div className="muted sm">@{author.handle}</div>
            </div>
          </div>
          <p className="muted sm room-about-desc">
            {channel.desc || (channel.kind === 'palco' ? 'Transmissão ao vivo.' : 'Canal do Fluxo.')}
          </p>
          <div className="room-about-stats">
            <span>
              <Icon name="eye" /> {fmt(channel.viewers)} assistindo
            </span>
            <span>
              <Icon name="users" /> {fmt(subscribedCount)} seguidores
            </span>
            <span>
              <Icon name="chat" /> {fmt(channel.msgs.length)} mensagens
            </span>
            <span>
              <Icon name="chart" /> {(channel.polls || []).length} enquetes
            </span>
          </div>
        </aside>
      </div>
    </>
  );
}

export default function Connections() {
  const { data, ui, actions } = useApp();
  const [section, setSection] = useState('ao-vivo');
  const currentRoom = ui.room ? data.chans.find((c) => c.id === ui.room) : null;
  const missingRoom = Boolean(ui.room && !currentRoom);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!missingRoom) return;
    actionsRef.current.notify('Esse canal não está mais disponível.');
    actionsRef.current.clearRoom();
  }, [missingRoom]);

  if (ui.quizOpen) {
    return (
      <Suspense
        fallback={
          <div className="card" style={{ padding: 24 }}>
            Carregando o Quiz BOOM!…
          </div>
        }
      >
        <QuizBoom />
      </Suspense>
    );
  }

  if (ui.arenaCode !== null && ui.arenaCode !== undefined) {
    return (
      <Suspense
        fallback={
          <div className="card" style={{ padding: 24 }}>
            Carregando a Arena…
          </div>
        }
      >
        <Arena code={ui.arenaCode} />
      </Suspense>
    );
  }

  if (currentRoom) return <Room channel={currentRoom} />;

  const lives = liveDirectory(data);
  const channels = followedChannels(data);
  const filter = ui.chanFilter;
  const list = channels.filter(
    (c) => filter === 'all' || c.kind === filter
  );
  const filters = [
    ['all', 'Todos'],
    ['avisos', 'Avisos'],
    ['conversa', 'Conversas'],
    ['palco', 'Palcos'],
  ];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Conexões</h1>
          <p className="muted">
            Assista ao vivo, converse no chat e participe das enquetes da transmissão.
          </p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn hot" onClick={actions.openLive}>
            <Icon name="radio" /> Iniciar live
          </button>
        </div>
      </div>

      <div className="seg" style={{ margin: '0 0 16px' }}>
        <button
          className={section === 'ao-vivo' ? 'on' : ''}
          onClick={() => setSection('ao-vivo')}
        >
          Ao vivo
        </button>
        <button
          className={section === 'canais' ? 'on' : ''}
          onClick={() => setSection('canais')}
        >
          Canais
        </button>
        <button
          className={section === 'jogos' ? 'on' : ''}
          onClick={() => setSection('jogos')}
        >
          Jogos
        </button>
      </div>

      {section === 'jogos' ? (
        <div className="games-entry-grid">
          <section className="card arena-entry quiz-entry">
            <div className="arena-entry-copy">
              <span className="pill acc">
                <Icon name="game" /> Jogo rápido
              </span>
              <h3>QUIZ BOOM!</h3>
              <p className="muted sm">
                12 categorias com 100 perguntas cada, 4 alternativas e 15 segundos
                de pavio. Acerte, acumule pontos e desarme a bomba antes que ela
                estoure.
              </p>
            </div>
            <button type="button" className="btn primary" onClick={actions.openQuiz}>
              <Icon name="play" /> Jogar agora
            </button>
          </section>

          <section className="card arena-entry">
            <div className="arena-entry-copy">
              <span className="pill acc">
                <Icon name="game" /> Jogos Online
              </span>
              <h3>ARENA DO CAOS</h3>
              <p className="muted sm">
                Batalha multiplayer real para 2–8 jogadores. Último sobrevivente,
                salas públicas e privadas, ranking e resultados no Feed.
              </p>
            </div>
            <button type="button" className="btn primary" onClick={() => actions.openArena('')}>
              <Icon name="play" /> Jogar agora
            </button>
          </section>
        </div>
      ) : section === 'ao-vivo' ? (
        <section>
          <div className="sechead">
            <h2 className="h2">Ao vivo agora</h2>
            <span className="muted sm">{lives.length} transmissões</span>
          </div>
          {lives.length ? (
            <div className="live-grid">
              {lives.map((channel) => (
                <LiveCard key={channel.id} channel={channel} />
              ))}
            </div>
          ) : (
            <Empty
              title="Ninguém ao vivo agora"
              text="Entre no ar para abrir o chat e criar enquetes para quem estiver assistindo."
            />
          )}
        </section>
      ) : (
        <section>
          <div className="sechead">
            <h2 className="h2">Canais que você segue</h2>
            <div className="seg">
              {filters.map(([value, label]) => (
                <button
                  key={value}
                  className={filter === value ? 'on' : ''}
                  onClick={() => actions.setChanFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="card chans">
            {list.length ? (
              list.map((channel) => <ChannelRow key={channel.id} channel={channel} />)
            ) : (
              <p className="muted" style={{ padding: 20 }}>
                Nenhum canal neste filtro.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
