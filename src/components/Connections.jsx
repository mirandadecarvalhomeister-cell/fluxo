import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { art } from '../lib/art';
import { KINDS } from '../lib/seed';
import { ago, fmt, hm } from '../lib/utils';
import { isLiveKitEnabled } from '../lib/livekit';
import { userOf } from '../lib/selectors';
import { useApp } from '../store/AppContext';
import { Avatar, LiveAvatar } from './Avatar';
import { TagText, Verified } from './Brand';
import Empty from './Empty';
import { Icon } from './Icon';

const LiveStage = lazy(() => import('./LiveStage'));
const Arena = lazy(() => import('../games/arena/Arena'));

const visibleChannels = (data) =>
  data.chans.filter(
    (c) => c.live || c.joined || c.owner === 'me' || data.follows.includes(c.owner)
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
      </div>
      <div className="lbody">
        <Avatar user={owner} size={36} />
        <div className="grow">
          <b className="ell" style={{ display: 'block' }}>
            {channel.title || channel.name}
          </b>
          <span className="muted sm ell" style={{ display: 'block' }}>
            {owner.name}
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
  const kind = KINDS[channel.kind];
  return (
    <button className="chan" onClick={() => actions.openRoom(channel.id)}>
      <LiveAvatar user={owner} size={48} data={data} />
      <div className="grow">
        <b className="ell" style={{ display: 'block' }}>
          {channel.name}
        </b>
        <span className="kind">
          <Icon name={kind[0]} /> {kind[1]} · {owner.name}
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
  const kind = KINDS[channel.kind];
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

  const roomPeople = [
    channel.owner,
    ...Object.keys(data.users)
      .filter((id) => id !== channel.owner)
      .slice(0, 5),
    'me',
  ];

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
          <button
            className={`btn ${channel.joined ? 'ghost' : 'primary'}`}
            onClick={actions.joinRoom}
          >
            {channel.joined ? 'Sair do canal' : 'Entrar no canal'}
          </button>
        )}
      </div>

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
                      A próxima transmissão de {author.name} aparece aqui.
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
                        <div className="sm">{author.name}</div>
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
            <div id="roomMsgs" ref={boxRef}>
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
                        <TagText text={message.text} />
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
                        <TagText text={message.text} />
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

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
          <h2 className="h3">Na sala</h2>
          {roomPeople.map((id) => {
            const person = userOf(data, id);
            return (
              <div className="mrow" key={id}>
                <Avatar user={person} size={32} />
                <span className="ell">{person.name}</span>
                {id === channel.owner ? <span className="tagc">Criador</span> : null}
              </div>
            );
          })}
        </aside>
      </div>
    </>
  );
}

export default function Connections() {
  const { data, ui, actions } = useApp();
  const currentRoom = ui.room ? data.chans.find((c) => c.id === ui.room) : null;
  const missingRoom = Boolean(ui.room && !currentRoom);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!missingRoom) return;
    actionsRef.current.notify('Esse canal não está mais disponível.');
    actionsRef.current.clearRoom();
  }, [missingRoom]);

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

  const visible = visibleChannels(data);
  const lives = visible.filter((c) => c.live);
  const filter = ui.chanFilter;
  const list = visible.filter(
    (c) =>
      filter === 'all' ||
      (filter === 'live' && c.live) ||
      c.kind === filter
  );
  const filters = [
    ['all', 'Todos'],
    ['live', 'Ao vivo'],
    ['avisos', 'Avisos'],
    ['conversa', 'Conversas'],
  ];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Conexões</h1>
          <p className="muted">Canais, transmissões e jogos de quem você segue.</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn tonal" onClick={actions.openNewChannel}>
            <Icon name="plus" /> Criar canal
          </button>
          <button className="btn hot" onClick={actions.openLive}>
            <Icon name="radio" /> Iniciar live
          </button>
        </div>
      </div>

      <section className="card arena-entry" style={{ marginBottom: 22 }}>
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

      <section style={{ marginBottom: 22 }}>
        <h2 className="h2" style={{ marginBottom: 10 }}>
          Ao vivo agora
        </h2>
        {lives.length ? (
          <div className="hscroll">
            {lives.map((channel) => (
              <LiveCard key={channel.id} channel={channel} />
            ))}
          </div>
        ) : (
          <Empty
            title="Ninguém ao vivo agora"
            text="Quando alguém que você segue abrir um palco, ele aparece aqui."
          />
        )}
      </section>

      <section>
        <div className="sechead">
          <h2 className="h2">Canais</h2>
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
    </>
  );
}
