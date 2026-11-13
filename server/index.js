import { Server, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom } from './ArenaRoom.js';

const PORT = Number(process.env.PORT || 2567);
const HOST = String(process.env.HOST || '').trim();
// Origens permitidas (CORS). Aceita uma lista separada por vírgula, ex.:
// "https://vibefluxo.com,https://www.vibefluxo.com,https://fluxosocial.pages.dev".
// O curinga "*" libera geral (usado em desenvolvimento).
const ALLOWED_ORIGINS = String(process.env.ARENA_ALLOWED_ORIGIN || '*')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function resolveAllowedOrigin(requestOrigin) {
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  return ALLOWED_ORIGINS[0] || '*';
}

function roomSummary(room) {
  const meta = room.metadata || {};
  return {
    roomId: room.roomId,
    code: meta.code || '',
    visibility: meta.visibility || 'public',
    phase: meta.phase || 'lobby',
    playerCount: Number(room.clients || meta.playerCount || 0),
    maxPlayers: Number(room.maxClients || meta.maxPlayers || 8),
    hostName: meta.hostName || '',
  };
}

// Rotas HTTP auxiliares (health + descoberta de salas). O Colyseus entrega o
// app express real via callback; as rotas de matchmaking continuam sendo
// tratadas pelo router interno dele antes de chegar aqui.
function registerRoutes(app) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', resolveAllowedOrigin(req.headers.origin));
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true, game: 'arena-do-caos', now: Date.now() });
  });

  app.get('/arena/rooms', async (req, res) => {
    try {
      const rooms = await matchMaker.query({ name: 'arena' });
      const list = rooms
        .filter((room) => (room.metadata?.visibility || 'public') === 'public')
        .filter((room) => (room.metadata?.phase || 'lobby') === 'lobby')
        .map(roomSummary)
        .sort((a, b) => b.playerCount - a.playerCount || a.code.localeCompare(b.code));
      res.json({ rooms: list });
    } catch (error) {
      console.error('[arena] rooms error', error);
      res.status(500).json({ error: 'Não foi possível listar as salas.' });
    }
  });

  app.get('/arena/resolve', async (req, res) => {
    try {
      const code = String(req.query.code || '').trim().toUpperCase();
      if (!code) {
        res.status(400).json({ error: 'Informe o código da sala.' });
        return;
      }
      const rooms = await matchMaker.query({ name: 'arena' });
      const found = rooms.find(
        (room) => String(room.metadata?.code || '').toUpperCase() === code
      );
      if (!found) {
        res.status(404).json({ error: 'Sala não encontrada ou já encerrada.' });
        return;
      }
      res.json({ room: roomSummary(found) });
    } catch (error) {
      console.error('[arena] resolve error', error);
      res.status(500).json({ error: 'Não foi possível encontrar a sala.' });
    }
  });
}

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: registerRoutes,
});

gameServer.define('arena', ArenaRoom);

if (HOST) {
  await gameServer.listen(PORT, HOST);
} else {
  await gameServer.listen(PORT);
}
console.log(
  `[arena] Arena do Caos ouvindo em ${HOST || '0.0.0.0'}:${PORT}`
);
