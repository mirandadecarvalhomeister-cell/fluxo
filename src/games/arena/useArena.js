import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArenaState,
  arenaConfigured,
  getClient,
  resolveRoomCode,
} from './net';

const TOKEN_KEY = 'fluxo:arena:reconnect';
const VIEW_INTERVAL = 120;

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function writeToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* armazenamento indisponível */
  }
}

function toView(state, sessionId) {
  if (!state) return null;
  const players = [];
  state.players?.forEach((player, key) => {
    players.push({
      key,
      id: player.id,
      name: player.name || 'Jogador',
      handle: player.handle || '',
      avatar: player.avatar || '',
      x: player.x,
      y: player.y,
      aim: player.aim,
      hp: player.hp,
      maxHp: player.maxHp || 100,
      alive: !!player.alive,
      connected: !!player.connected,
      ready: !!player.ready,
      kills: player.kills,
      damage: player.damage,
      color: player.color,
      rank: player.rank,
      dashReadyAt: player.dashReadyAt,
      fireReadyAt: player.fireReadyAt,
      shieldUntil: player.shieldUntil,
      speedUntil: player.speedUntil,
      survivedMs: player.survivedMs,
      isMe: key === sessionId,
      isBot: String(player.id || key).startsWith('bot:'),
    });
  });
  const projectiles = [];
  state.projectiles?.forEach((projectile) => {
    projectiles.push({
      id: projectile.id,
      owner: projectile.owner,
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      color: projectile.color,
      life: projectile.life,
    });
  });
  const obstacles = [];
  state.obstacles?.forEach((obstacle) => {
    obstacles.push({
      id: obstacle.id,
      kind: obstacle.kind,
      x: obstacle.x,
      y: obstacle.y,
      w: obstacle.w,
      h: obstacle.h,
      vx: obstacle.vx,
      vy: obstacle.vy,
    });
  });
  const pickups = [];
  state.pickups?.forEach((pickup) => {
    pickups.push({ id: pickup.id, kind: pickup.kind, x: pickup.x, y: pickup.y });
  });
  return {
    phase: state.phase,
    roomCode: state.roomCode,
    visibility: state.visibility,
    hostId: state.hostId,
    matchId: state.matchId,
    timeLeft: state.timeLeft,
    countdown: state.countdown,
    maxPlayers: state.maxPlayers,
    playerCount: state.playerCount,
    winnerId: state.winnerId,
    winnerName: state.winnerName,
    zone: { x: state.zoneX, y: state.zoneY, r: state.zoneR },
    players,
    projectiles,
    obstacles,
    pickups,
    me: players.find((player) => player.isMe) || null,
    host: players.find((player) => player.key === state.hostId) || null,
  };
}

function errorMessage(error) {
  const raw = String(error?.message || error || 'Falha ao conectar.');
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.message) return String(parsed.message);
  } catch {
    /* mensagem simples */
  }
  return raw;
}

export function useArena({ profile, notify } = {}) {
  const [status, setStatus] = useState('idle');
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(null);
  const [dropped, setDropped] = useState(false);
  const [busy, setBusy] = useState(false);

  const roomRef = useRef(null);
  const leavingRef = useRef(false);
  const seenRef = useRef(new Set());
  const resultRef = useRef(null);

  const pushEvent = useCallback((event) => {
    if (!event?.text) return;
    setEvents((list) => {
      const id = `${event.ts || Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const next = [...list, { ...event, id }];
      return next.length > 40 ? next.slice(next.length - 40) : next;
    });
  }, []);

  const handleState = useCallback((state, sessionId) => {
    const next = toView(state, sessionId);
    if (!next) return;
    setView(next);
    if (next.phase !== 'ended' && resultRef.current) {
      resultRef.current = null;
      setResult(null);
    }
  }, []);

  const attach = useCallback(
    (room) => {
      roomRef.current = room;
      leavingRef.current = false;
      setDropped(false);
      setStatus('connected');
      setError('');
      writeToken(room.reconnectionToken);
      handleState(room.state, room.sessionId);

      room.onStateChange((state) => handleState(state, room.sessionId));
      room.onMessage('system', (payload = {}) =>
        pushEvent({ text: payload.text, tone: payload.tone || 'info', ts: Date.now() })
      );
      room.onMessage('feedback', (payload = {}) => {
        if (payload.text) {
          pushEvent({ text: payload.text, tone: 'warn', ts: Date.now() });
          notify?.(payload.text);
        }
      });
      room.onMessage('chat', (payload = {}) => {
        setChatMessages((list) => {
          const next = [
            ...list,
            {
              id: `${payload.id}-${payload.ts}-${Math.random().toString(36).slice(2, 5)}`,
              name: payload.name || 'Jogador',
              text: payload.text || '',
              ts: payload.ts || Date.now(),
            },
          ];
          return next.length > 60 ? next.slice(next.length - 60) : next;
        });
      });
      room.onMessage('eliminated', (payload = {}) => {
        pushEvent({
          text: payload.by
            ? `${payload.by} eliminou ${payload.name}`
            : `${payload.name} foi eliminado`,
          tone: 'danger',
          ts: Date.now(),
        });
      });
      room.onMessage('pickup', (payload = {}) => {
        const label =
          payload.kind === 'heal'
            ? 'cura'
            : payload.kind === 'shield'
              ? 'escudo'
              : 'velocidade';
        pushEvent({ text: `${payload.name} pegou ${label}`, tone: 'item', ts: Date.now() });
      });
      room.onMessage('countdown', () => {
        pushEvent({ text: 'A partida começa em instantes!', tone: 'info', ts: Date.now() });
      });
      room.onMessage('started', () => {
        setEvents([]);
        setChatMessages([]);
        setResult(null);
        resultRef.current = null;
        setSaved(null);
        pushEvent({ text: 'A arena está aberta. Sobreviva!', tone: 'start', ts: Date.now() });
      });
      room.onMessage('playerOffline', (payload = {}) => {
        pushEvent({
          text: `${payload.name} caiu. Aguardando reconexão (${payload.seconds}s)…`,
          tone: 'warn',
          ts: Date.now(),
        });
      });
      room.onMessage('playerOnline', (payload = {}) => {
        pushEvent({ text: `${payload.name} voltou à partida.`, tone: 'join', ts: Date.now() });
      });
      room.onMessage('playerLeft', (payload = {}) => {
        pushEvent({ text: `${payload.name} saiu da partida.`, tone: 'danger', ts: Date.now() });
      });
      room.onMessage('matchEnd', (payload = {}) => {
        resultRef.current = payload;
        setResult(payload);
        pushEvent({ text: `Fim da partida: ${payload.reason || 'encerrada'}.`, tone: 'end', ts: Date.now() });
      });
      room.onMessage('matchSaved', (payload = {}) => {
        setSaved(Boolean(payload.saved));
      });
      room.onError((code, message) => {
        setError(message || `Erro de conexão (${code}).`);
      });
      room.onDrop(() => {
        setDropped(true);
        pushEvent({ text: 'Conexão instável. Tentando reconectar…', tone: 'warn', ts: Date.now() });
      });
      room.onReconnect(() => {
        setDropped(false);
        pushEvent({ text: 'Reconectado à arena.', tone: 'join', ts: Date.now() });
      });
      room.onLeave((code) => {
        writeToken('');
        if (roomRef.current === room) roomRef.current = null;
        if (leavingRef.current) {
          leavingRef.current = false;
          return;
        }
        if (code !== 1000) {
          pushEvent({ text: 'Você saiu da arena.', tone: 'warn', ts: Date.now() });
        }
        setStatus('left');
        setView(null);
      });
    },
    [handleState, notify, pushEvent]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const room = roomRef.current;
      if (!room) return;
      handleState(room.state, room.sessionId);
    }, VIEW_INTERVAL);
    return () => clearInterval(timer);
  }, [handleState]);

  useEffect(
    () => () => {
      leavingRef.current = true;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) room.leave(true).catch(() => {});
    },
    []
  );

  const optionsFor = useCallback(
    async (extra = {}) => {
      let accessToken = null;
      try {
        const { getAccessToken } = await import('../../lib/remote');
        accessToken = await getAccessToken();
      } catch {
        accessToken = null;
      }
      return {
        ...extra,
        accessToken,
        profile: {
          name: profile?.name || '',
          handle: profile?.handle || '',
          avatar: profile?.avatar || '',
        },
      };
    },
    [profile]
  );

  const startWith = useCallback(
    async (runner, label) => {
      if (!arenaConfigured) {
        setError(
          'A Arena ainda não está configurada neste ambiente. Defina VITE_ARENA_URL e VITE_ARENA_HTTP_URL.'
        );
        setStatus('error');
        return null;
      }
      const client = getClient();
      if (!client) return null;
      setBusy(true);
      setStatus('connecting');
      setError('');
      seenRef.current = new Set();
      try {
        const room = await runner(client);
        attach(room);
        return room;
      } catch (joinError) {
        const message = errorMessage(joinError);
        setError(message);
        setStatus('error');
        notify?.(message);
        return null;
      } finally {
        setBusy(false);
        if (label) pushEvent({ text: label, tone: 'info', ts: Date.now() });
      }
    },
    [attach, notify, pushEvent]
  );

  const createRoom = useCallback(
    (opts = {}) =>
      startWith(async (client) => {
        const bots = Math.max(0, Math.min(7, Number(opts.bots) || 0));
        const options = await optionsFor({
          visibility: opts.visibility === 'private' ? 'private' : 'public',
          maxPlayers: Math.max(2, Math.min(8, Number(opts.maxPlayers) || 8)),
          bots,
          botLevel: ['easy', 'normal', 'hard'].includes(opts.botLevel)
            ? opts.botLevel
            : 'normal',
          autoStart: Boolean(opts.autoStart),
        });
        return client.create('arena', options, ArenaState);
      }),
    [optionsFor, startWith]
  );

  // Partida solo de treino: sala privada preenchida com bots, início automático
  // e sem gravar resultado no ranking.
  const train = useCallback(
    (opts = {}) => {
      const bots = Math.max(1, Math.min(7, Number(opts.bots) || 3));
      return createRoom({
        visibility: 'private',
        maxPlayers: bots + 1,
        bots,
        botLevel: opts.botLevel || 'normal',
        autoStart: true,
      });
    },
    [createRoom]
  );

  const quickPlay = useCallback(
    () =>
      startWith(async (client) => {
        const options = await optionsFor({ visibility: 'public', maxPlayers: 8 });
        return client.joinOrCreate('arena', options, ArenaState);
      }),
    [optionsFor, startWith]
  );

  const joinRoomId = useCallback(
    (roomId) =>
      startWith(async (client) => {
        const options = await optionsFor();
        return client.joinById(roomId, options, ArenaState);
      }),
    [optionsFor, startWith]
  );

  const joinCode = useCallback(
    async (code) => {
      const clean = String(code || '').trim().toUpperCase();
      if (!clean) {
        setError('Informe o código da sala.');
        return null;
      }
      let roomInfo = null;
      try {
        roomInfo = await resolveRoomCode(clean);
      } catch (resolveError) {
        setError(errorMessage(resolveError));
        setStatus('error');
        return null;
      }
      return joinRoomId(roomInfo.roomId);
    },
    [joinRoomId]
  );

  const reconnect = useCallback(async () => {
    const token = readToken();
    if (!token) return null;
    return startWith(async (client) => client.reconnect(token, ArenaState), 'Reconectando…');
  }, [startWith]);

  const leave = useCallback(() => {
    leavingRef.current = true;
    const room = roomRef.current;
    roomRef.current = null;
    writeToken('');
    setStatus('idle');
    setView(null);
    setResult(null);
    resultRef.current = null;
    setEvents([]);
    setChatMessages([]);
    setDropped(false);
    if (room) room.leave(true).catch(() => {});
  }, []);

  const send = useCallback((type, payload) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      room.send(type, payload);
    } catch {
      /* conexão caiu */
    }
  }, []);

  const sendInput = useCallback(
    (input) => {
      send('input', input);
    },
    [send]
  );

  return {
    configured: arenaConfigured,
    status,
    view,
    error,
    events,
    chatMessages,
    result,
    saved,
    dropped,
    busy,
    roomId: roomRef.current?.roomId || '',
    sessionId: roomRef.current?.sessionId || '',
    hasReconnect: Boolean(readToken()),
    createRoom,
    train,
    quickPlay,
    joinRoomId,
    joinCode,
    reconnect,
    leave,
    send,
    sendInput,
    setError,
  };
}

export default useArena;
