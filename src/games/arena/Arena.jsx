import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { userOf } from '../../lib/selectors';
import * as remote from '../../lib/remote';
import { ago, fmt } from '../../lib/utils';
import { useApp } from '../../store/AppContext';
import ArenaGame from './ArenaGame';
import useArena from './useArena';
import { fetchRooms } from './net';

const clock = (ms) => {
  const total = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const userFromPlayer = (player) => ({
  id: player.id,
  name: player.name,
  handle: player.handle,
  avatar: player.avatar,
});

function shareUrl(code) {
  return `${location.origin}${location.pathname}#conexoes/arena/${encodeURIComponent(code || '')}`;
}

function SectionHead({ icon, title, note, children }) {
  return (
    <div className="arena-section-head">
      <div className="row">
        {icon ? (
          <span className="arena-section-icon">
            <Icon name={icon} />
          </span>
        ) : null}
        <div>
          <h3>{title}</h3>
          {note ? <p className="muted sm">{note}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function CopyButton({ value, notify, label = 'Copiar código' }) {
  return (
    <button
      type="button"
      className="btn ghost sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          notify?.('Código copiado');
        } catch {
          notify?.('Não foi possível copiar. Selecione o código manualmente.');
        }
      }}
    >
      <Icon name="copy" /> {label}
    </button>
  );
}

function Ranking({ period, setPeriod, ranking, loading, meId }) {
  return (
    <div className="card arena-ranking">
      <SectionHead icon="trophy" title="Ranking" note="Partidas reais da Arena">
        <div className="seg">
          <button
            type="button"
            className={period === 'week' ? 'on' : ''}
            onClick={() => setPeriod('week')}
          >
            Semana
          </button>
          <button
            type="button"
            className={period === 'all' ? 'on' : ''}
            onClick={() => setPeriod('all')}
          >
            Geral
          </button>
        </div>
      </SectionHead>
      {loading ? (
        <p className="muted" style={{ padding: 16 }}>
          Carregando ranking…
        </p>
      ) : ranking.length ? (
        <ol className="arena-rank-list">
          {ranking.slice(0, 10).map((entry, index) => (
            <li key={entry.userId} className={entry.userId === meId ? 'me' : ''}>
              <span className={`arena-rank-pos p${index + 1}`}>{index + 1}</span>
              <Avatar
                user={{ id: entry.userId, name: entry.name, handle: entry.handle }}
                size={30}
              />
              <span className="grow">
                <strong>{entry.name}</strong>
                <small>@{entry.handle || 'fluxo'}</small>
              </span>
              <span className="arena-rank-points">
                {fmt(entry.points)}
                <small>pts</small>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted" style={{ padding: 16 }}>
          Ainda sem partidas nesta categoria. Jogue para entrar no ranking.
        </p>
      )}
    </div>
  );
}

function InviteList({ code }) {
  const { data, actions } = useApp();
  const friends = useMemo(() => {
    const ids = data?.follows || [];
    return ids
      .map((id) => userOf(data, id))
      .filter(Boolean)
      .slice(0, 24);
  }, [data]);
  const link = shareUrl(code);
  return (
    <div className="arena-invites">
      <SectionHead
        icon="users"
        title="Convidar amigos"
        note="O convite chega no chat do FluXo."
      />
      <div className="arena-invite-link">
        <code>{code}</code>
        <CopyButton value={link} notify={actions.notify} label="Copiar link" />
      </div>
      {friends.length ? (
        <div className="arena-friends">
          {friends.map((friend) => (
            <div className="arena-friend" key={friend.id}>
              <Avatar user={friend} size={32} />
              <span className="grow">
                <strong>{friend.name}</strong>
                <small>@{friend.handle || 'fluxo'}</small>
              </span>
              <button
                type="button"
                className="btn tonal sm"
                onClick={() => actions.inviteToArena(friend.id, code)}
              >
                Convidar
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted sm" style={{ padding: '0 4px 8px' }}>
          Siga alguém no Feed para convidar pelo chat. Você também pode copiar o
          link acima.
        </p>
      )}
    </div>
  );
}

function ArenaChat({ messages, onSend, notify }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);
  return (
    <div className="arena-chat">
      <div className="arena-chat-list" ref={listRef}>
        {messages.length ? (
          messages.map((message) => (
            <p key={message.id}>
              <strong>{message.name}</strong> {message.text}
            </p>
          ))
        ) : (
          <p className="muted sm">Nenhuma mensagem ainda.</p>
        )}
      </div>
      <form
        className="arena-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          const clean = text.trim();
          if (!clean) return;
          const ok = onSend?.(clean);
          if (ok === false) notify?.('Aguarde um instante para enviar outra mensagem.');
          setText('');
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Mensagem rápida…"
          maxLength={80}
        />
        <button type="submit" className="btn tonal sm" aria-label="Enviar">
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}

function Lobby({ arena, onLeave, notify }) {
  const { view, sessionId, send } = arena;
  const isHost = view.hostId === sessionId;
  const connected = view.players.filter((player) => player.connected);
  const others = connected.filter((player) => player.key !== view.hostId);
  const canStart = connected.length >= 2 && others.every((player) => player.ready);
  const me = view.me;
  return (
    <div className="arena-screen arena-lobby">
      <div className="card arena-lobby-head">
        <button type="button" className="arena-icon-btn" onClick={onLeave} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <div className="grow">
          <span className="pill acc">
            <Icon name={view.visibility === 'private' ? 'lock' : 'globe'} />
            {view.visibility === 'private' ? 'Sala privada' : 'Sala pública'}
          </span>
          <h2>
            Sala <strong>{view.roomCode}</strong>
          </h2>
          <p className="muted sm">
            {view.players.length}/{view.maxPlayers} jogadores • Último sobrevivente
          </p>
        </div>
        <CopyButton value={shareUrl(view.roomCode)} notify={notify} label="Copiar convite" />
        <button type="button" className="btn ghost sm" onClick={onLeave}>
          Sair
        </button>
      </div>

      <div className="arena-lobby-grid">
        <div className="card arena-roster">
          <SectionHead
            icon="users"
            title="Jogadores"
            note={isHost ? 'Você é o anfitrião.' : 'Marque que está pronto.'}
          >
            <span className="pill">
              {view.players.length}/{view.maxPlayers}
            </span>
          </SectionHead>
          <div className="arena-player-grid">
            {view.players.map((player) => {
              const host = player.key === view.hostId;
              return (
                <div
                  className={`arena-player ${player.ready ? 'ready' : ''} ${
                    player.connected ? '' : 'off'
                  }`}
                  key={player.key}
                >
                  <Avatar user={userFromPlayer(player)} size={44} />
                  <span className="grow">
                    <strong>
                      {player.name}
                      {host ? <span className="arena-crown"> ★</span> : null}
                    </strong>
                    <small>
                      {player.isBot
                        ? 'IA • treino'
                        : player.connected
                          ? `@${player.handle || 'fluxo'}`
                          : 'Reconectando…'}
                    </small>
                  </span>
                  {player.ready ? (
                    <span className="arena-ready on">PRONTO</span>
                  ) : (
                    <span className="arena-ready">
                      {player.connected ? 'AGUARDANDO' : 'OFFLINE'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="arena-lobby-actions">
            {isHost ? (
              <>
                <button
                  type="button"
                  className="btn primary grow"
                  disabled={!canStart}
                  onClick={() => send('start')}
                >
                  <Icon name="play" /> Iniciar partida
                </button>
                <span className="muted sm">
                  {canStart
                    ? 'Todos prontos. Pode começar!'
                    : others.some((player) => !player.ready)
                      ? 'Aguardando todos marcarem "Estou pronto".'
                      : 'Convide pelo menos mais um jogador.'}
                </span>
              </>
            ) : (
              <button
                type="button"
                className={`btn grow ${me?.ready ? 'ghost' : 'primary'}`}
                onClick={() => send('ready', { ready: !me?.ready })}
              >
                <Icon name={me?.ready ? 'x' : 'check'} />
                {me?.ready ? 'Cancelar pronto' : 'Estou pronto'}
              </button>
            )}
          </div>
        </div>

        <div className="arena-side">
          <div className="card" style={{ padding: 16 }}>
            <InviteList code={view.roomCode} />
          </div>
          <div className="card" style={{ padding: 16 }}>
            <SectionHead icon="chat" title="Chat da sala" />
            <ArenaChat
              messages={arena.chatMessages}
              notify={notify}
              onSend={(text) => {
                send('chat', { text });
                return true;
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerResultRow({ player }) {
  return (
    <tr className={player.isWinner ? 'winner' : ''}>
      <td>#{player.rank || '-'}</td>
      <td>
        <span className="arena-result-name">
          <Avatar
            user={{ id: player.id, name: player.name, handle: player.handle, avatar: player.avatar }}
            size={26}
          />
          {player.name}
        </span>
      </td>
      <td>{player.kills || 0}</td>
      <td>{fmt(player.damage || 0)}</td>
      <td>{clock(player.survivedMs || 0)}</td>
    </tr>
  );
}

function ResultOverlay({ result, view, isHost, saved, onShare, onRematch, onLeave, shared }) {
  const meId = view.me?.id;
  const meRow =
    result?.players?.find((player) => player.id === meId) ||
    result?.players?.find((player) => player.name === view.me?.name);
  const placement = meRow?.rank || 0;
  const isWinner = placement === 1;
  return (
    <div className="arena-result-wrap">
      <div className="card arena-result">
        <span className={`pill ${isWinner ? 'sun' : 'acc'}`}>
          <Icon name={isWinner ? 'trophy' : 'skull'} />
          {isWinner ? 'Vitória' : 'Fim da partida'}
        </span>
        <h2>
          {isWinner
            ? 'Você é o último sobrevivente!'
            : placement
              ? `Você ficou em ${placement}º lugar`
              : 'Partida encerrada'}
        </h2>
        <p className="muted">
          {result?.reason ? `Encerrada por ${result.reason}.` : 'Boa partida!'}{' '}
          {result?.winnerName && !isWinner ? `Campeão: ${result.winnerName}.` : ''}
        </p>
        {result?.training ? (
          <p className="muted sm">Partida de treino contra a IA — não entra no ranking.</p>
        ) : null}

        <div className="arena-result-stats">
          <div>
            <strong>{placement ? `#${placement}` : '-'}</strong>
            <span>Posição</span>
          </div>
          <div>
            <strong>{meRow?.kills || 0}</strong>
            <span>Eliminações</span>
          </div>
          <div>
            <strong>{fmt(meRow?.damage || 0)}</strong>
            <span>Dano</span>
          </div>
          <div>
            <strong>{clock(meRow?.survivedMs || 0)}</strong>
            <span>Tempo vivo</span>
          </div>
        </div>

        <div className="arena-result-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Jogador</th>
                <th>Abates</th>
                <th>Dano</th>
                <th>Tempo</th>
              </tr>
            </thead>
            <tbody>
              {(result?.players || [])
                .slice()
                .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                .map((player) => (
                  <PlayerResultRow key={`${player.id}-${player.rank}`} player={player} />
                ))}
            </tbody>
          </table>
        </div>

        <div className="row wrap arena-result-actions">
          <button type="button" className="btn primary" onClick={onShare} disabled={shared}>
            <Icon name="share" /> {shared ? 'Compartilhado' : 'Compartilhar no Feed'}
          </button>
          {isHost ? (
            <button type="button" className="btn tonal" onClick={onRematch}>
              <Icon name="flip" /> Jogar novamente
            </button>
          ) : (
            <span className="muted sm">Aguarde o anfitrião iniciar a revanche.</span>
          )}
          <button type="button" className="btn ghost" onClick={onLeave}>
            Sair da sala
          </button>
        </div>
        {saved === false ? (
          <p className="muted sm">
            O resultado não foi salvo no histórico. O servidor da Arena precisa de
            SUPABASE_SERVICE_ROLE_KEY e da migração supabase/migrate_arena.sql.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Playing({ arena, onLeave, notify, controlsRef, touch }) {
  const { view, events, chatMessages, result, saved, dropped, send, sessionId } = arena;
  const [chatOpen, setChatOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const [dead, setDead] = useState(false);
  const deadRef = useRef(false);

  useEffect(() => {
    deadRef.current = false;
    setDead(false);
    setShared(false);
    setChatOpen(false);
  }, [view.matchId]);

  const onAlive = useCallback(() => {
    if (!deadRef.current) return;
    deadRef.current = false;
    setDead(false);
  }, []);
  const onDead = useCallback(() => {
    if (deadRef.current) return;
    deadRef.current = true;
    setDead(true);
  }, []);

  const viewRef = useRef(view);
  viewRef.current = view;
  const getState = useCallback(() => viewRef.current, []);

  const me = view.me;
  const alive = view.players.filter((player) => player.alive).length;
  const isHost = view.hostId === sessionId;
  const now = Date.now();
  const dashLeft = me ? Math.max(0, (me.dashReadyAt - now) / 1000) : 0;
  const fireLeft = me ? Math.max(0, (me.fireReadyAt - now) / 1000) : 0;

  const confirmLeave = () => {
    if (view.phase === 'playing' && !window.confirm('Sair da partida em andamento?')) return;
    onLeave();
  };

  const meRow =
    result?.players?.find((player) => player.id === me?.id) ||
    result?.players?.find((player) => player.name === me?.name);

  return (
    <div className={`arena-play ${view.phase}`}>
      <ArenaGame
        ref={controlsRef}
        getState={getState}
        sendInput={arena.sendInput}
        onAlive={onAlive}
        onDead={onDead}
        myId={me?.id}
        paused={view.phase === 'ended'}
      />

      <div className="arena-hud">
        <div className="arena-hud-top">
          <button
            type="button"
            className="arena-icon-btn"
            onClick={confirmLeave}
            aria-label="Sair da partida"
          >
            <Icon name="back" />
          </button>
          <span className="arena-timer">
            <Icon name="clock" /> {clock(view.timeLeft)}
          </span>
          <span className="pill">
            <Icon name="users" /> {alive}/{view.players.length}
          </span>
          <span className="pill arena-room-pill">
            <Icon name="game" /> {view.roomCode}
          </span>
          <span className="grow" />
          <button
            type="button"
            className={`arena-icon-btn ${chatOpen ? 'on' : ''}`}
            onClick={() => setChatOpen((open) => !open)}
            aria-label="Chat da partida"
          >
            <Icon name="chat" />
          </button>
        </div>

        <div className="arena-feed">
          {events.slice(-6).map((event) => (
            <span key={event.id} className={`arena-feed-line ${event.tone || 'info'}`}>
              {event.text}
            </span>
          ))}
        </div>

        <div className="arena-hud-bottom">
          <div className="arena-vitals">
            <div className="arena-hp">
              <span
                style={{
                  width: `${Math.max(0, Math.min(100, ((me?.hp || 0) / (me?.maxHp || 100)) * 100))}%`,
                }}
              />
            </div>
            <div className="arena-vitals-row">
              <span>
                {me?.hp || 0}/{me?.maxHp || 100} HP
              </span>
              <span>
                <Icon name="sword" /> {me?.kills || 0}
              </span>
              <span>
                <Icon name="chart" /> {fmt(me?.damage || 0)}
              </span>
            </div>
          </div>

          <div className="arena-abilities">
            <button
              type="button"
              className={`arena-ability dash ${dashLeft > 0 ? 'cooling' : ''}`}
              onClick={() => controlsRef.current?.dash()}
              disabled={dashLeft > 0 || !me?.alive}
            >
              <Icon name="flash" />
              <span>DASH</span>
              <small>{dashLeft > 0 ? `${dashLeft.toFixed(1)}s` : 'Pronto'}</small>
            </button>
            <button
              type="button"
              className={`arena-ability fire ${fireLeft > 0 ? 'cooling' : ''}`}
              onClick={() => controlsRef.current?.fire()}
              disabled={fireLeft > 0 || !me?.alive}
            >
              <Icon name="sword" />
              <span>ATIRAR</span>
              <small>{fireLeft > 0 ? `${fireLeft.toFixed(1)}s` : 'Pronto'}</small>
            </button>
          </div>
        </div>
      </div>

      {view.phase === 'countdown' ? (
        <div className="arena-countdown-overlay">
          <span className="pill acc">A partida começa em</span>
          <strong>{view.countdown || 3}</strong>
          <p className="muted sm">Último sobrevivente vence. A zona fecha!</p>
        </div>
      ) : null}

      {dead && view.phase === 'playing' && !result ? (
        <div className="arena-dead-banner">
          <Icon name="skull" /> Você foi eliminado. Assistindo até o fim.
        </div>
      ) : null}

      {dropped ? (
        <div className="arena-reconnect">
          <span className="arena-spinner" /> Reconectando à arena…
        </div>
      ) : null}

      {chatOpen ? (
        <div className="card arena-chat-drawer">
          <SectionHead icon="chat" title="Chat" />
          <ArenaChat
            messages={chatMessages}
            notify={notify}
            onSend={(text) => {
              send('chat', { text });
              return true;
            }}
          />
        </div>
      ) : null}

      {touch && !result ? (
        <div className="arena-touch">
          <button
            type="button"
            className="arena-touch-btn dash"
            onPointerDown={(event) => {
              event.preventDefault();
              controlsRef.current?.dash();
            }}
          >
            <Icon name="flash" /> DASH
          </button>
          <button
            type="button"
            className="arena-touch-btn fire"
            onPointerDown={(event) => {
              event.preventDefault();
              controlsRef.current?.fire();
            }}
          >
            <Icon name="sword" /> ATIRAR
          </button>
        </div>
      ) : null}

      {result ? (
        <ResultOverlay
          result={result}
          view={view}
          isHost={isHost}
          saved={saved}
          shared={shared}
          onShare={() => {
            if (shared) return;
            arena.onShareResult?.({
              placement: meRow?.rank || 0,
              total: view.players.length,
              kills: meRow?.kills || 0,
              damage: meRow?.damage || 0,
              winnerName: result.winnerName || '',
              code: view.roomCode,
              matchId: view.matchId,
            });
            setShared(true);
          }}
          onRematch={() => send('rematch')}
          onLeave={onLeave}
        />
      ) : null}
    </div>
  );
}

export default function Arena({ code = '' }) {
  const { data, actions, session } = useApp();
  const profile = data?.me;
  const notify = actions.notify;
  const arena = useArena({ profile, notify });
  const { view, status } = arena;

  const [prefillCode, setPrefillCode] = useState(code || '');
  const [createOpen, setCreateOpen] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [mode, setMode] = useState('friends');
  const [botLevel, setBotLevel] = useState('normal');
  const [period, setPeriod] = useState('week');
  const [ranking, setRanking] = useState([]);
  const [rankLoading, setRankLoading] = useState(true);
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState('');
  const [shareResult, setShareResult] = useState(null);

  const autoRef = useRef('');
  const controlsRef = useRef(null);
  const touch = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof matchMedia !== 'undefined' &&
      matchMedia('(pointer: coarse)').matches,
    []
  );

  useEffect(() => {
    if (code) setPrefillCode(code);
  }, [code]);

  useEffect(() => {
    if (!code || autoRef.current === code) return;
    autoRef.current = code;
    if (!arena.configured) return;
    arena.joinCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, arena.configured]);

  useEffect(() => {
    let active = true;
    setRankLoading(true);
    remote
      .loadArenaRanking(period)
      .then((list) => {
        if (active) setRanking(list);
      })
      .catch(() => {
        if (active) setRanking([]);
      })
      .finally(() => {
        if (active) setRankLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period, view?.phase]);

  const refreshRooms = useCallback(async () => {
    if (!arena.configured) return;
    setRoomsLoading(true);
    setRoomsError('');
    try {
      setRooms(await fetchRooms());
    } catch (error) {
      setRooms([]);
      setRoomsError(error?.message || 'Servidor da Arena indisponível.');
    } finally {
      setRoomsLoading(false);
    }
  }, [arena.configured]);

  useEffect(() => {
    if (view) return;
    refreshRooms();
    const timer = setInterval(refreshRooms, 12000);
    return () => clearInterval(timer);
  }, [view, refreshRooms]);

  const leave = useCallback(() => {
    arena.leave();
    setShareResult(null);
  }, [arena]);

  const openResultShare = useCallback(
    (payload) => {
      setShareResult(actions.shareArenaResult(payload));
    },
    [actions]
  );

  const meId = session?.id || data?.me?.id || '';

  if (view && view.phase === 'lobby') {
    return (
      <>
        <Lobby arena={{ ...arena, onShareResult: openResultShare }} onLeave={leave} notify={notify} />
      </>
    );
  }

  if (view && ['countdown', 'playing', 'ended'].includes(view.phase)) {
    return (
      <Playing
        arena={{ ...arena, onShareResult: openResultShare }}
        onLeave={leave}
        notify={notify}
        controlsRef={controlsRef}
        touch={touch}
      />
    );
  }

  const busy = status === 'connecting' || arena.busy;

  return (
    <div className="arena-screen arena-home">
      <section className="card arena-hero">
        <span className="arena-hero-glow" aria-hidden="true" />
        <div className="arena-hero-copy">
          <span className="pill acc">
            <Icon name="game" /> Jogos Online
          </span>
          <h1>ARENA DO CAOS</h1>
          <p>
            Batalha real 2D para 2 a 8 jogadores. Último sobrevivente vence em
            partidas de até 2 minutos e meio, com zona que fecha, obstáculos
            móveis, dash e itens. Sem ninguém online? Treine sozinho contra a IA.
          </p>
          <div className="arena-hero-tags">
            <span>
              <Icon name="users" /> 2–8 jogadores
            </span>
            <span>
              <Icon name="clock" /> 2–3 min
            </span>
            <span>
              <Icon name="trophy" /> Ranking real
            </span>
          </div>
          <div className="row wrap">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !arena.configured}
              onClick={() => arena.quickPlay()}
            >
              <Icon name="play" /> {busy ? 'Conectando…' : 'Jogar agora'}
            </button>
            <button
              type="button"
              className="btn tonal"
              disabled={busy || !arena.configured}
              onClick={() => arena.train({ bots: 3, botLevel })}
            >
              <Icon name="spark" /> Treinar com IA
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setCreateOpen((open) => !open)}
              disabled={!arena.configured}
            >
              <Icon name="plus" /> Criar sala
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => actions.closeArena()}
            >
              <Icon name="back" /> Voltar
            </button>
          </div>
        </div>
        <div className="arena-hero-art" aria-hidden="true">
          <span className="ring a" />
          <span className="ring b" />
          <span className="ring c" />
          <Icon name="game" />
        </div>
      </section>

      {!arena.configured ? (
        <div className="card arena-setup">
          <Icon name="settings" />
          <div>
            <strong>Servidor da Arena não configurado neste ambiente</strong>
            <p className="muted sm">
              Defina <code>VITE_ARENA_URL</code> e <code>VITE_ARENA_HTTP_URL</code> e
              inicie o servidor em <code>server/</code> (npm start). Para histórico e
              ranking, aplique <code>supabase/migrate_arena.sql</code> e configure as
              variáveis do Supabase no servidor.
            </p>
          </div>
        </div>
      ) : null}

      {arena.error ? (
        <div className="card arena-error">
          <Icon name="x" />
          <span className="grow">{arena.error}</span>
          <button type="button" className="btn ghost sm" onClick={() => arena.setError('')}>
            Fechar
          </button>
        </div>
      ) : null}

      <div className="arena-home-grid">
        <div className="arena-home-main">
          {createOpen ? (
            <div className="card arena-form">
              <SectionHead
                icon="plus"
                title="Criar sala"
                note="Você será o anfitrião e escolhe quando começar."
              />
              <div className="arena-form-row">
                <span>Modo</span>
                <div className="seg">
                  <button
                    type="button"
                    className={mode === 'friends' ? 'on' : ''}
                    onClick={() => setMode('friends')}
                  >
                    <Icon name="users" /> Com amigos
                  </button>
                  <button
                    type="button"
                    className={mode === 'bots' ? 'on' : ''}
                    onClick={() => setMode('bots')}
                  >
                    <Icon name="spark" /> Contra a IA
                  </button>
                </div>
              </div>
              {mode === 'friends' ? (
                <div className="arena-form-row">
                  <span>Visibilidade</span>
                  <div className="seg">
                    <button
                      type="button"
                      className={visibility === 'public' ? 'on' : ''}
                      onClick={() => setVisibility('public')}
                    >
                      <Icon name="globe" /> Pública
                    </button>
                    <button
                      type="button"
                      className={visibility === 'private' ? 'on' : ''}
                      onClick={() => setVisibility('private')}
                    >
                      <Icon name="lock" /> Privada
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="arena-form-row">
                <span>{mode === 'bots' ? 'Total (você + IA)' : 'Jogadores'}</span>
                <div className="seg">
                  {[2, 4, 6, 8].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={maxPlayers === value ? 'on' : ''}
                      onClick={() => setMaxPlayers(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              {mode === 'bots' ? (
                <div className="arena-form-row">
                  <span>Dificuldade</span>
                  <div className="seg">
                    {[
                      ['easy', 'Fácil'],
                      ['normal', 'Normal'],
                      ['hard', 'Difícil'],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={botLevel === value ? 'on' : ''}
                        onClick={() => setBotLevel(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="muted sm">
                {mode === 'bots'
                  ? `${maxPlayers - 1} adversário(s) controlado(s) pela IA. Sala privada, início automático e resultado fora do ranking.`
                  : visibility === 'private'
                    ? 'Só entra quem tiver o código ou receber o convite pelo chat.'
                    : 'A sala aparece na lista pública para qualquer pessoa entrar.'}
              </p>
              <button
                type="button"
                className="btn primary block"
                disabled={busy}
                onClick={() =>
                  mode === 'bots'
                    ? arena.train({ bots: maxPlayers - 1, botLevel })
                    : arena.createRoom({ visibility, maxPlayers })
                }
              >
                <Icon name="play" /> {mode === 'bots' ? 'Treinar agora' : 'Criar e entrar'}
              </button>
            </div>
          ) : null}

          <div className="card arena-join">
            <SectionHead
              icon="hash"
              title="Entrar com código"
              note="Recebeu um convite? Cole o código de 5 caracteres."
            />
            <form
              className="arena-join-form"
              onSubmit={(event) => {
                event.preventDefault();
                arena.joinCode(prefillCode);
              }}
            >
              <input
                value={prefillCode}
                onChange={(event) =>
                  setPrefillCode(event.target.value.toUpperCase().slice(0, 5))
                }
                placeholder="ABC12"
                maxLength={5}
                inputMode="text"
                autoCapitalize="characters"
                aria-label="Código da sala"
              />
              <button
                type="submit"
                className="btn primary"
                disabled={busy || prefillCode.trim().length < 4}
              >
                <Icon name="forward" /> Entrar
              </button>
            </form>
          </div>

          <div className="card arena-rooms">
            <SectionHead
              icon="orbit"
              title="Salas públicas"
              note="Atualizadas automaticamente."
            >
              <button
                type="button"
                className="btn ghost sm"
                onClick={refreshRooms}
                disabled={roomsLoading || !arena.configured}
              >
                <Icon name="flip" /> Atualizar
              </button>
            </SectionHead>
            {!arena.configured ? (
              <p className="muted" style={{ padding: 16 }}>
                Configure o servidor da Arena para ver salas.
              </p>
            ) : roomsLoading && !rooms.length ? (
              <p className="muted" style={{ padding: 16 }}>
                Buscando salas…
              </p>
            ) : rooms.length ? (
              <div className="arena-room-list">
                {rooms.map((room) => (
                  <button
                    type="button"
                    className="arena-room"
                    key={room.roomId}
                    onClick={() => arena.joinRoomId(room.roomId)}
                  >
                    <span className="arena-room-code">{room.code || '—'}</span>
                    <span className="grow">
                      <strong>{room.hostName || 'Sala da Arena'}</strong>
                      <small>
                        {room.playerCount}/{room.maxPlayers} jogadores • aguardando
                      </small>
                    </span>
                    <span className="pill acc">Entrar</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="arena-empty">
                <Icon name="game" />
                <strong>Nenhuma sala pública agora</strong>
                <p className="muted sm">
                  Crie uma sala ou use "Jogar agora" para entrar na fila.
                </p>
                {roomsError ? <p className="muted sm">{roomsError}</p> : null}
              </div>
            )}
          </div>
        </div>

        <div className="arena-home-side">
          <Ranking
            period={period}
            setPeriod={setPeriod}
            ranking={ranking}
            loading={rankLoading}
            meId={meId}
          />
          <div className="card arena-howto">
            <SectionHead icon="spark" title="Como jogar" />
            <ul>
              <li>
                <strong>WASD / setas</strong> movem. No celular, arraste na tela.
              </li>
              <li>
                <strong>Mouse</strong> mira. <strong>Clique</strong> ou <strong>F</strong>{' '}
                atira.
              </li>
              <li>
                <strong>Espaço</strong> ou botão <strong>Dash</strong> esquiva com
                escudo breve.
              </li>
              <li>
                Pegue <strong>cura</strong>, <strong>escudo</strong> e{' '}
                <strong>velocidade</strong>. Fuja da zona vermelha.
              </li>
            </ul>
            {shareResult ? (
              <p className="muted sm">Resultado enviado para o Feed.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
