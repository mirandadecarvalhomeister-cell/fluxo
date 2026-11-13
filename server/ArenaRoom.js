import { CloseCode, Room } from 'colyseus';
import { randomUUID } from 'node:crypto';
import { ArenaState, Obstacle, Pickup, Player, Projectile } from './schema.js';
import {
  hasSupabaseAuth,
  loadProfile,
  persistMatch,
  verifyAccessToken,
} from './supabase.js';

const WIDTH = 1600;
const HEIGHT = 1000;
const MARGIN = 42;
const PLAYER_R = 22;
const TICK_MS = 33;
const MATCH_MS = 150000;
const COUNTDOWN_MS = 4000;
const RECONNECT_SECONDS = 20;
const MAX_PLAYERS = 8;
const COLORS = 6;

// Personalidade dos bots de treino: precisão da mira, distância que tentam
// manter do alvo, velocidade e frequência de dash.
const BOT_LEVELS = {
  easy: { aimError: 0.28, lead: 0.12, speed: 0.78, keep: 300, strafe: 0.35, dash: 0.12 },
  normal: { aimError: 0.13, lead: 0.3, speed: 1, keep: 360, strafe: 0.7, dash: 0.4 },
  hard: { aimError: 0.05, lead: 0.45, speed: 1.08, keep: 410, strafe: 1, dash: 0.7 },
};
const BOT_NAMES = [
  'Zé Bot',
  'Capivara IA',
  'Trovão IA',
  'Neo IA',
  'Pipoca IA',
  'Fantasma IA',
  'Turbo IA',
  'Pixel IA',
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function circleRect(x, y, r, rect) {
  const nx = clamp(x, rect.x - rect.w / 2, rect.x + rect.w / 2);
  const ny = clamp(y, rect.y - rect.h / 2, rect.y + rect.h / 2);
  return distance(x, y, nx, ny) < r;
}

function spawnPoint(index, total) {
  const angle = (Math.PI * 2 * index) / Math.max(1, total) - Math.PI / 2;
  return {
    x: WIDTH / 2 + Math.cos(angle) * 330,
    y: HEIGHT / 2 + Math.sin(angle) * 260,
  };
}

export class ArenaRoom extends Room {
  onCreate(options = {}) {
    this.maxClients = MAX_PLAYERS;
    this.autoDispose = true;
    this.patchRate = 66;
    this.state = new ArenaState();
    this.state.visibility = options.visibility === 'private' ? 'private' : 'public';
    const botCount = clamp(Math.round(num(options.bots)), 0, MAX_PLAYERS - 1);
    const botLevel = ['easy', 'normal', 'hard'].includes(options.botLevel)
      ? options.botLevel
      : 'normal';
    this.state.maxPlayers = clamp(
      Math.max(
        Math.round(num(options.maxPlayers) || MAX_PLAYERS),
        botCount > 0 ? botCount + 1 : 2
      ),
      2,
      MAX_PLAYERS
    );
    this.maxClients = this.state.maxPlayers;
    this.state.roomCode = makeCode();
    this.inputs = new Map();
    this.damageAcc = new Map();
    this.bots = new Map();
    this.autoStartBots = botCount > 0 && Boolean(options.autoStart);
    this.autoStartTimer = null;
    this.persisted = false;
    this.persisting = false;

    this.resetWorld();
    if (botCount > 0) this.spawnBots(botCount, botLevel);
    this.registerMessages();
    this.setSimulationInterval((delta) => this.tick(delta), TICK_MS);
    this.updateMetadata();
  }

  async onAuth(client, options = {}, context = {}) {
    const fallbackName =
      String(options?.profile?.name || '').trim() || 'Jogador do Fluxo';
    const fallbackHandle = String(options?.profile?.handle || '').replace(/^@/, '');
    const fallbackAvatar = String(options?.profile?.avatar || '');

    if (hasSupabaseAuth) {
      const token = options?.accessToken || context?.token || '';
      const user = await verifyAccessToken(token);
      if (!user) throw new Error('Faça login no Fluxo para jogar.');
      const profile = await loadProfile(user.id, token);
      return {
        id: user.id,
        name:
          profile?.name ||
          user.user_metadata?.name ||
          String(user.email || '').split('@')[0] ||
          'Jogador',
        handle: profile?.handle || fallbackHandle,
        avatar: profile?.avatar_url || fallbackAvatar,
        guest: false,
      };
    }

    // Modo de desenvolvimento sem Supabase configurado. A identidade não é
    // usada para resultados persistidos e cada conexão recebe um id próprio.
    return {
      id: `local:${randomUUID()}`,
      name: fallbackName,
      handle: fallbackHandle,
      avatar: fallbackAvatar,
      guest: true,
    };
  }

  onJoin(client) {
    if (this.state.phase !== 'lobby') {
      throw new Error('Esta partida já está em andamento. Entre em outra sala.');
    }
    if (this.state.players.size >= this.state.maxPlayers) {
      throw new Error('A sala está cheia.');
    }
    const auth = client.auth || {};
    for (const [, existing] of this.state.players) {
      if (!auth.guest && existing.id === auth.id) {
        throw new Error('Você já está nesta sala em outra aba ou dispositivo.');
      }
    }

    const index = this.state.players.size;
    const spawn = spawnPoint(index, this.state.maxPlayers);
    const player = new Player();
    player.id = auth.id || `local:${client.sessionId}`;
    player.name = String(auth.name || 'Jogador').slice(0, 40);
    player.handle = String(auth.handle || '').slice(0, 30);
    player.avatar = String(auth.avatar || '');
    player.x = spawn.x;
    player.y = spawn.y;
    player.color = index % COLORS;
    player.hp = player.maxHp;
    player.alive = true;
    player.connected = true;
    player.ready = false;
    this.state.players.set(client.sessionId, player);

    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.state.playerCount = this.state.players.size;
    this.inputs.set(client.sessionId, { mx: 0, my: 0, aim: 0, at: 0 });
    this.broadcast('system', {
      text: `${player.name} entrou na arena.`,
      tone: 'join',
    });
    this.updateMetadata();
    this.scheduleBotStart();
  }

  async onLeave(client, code = CloseCode.CONSENTED) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const consented = code === CloseCode.CONSENTED;

    if (
      this.state.phase === 'lobby' ||
      this.state.phase === 'ended' ||
      consented
    ) {
      if (this.state.phase === 'playing' || this.state.phase === 'countdown') {
        player.connected = false;
        this.eliminate(player, 'saiu da partida');
      }
      if (this.state.phase !== 'playing' && this.state.phase !== 'countdown') {
        this.state.players.delete(client.sessionId);
      }
      this.inputs.delete(client.sessionId);
      this.damageAcc.delete(client.sessionId);
      this.reassignHost();
      this.state.playerCount = this.state.players.size;
      this.updateMetadata();
      return;
    }

    player.connected = false;
    for (const [, projectile] of this.state.projectiles) {
      if (projectile.owner === player.id) {
        this.state.projectiles.delete(projectile.id);
      }
    }
    this.broadcast('playerOffline', {
      id: player.id,
      name: player.name,
      seconds: RECONNECT_SECONDS,
    });

    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
      player.connected = true;
      this.broadcast('playerOnline', { id: player.id, name: player.name });
    } catch {
      player.connected = false;
      this.eliminate(player, 'desconectou');
      this.broadcast('playerLeft', { id: player.id, name: player.name });
    }
  }

  onDispose() {
    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
    this.autoStartTimer = null;
    this.inputs?.clear();
    this.damageAcc?.clear();
    this.bots?.clear();
  }

  registerMessages() {
    this.onMessage('input', (client, message = {}) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive || this.state.phase !== 'playing') return;
      const now = Date.now();
      const previous = this.inputs.get(client.sessionId) || { at: 0 };
      if (now - previous.at < 18) return;

      const input = {
        mx: clamp(num(message.mx), -1, 1),
        my: clamp(num(message.my), -1, 1),
        aim: Number.isFinite(Number(message.aim))
          ? ((Number(message.aim) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
          : player.aim,
        at: now,
      };
      this.inputs.set(client.sessionId, input);
      player.aim = input.aim;
      if (message.dash) this.tryDash(player, client.sessionId, input, now);
      if (message.fire) this.tryFire(player, client.sessionId, input, now);
    });

    this.onMessage('ready', (client, message = {}) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || this.state.phase !== 'lobby') return;
      player.ready = Boolean(message.ready);
      this.updateMetadata();
    });

    this.onMessage('start', (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== 'lobby') return;
      const connected = this.connectedPlayers();
      if (connected.length < 2) {
        client.send('feedback', { text: 'Chame pelo menos mais um jogador.' });
        return;
      }
      const others = connected.filter(
        (player) => player.id !== this.state.players.get(this.state.hostId)?.id
      );
      if (others.some((player) => !player.ready)) {
        client.send('feedback', {
          text: 'Todos os convidados precisam marcar "Estou pronto".',
        });
        return;
      }
      this.startCountdown();
    });

    this.onMessage('rematch', (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== 'ended') return;
      this.resetWorld();
      for (const [sessionId, player] of this.state.players) {
        if (!player.connected) {
          this.state.players.delete(sessionId);
          continue;
        }
        this.resetPlayer(player);
        player.ready = this.bots.has(sessionId);
      }
      this.state.phase = 'lobby';
      this.state.matchId = '';
      this.state.winnerId = '';
      this.state.winnerName = '';
      this.state.playerCount = this.state.players.size;
      this.reassignHost();
      this.broadcast('system', { text: 'Nova partida pronta. Marquem "Estou pronto".', tone: 'info' });
      this.updateMetadata();
      this.scheduleBotStart(1200);
    });

    this.onMessage('chat', (client, message = {}) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const now = Date.now();
      const key = `chat:${client.sessionId}`;
      if (now - (this.damageAcc.get(key) || 0) < 700) return;
      this.damageAcc.set(key, now);
      const text = String(message.text || '').trim().slice(0, 80);
      if (!text) return;
      this.broadcast('chat', {
        id: player.id,
        name: player.name,
        text,
        ts: now,
      });
    });
  }

  // Cria adversários controlados pelo servidor (modo treino). Os bots usam os
  // mesmos campos de um jogador comum, com chaves "bot:N" em vez de sessões.
  spawnBots(count, level) {
    for (let i = 0; i < count; i += 1) {
      const key = `bot:${i + 1}`;
      const spawn = spawnPoint(this.state.players.size, this.state.maxPlayers);
      const bot = new Player();
      bot.id = key;
      bot.name = BOT_NAMES[i % BOT_NAMES.length];
      bot.x = spawn.x;
      bot.y = spawn.y;
      bot.color = this.state.players.size % COLORS;
      bot.hp = bot.maxHp;
      bot.alive = true;
      bot.connected = true;
      bot.ready = true;
      this.state.players.set(key, bot);
      this.inputs.set(key, { mx: 0, my: 0, aim: 0, at: 0 });
      this.bots.set(key, {
        level,
        seed: Math.random() * Math.PI * 2,
        strafeDir: Math.random() < 0.5 ? -1 : 1,
        nextFireAt: 0,
      });
    }
    this.state.playerCount = this.state.players.size;
  }

  scheduleBotStart(delay = 1500) {
    if (!this.autoStartBots || this.state.phase !== 'lobby') return;
    if (this.autoStartTimer) clearTimeout(this.autoStartTimer);
    this.autoStartTimer = setTimeout(() => {
      this.autoStartTimer = null;
      if (this.state.phase !== 'lobby') return;
      const hasHuman = [...this.state.players.entries()].some(
        ([key, player]) => player.connected && !this.bots.has(key)
      );
      if (!hasHuman) return;
      this.startCountdown();
    }, delay);
    if (typeof this.autoStartTimer.unref === 'function') {
      this.autoStartTimer.unref();
    }
  }

  // IA simples: escolhe o alvo vivo mais próximo, mantém distância, desvia das
  // armadilhas, foge da zona e atira quando tem linha de visão.
  updateBots(dt) {
    const now = Date.now();
    const zoneX = this.state.zoneX;
    const zoneY = this.state.zoneY;
    const zoneR = this.state.zoneR;

    this.bots.forEach((brain, key) => {
      const bot = this.state.players.get(key);
      if (!bot || !bot.alive) return;
      const cfg = BOT_LEVELS[brain.level] || BOT_LEVELS.normal;

      let target = null;
      let targetDist = Infinity;
      this.state.players.forEach((other) => {
        if (other === bot || !other.alive) return;
        const dist = distance(bot.x, bot.y, other.x, other.y);
        if (dist < targetDist) {
          targetDist = dist;
          target = other;
        }
      });

      let mx = 0;
      let my = 0;
      let aim = bot.aim;

      if (target) {
        const lead = Math.min(0.55, targetDist / 900) * cfg.lead;
        const px = target.x + clamp(num(target.vx), -400, 400) * lead;
        const py = target.y + clamp(num(target.vy), -400, 400) * lead;
        const wobble = Math.sin(now / 620 + brain.seed) * cfg.aimError;
        aim = Math.atan2(py - bot.y, px - bot.x) + wobble;

        const dx = target.x - bot.x;
        const dy = target.y - bot.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const side = Math.sin(now / 900 + brain.seed) >= 0 ? 1 : -1;

        if (dist > cfg.keep + 90) {
          mx = nx;
          my = ny;
        } else if (dist < cfg.keep - 90) {
          mx = -nx;
          my = -ny;
        } else {
          mx = -ny * side * cfg.strafe;
          my = nx * side * cfg.strafe;
        }

        const lineClear = this.hasLineOfSight(bot, target);
        if (!lineClear && dist > 150) {
          // Sem linha de visão: contorna o obstáculo em vez de empurrar a parede.
          mx += -ny * 0.9 * brain.strafeDir;
          my += nx * 0.9 * brain.strafeDir;
        }
        if (Math.random() < dt * 0.2) brain.strafeDir *= -1;

        if (
          lineClear &&
          dist < 900 &&
          now >= bot.fireReadyAt &&
          now >= brain.nextFireAt
        ) {
          brain.nextFireAt = now + 180 + Math.random() * 320;
          this.tryFire(bot, key, { aim, mx, my }, now);
        }

        if (
          dist < 270 &&
          now >= bot.dashReadyAt &&
          Math.random() < cfg.dash * dt * 3
        ) {
          this.tryDash(bot, key, { mx: -nx, my: -ny, aim }, now);
        }
      } else {
        const dx = zoneX - bot.x;
        const dy = zoneY - bot.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 60) {
          mx = dx / dist;
          my = dy / dist;
        }
        aim = Math.atan2(dy, dx);
      }

      // Não ficar tomando dano da zona.
      const zoneDist = distance(bot.x, bot.y, zoneX, zoneY);
      const safe = zoneR - 110;
      if (zoneDist > safe && zoneDist > 1) {
        const pull = Math.min(2, (zoneDist - safe) / 90);
        mx += ((zoneX - bot.x) / zoneDist) * pull;
        my += ((zoneY - bot.y) / zoneDist) * pull;
      }

      // Desviar das armadilhas móveis.
      for (let i = 0; i < this.state.obstacles.length; i += 1) {
        const obstacle = this.state.obstacles.at(i);
        if (obstacle.kind !== 'hazard') continue;
        const dist = distance(bot.x, bot.y, obstacle.x, obstacle.y);
        if (dist < 130 && dist > 0.001) {
          mx += ((bot.x - obstacle.x) / dist) * 1.4;
          my += ((bot.y - obstacle.y) / dist) * 1.4;
        }
      }

      const length = Math.hypot(mx, my);
      if (length > 1) {
        mx /= length;
        my /= length;
      }
      mx *= cfg.speed;
      my *= cfg.speed;

      this.inputs.set(key, { mx, my, aim, at: now });
      bot.aim = aim;
    });
  }

  hasLineOfSight(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 28));
    for (let i = 1; i < steps; i += 1) {
      const x = from.x + (dx * i) / steps;
      const y = from.y + (dy * i) / steps;
      for (let j = 0; j < this.state.obstacles.length; j += 1) {
        const obstacle = this.state.obstacles.at(j);
        if (obstacle.kind === 'hazard') continue;
        if (circleRect(x, y, 8, obstacle)) return false;
      }
    }
    return true;
  }

  tick(delta) {
    const dt = Math.min(120, Math.max(1, num(delta))) / 1000;

    if (this.state.phase === 'countdown') {
      this.state.countdown = Math.max(
        0,
        Math.ceil((this.countdownEndsAt - Date.now()) / 1000)
      );
      if (Date.now() >= this.countdownEndsAt) this.startPlaying();
      return;
    }

    if (this.state.phase !== 'playing') return;

    this.state.timeLeft = Math.max(0, this.timeLeftEndsAt - Date.now());
    this.updateZone(dt);
    this.updateObstacles(dt);
    this.updatePlayers(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);

    if (this.state.timeLeft <= 0) this.finishMatch('tempo esgotado');
  }

  resetWorld() {
    this.state.phase = 'lobby';
    this.state.matchId = '';
    this.state.winnerId = '';
    this.state.winnerName = '';
    this.state.startedAt = 0;
    this.state.endedAt = 0;
    this.state.timeLeft = 0;
    this.state.countdown = 0;
    this.state.zoneX = WIDTH / 2;
    this.state.zoneY = HEIGHT / 2;
    this.state.zoneR = 720;
    this.state.zoneTargetX = WIDTH / 2;
    this.state.zoneTargetY = HEIGHT / 2;
    this.state.zoneTargetR = 720;
    this.state.zoneNextAt = 0;
    this.state.obstacles.clear();
    this.state.projectiles.clear();
    this.state.pickups.clear();
    this.buildObstacles();
    this.persisted = false;
    this.persisting = false;
    this.damageAcc.clear();
  }

  resetPlayer(player) {
    const players = [...this.state.players.values()];
    const index = Math.max(0, players.indexOf(player));
    const spawn = spawnPoint(index, Math.max(2, this.state.maxPlayers));
    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.aim = 0;
    player.hp = player.maxHp;
    player.alive = true;
    player.kills = 0;
    player.damage = 0;
    player.rank = 0;
    player.dashReadyAt = 0;
    player.fireReadyAt = 0;
    player.shieldUntil = 0;
    player.speedUntil = 0;
    player.eliminatedAt = 0;
    player.survivedMs = 0;
    player.connected = true;
  }

  buildObstacles() {
    const list = [
      { id: 'w1', kind: 'wall', x: 310, y: 220, w: 190, h: 48 },
      { id: 'w2', kind: 'wall', x: 1290, y: 220, w: 190, h: 48 },
      { id: 'w3', kind: 'wall', x: 310, y: 780, w: 190, h: 48 },
      { id: 'w4', kind: 'wall', x: 1290, y: 780, w: 190, h: 48 },
      { id: 'w5', kind: 'wall', x: 750, y: 410, w: 48, h: 150 },
      { id: 'w6', kind: 'wall', x: 850, y: 440, w: 48, h: 150 },
      { id: 'b1', kind: 'barrier', x: 560, y: 470, w: 130, h: 30, vx: 120 },
      { id: 'b2', kind: 'barrier', x: 1040, y: 520, w: 130, h: 30, vx: -135 },
      { id: 'h1', kind: 'hazard', x: 420, y: 500, w: 96, h: 96, vy: 155 },
      { id: 'h2', kind: 'hazard', x: 1180, y: 500, w: 96, h: 96, vy: -170 },
    ];
    list.forEach((entry) => {
      const obstacle = new Obstacle();
      Object.assign(obstacle, entry);
      this.state.obstacles.push(obstacle);
    });
  }

  startCountdown() {
    this.state.phase = 'countdown';
    this.state.countdown = Math.ceil(COUNTDOWN_MS / 1000);
    this.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    this.state.timeLeft = MATCH_MS;
    this.state.matchId = randomUUID();
    this.state.startedAt = Date.now();
    this.state.endedAt = 0;
    this.state.winnerId = '';
    this.state.winnerName = '';
    this.persisted = false;
    this.persisting = false;
    this.state.projectiles.clear();
    this.state.pickups.clear();
    this.state.obstacles.clear();
    this.buildObstacles();
    this.state.zoneX = WIDTH / 2;
    this.state.zoneY = HEIGHT / 2;
    this.state.zoneR = 720;
    this.state.zoneTargetX = WIDTH / 2;
    this.state.zoneTargetY = HEIGHT / 2;
    this.state.zoneTargetR = 720;
    this.state.zoneNextAt = Date.now() + 12000;
    this.damageAcc.clear();
    const list = [...this.state.players.values()];
    list.forEach((player, index) => {
      const spawn = spawnPoint(index, Math.max(2, list.length));
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.hp = player.maxHp;
      player.alive = true;
      player.kills = 0;
      player.damage = 0;
      player.rank = 0;
      player.dashReadyAt = 0;
      player.fireReadyAt = 0;
      player.shieldUntil = 0;
      player.speedUntil = 0;
      player.eliminatedAt = 0;
      player.survivedMs = 0;
    });
    this.broadcast('countdown', { seconds: Math.ceil(COUNTDOWN_MS / 1000) });
    this.updateMetadata();
  }

  startPlaying() {
    this.state.phase = 'playing';
    this.state.countdown = 0;
    this.state.timeLeft = MATCH_MS;
    this.state.startedAt = Date.now();
    this.timeLeftEndsAt = Date.now() + MATCH_MS;
    this.state.zoneNextAt = Date.now() + 12000;
    this.spawnPickup();
    this.spawnPickup();
    const now = Date.now();
    this.bots.forEach((brain) => {
      brain.nextFireAt = now + 900 + Math.random() * 1500;
    });
    this.broadcast('started', { matchId: this.state.matchId });
    this.updateMetadata();
  }

  updateMetadata() {
    const host = this.state.hostId
      ? this.state.players.get(this.state.hostId)
      : null;
    this.setMetadata({
      code: this.state.roomCode,
      visibility: this.state.visibility,
      phase: this.state.phase,
      playerCount: this.state.players.size,
      maxPlayers: this.state.maxPlayers,
      hostName: host?.name || '',
      matchId: this.state.matchId || '',
    }).catch(() => {});
  }

  reassignHost() {
    if (this.state.hostId && this.state.players.has(this.state.hostId)) return;
    const next = [...this.state.players.entries()].find(
      ([key, player]) => player.connected && !this.bots.has(key)
    );
    this.state.hostId = next ? next[0] : '';
  }

  connectedPlayers() {
    const list = [];
    this.state.players.forEach((player) => {
      if (player.connected) list.push(player);
    });
    return list;
  }

  alivePlayers() {
    const list = [];
    this.state.players.forEach((player) => {
      if (player.alive) list.push(player);
    });
    return list;
  }

  updateZone(dt) {
    const now = Date.now();
    if (now >= this.state.zoneNextAt && this.state.zoneTargetR > 170) {
      this.state.zoneTargetR = Math.max(170, this.state.zoneTargetR - 78);
      const maxShift = Math.max(0, 720 - this.state.zoneTargetR) * 0.25;
      this.state.zoneTargetX = clamp(
        this.state.zoneTargetX + (Math.random() * 2 - 1) * maxShift,
        280,
        WIDTH - 280
      );
      this.state.zoneTargetY = clamp(
        this.state.zoneTargetY + (Math.random() * 2 - 1) * maxShift,
        240,
        HEIGHT - 240
      );
      this.state.zoneNextAt = now + 12000;
    }

    const lerp = Math.min(1, dt * 0.8);
    this.state.zoneX += (this.state.zoneTargetX - this.state.zoneX) * lerp;
    this.state.zoneY += (this.state.zoneTargetY - this.state.zoneY) * lerp;
    this.state.zoneR += (this.state.zoneTargetR - this.state.zoneR) * lerp;

    this.state.players.forEach((player) => {
      if (!player.alive) return;
      const outside =
        distance(player.x, player.y, this.state.zoneX, this.state.zoneY) >
        this.state.zoneR - 4;
      if (outside) this.damageOverTime(player, 18 * dt);
    });
  }

  updateObstacles(dt) {
    for (let i = 0; i < this.state.obstacles.length; i += 1) {
      const obstacle = this.state.obstacles.at(i);
      if (!obstacle.vx && !obstacle.vy) continue;
      obstacle.x += obstacle.vx * dt;
      obstacle.y += obstacle.vy * dt;
      const halfW = obstacle.w / 2;
      const halfH = obstacle.h / 2;
      if (obstacle.x - halfW < MARGIN) {
        obstacle.x = MARGIN + halfW;
        obstacle.vx = Math.abs(obstacle.vx);
      } else if (obstacle.x + halfW > WIDTH - MARGIN) {
        obstacle.x = WIDTH - MARGIN - halfW;
        obstacle.vx = -Math.abs(obstacle.vx);
      }
      if (obstacle.y - halfH < MARGIN) {
        obstacle.y = MARGIN + halfH;
        obstacle.vy = Math.abs(obstacle.vy);
      } else if (obstacle.y + halfH > HEIGHT - MARGIN) {
        obstacle.y = HEIGHT - MARGIN - halfH;
        obstacle.vy = -Math.abs(obstacle.vy);
      }
    }
  }

  updatePlayers(dt) {
    if (this.bots.size) this.updateBots(dt);
    const players = [...this.state.players.entries()];
    players.forEach(([sessionId, player]) => {
      if (!player.alive) return;
      const input = this.inputs.get(sessionId);
      let mx = input?.mx || 0;
      let my = input?.my || 0;
      const length = Math.hypot(mx, my);
      if (length > 1) {
        mx /= length;
        my /= length;
      }
      const now = Date.now();
      const speed = 265 * (now < player.speedUntil ? 1.35 : 1);
      player.vx = mx * speed;
      player.vy = my * speed;
      // A mira enviada pelo cliente (mouse/toque) tem prioridade; se não houver
      // atualização de mira válida, usa a direção do movimento.
      const hasAim = input && Number.isFinite(input.aim);
      if (hasAim) {
        player.aim = input.aim;
      } else if (length > 0.05) {
        player.aim = Math.atan2(my, mx);
      }
      this.movePlayer(player, player.vx * dt, player.vy * dt);
    });

    // Colisão suave entre personagens para impedir sobreposição.
    for (let i = 0; i < players.length; i += 1) {
      const [, a] = players[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < players.length; j += 1) {
        const [, b] = players[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const min = PLAYER_R * 2;
        if (dist >= min) continue;
        const push = (min - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x = clamp(a.x - nx * push, MARGIN, WIDTH - MARGIN);
        a.y = clamp(a.y - ny * push, MARGIN, HEIGHT - MARGIN);
        b.x = clamp(b.x + nx * push, MARGIN, WIDTH - MARGIN);
        b.y = clamp(b.y + ny * push, MARGIN, HEIGHT - MARGIN);
      }
    }

    // Dano das armadilhas móveis.
    this.state.players.forEach((player) => {
      if (!player.alive) return;
      for (let i = 0; i < this.state.obstacles.length; i += 1) {
        const obstacle = this.state.obstacles.at(i);
        if (obstacle.kind !== 'hazard') continue;
        if (circleRect(player.x, player.y, PLAYER_R, obstacle)) {
          this.damageOverTime(player, 30 * dt);
          break;
        }
      }
    });
  }

  movePlayer(player, dx, dy) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10));
    const stepX = dx / steps;
    const stepY = dy / steps;
    for (let i = 0; i < steps; i += 1) {
      player.x = clamp(player.x + stepX, MARGIN, WIDTH - MARGIN);
      player.y = clamp(player.y + stepY, MARGIN, HEIGHT - MARGIN);
      for (let j = 0; j < this.state.obstacles.length; j += 1) {
        const obstacle = this.state.obstacles.at(j);
        if (obstacle.kind === 'hazard') continue;
        if (!circleRect(player.x, player.y, PLAYER_R, obstacle)) continue;
        const nx = clamp(
          player.x,
          obstacle.x - obstacle.w / 2,
          obstacle.x + obstacle.w / 2
        );
        const ny = clamp(
          player.y,
          obstacle.y - obstacle.h / 2,
          obstacle.y + obstacle.h / 2
        );
        let ox = player.x - nx;
        let oy = player.y - ny;
        let dist = Math.hypot(ox, oy);
        if (dist === 0) {
          // Centro dentro do retângulo: empurra pelo lado mais próximo.
          if (Math.abs(stepX) > Math.abs(stepY)) ox = stepX > 0 ? -1 : 1;
          else oy = stepY > 0 ? -1 : 1;
          dist = 1;
        }
        const overlap = PLAYER_R - dist;
        if (overlap > 0) {
          player.x = clamp(
            player.x + (ox / dist) * overlap,
            MARGIN,
            WIDTH - MARGIN
          );
          player.y = clamp(
            player.y + (oy / dist) * overlap,
            MARGIN,
            HEIGHT - MARGIN
          );
        }
      }
    }
  }

  tryDash(player, sessionId, input, now) {
    if (now < player.dashReadyAt) return;
    player.dashReadyAt = now + 3200;
    player.shieldUntil = Math.max(player.shieldUntil, now + 500);
    let dx = input.mx;
    let dy = input.my;
    if (Math.hypot(dx, dy) < 0.1) {
      dx = Math.cos(input.aim || player.aim);
      dy = Math.sin(input.aim || player.aim);
    }
    const length = Math.hypot(dx, dy) || 1;
    this.movePlayer(player, (dx / length) * 150, (dy / length) * 150);
    this.broadcast('dash', { id: player.id });
  }

  tryFire(player, sessionId, input, now) {
    if (now < player.fireReadyAt) return;
    player.fireReadyAt = now + 5000;
    const aim = Number.isFinite(input.aim) ? input.aim : player.aim;
    const projectile = new Projectile();
    projectile.id = randomUUID();
    projectile.owner = player.id;
    projectile.x = player.x + Math.cos(aim) * (PLAYER_R + 8);
    projectile.y = player.y + Math.sin(aim) * (PLAYER_R + 8);
    projectile.vx = Math.cos(aim) * 640;
    projectile.vy = Math.sin(aim) * 640;
    projectile.color = player.color;
    projectile.life = 1.35;
    this.state.projectiles.set(projectile.id, projectile);
    this.broadcast('shot', { id: player.id, x: projectile.x, y: projectile.y });
  }

  updateProjectiles(dt) {
    const projectiles = [...this.state.projectiles.values()];
    projectiles.forEach((projectile) => {
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      if (
        projectile.life <= 0 ||
        projectile.x < 0 ||
        projectile.x > WIDTH ||
        projectile.y < 0 ||
        projectile.y > HEIGHT
      ) {
        this.state.projectiles.delete(projectile.id);
        return;
      }
      for (let i = 0; i < this.state.obstacles.length; i += 1) {
        const obstacle = this.state.obstacles.at(i);
        if (obstacle.kind === 'hazard') continue;
        if (circleRect(projectile.x, projectile.y, 8, obstacle)) {
          this.state.projectiles.delete(projectile.id);
          return;
        }
      }
      let hit = false;
      this.state.players.forEach((player) => {
        if (hit || !player.alive || player.id === projectile.owner) return;
        if (distance(player.x, player.y, projectile.x, projectile.y) > PLAYER_R + 8) {
          return;
        }
        hit = true;
        const owner = this.playerById(projectile.owner);
        this.applyDamage(player, 18, owner);
        if (player.alive) {
          const angle = Math.atan2(projectile.vy, projectile.vx);
          this.movePlayer(player, Math.cos(angle) * 26, Math.sin(angle) * 26);
        }
        this.broadcast('hit', { id: player.id, by: owner?.id || '' });
      });
      if (hit) this.state.projectiles.delete(projectile.id);
    });
  }

  spawnPickup() {
    if (this.state.pickups.size >= 4) return;
    const kinds = ['heal', 'shield', 'speed'];
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const x = MARGIN + 80 + Math.random() * (WIDTH - 2 * (MARGIN + 80));
      const y = MARGIN + 80 + Math.random() * (HEIGHT - 2 * (MARGIN + 80));
      if (
        distance(x, y, this.state.zoneX, this.state.zoneY) >
        this.state.zoneR - 60
      ) {
        continue;
      }
      const blocked = this.state.obstacles.some(
        (obstacle) =>
          obstacle.kind !== 'hazard' && circleRect(x, y, 36, obstacle)
      );
      if (blocked) continue;
      const pickup = new Pickup();
      pickup.id = randomUUID();
      pickup.kind = kinds[Math.floor(Math.random() * kinds.length)];
      pickup.x = x;
      pickup.y = y;
      this.state.pickups.set(pickup.id, pickup);
      return;
    }
  }

  updatePickups(dt) {
    this.pickupTimer = (this.pickupTimer || 0) + dt;
    if (this.pickupTimer >= 5) {
      this.pickupTimer = 0;
      this.spawnPickup();
    }
    const now = Date.now();
    const pickups = [...this.state.pickups.values()];
    pickups.forEach((pickup) => {
      let taken = null;
      this.state.players.forEach((player) => {
        if (taken || !player.alive) return;
        if (distance(player.x, player.y, pickup.x, pickup.y) > PLAYER_R + 22) return;
        taken = player;
      });
      if (!taken) return;
      if (pickup.kind === 'heal') {
        taken.hp = Math.min(taken.maxHp, taken.hp + 28);
      } else if (pickup.kind === 'shield') {
        taken.shieldUntil = now + 5000;
      } else {
        taken.speedUntil = now + 6000;
      }
      this.state.pickups.delete(pickup.id);
      this.broadcast('pickup', {
        id: taken.id,
        name: taken.name,
        kind: pickup.kind,
      });
    });
  }

  playerById(id) {
    let found = null;
    this.state.players.forEach((player) => {
      if (!found && player.id === id) found = player;
    });
    return found;
  }

  damageOverTime(player, amount) {
    const key = player.id;
    const acc = (this.damageAcc.get(key) || 0) + amount;
    const whole = Math.floor(acc);
    this.damageAcc.set(key, acc - whole);
    if (whole > 0 && player.alive) {
      this.applyDamage(player, whole, null, true);
    }
  }

  applyDamage(player, amount, attacker, silent = false) {
    if (!player.alive || this.state.phase !== 'playing') return;
    const now = Date.now();
    if (now < player.shieldUntil) {
      player.shieldUntil = 0;
      return;
    }
    const damage = Math.max(0, Math.round(amount));
    if (!damage) return;
    player.hp = Math.max(0, player.hp - damage);
    if (attacker && attacker !== player) {
      attacker.damage = Math.min(4294967295, attacker.damage + damage);
    }
    if (player.hp <= 0) {
      if (attacker && attacker !== player) {
        attacker.kills = Math.min(255, attacker.kills + 1);
      }
      this.eliminate(player, 'eliminado', attacker, silent);
    }
  }

  eliminate(player, reason, attacker = null, silent = false) {
    if (!player.alive) return;
    player.alive = false;
    player.hp = 0;
    player.eliminatedAt = Date.now();
    player.survivedMs = Math.max(0, player.eliminatedAt - this.state.startedAt);
    player.vx = 0;
    player.vy = 0;
    if (!silent) {
      this.broadcast('eliminated', {
        id: player.id,
        name: player.name,
        by: attacker?.name || '',
        reason,
      });
    }
    if (this.alivePlayers().length <= 1) this.finishMatch('último sobrevivente');
  }

  finishMatch(reason) {
    if (this.state.phase !== 'playing') return;
    const endedAt = Date.now();
    this.state.phase = 'ended';
    this.state.endedAt = endedAt;
    this.state.timeLeft = 0;
    this.state.countdown = 0;

    const all = [...this.state.players.values()];
    const alive = all
      .filter((player) => player.alive)
      .sort(
        (a, b) =>
          b.hp - a.hp || b.kills - a.kills || b.damage - a.damage
      );
    const eliminated = all
      .filter((player) => !player.alive)
      .sort((a, b) => b.eliminatedAt - a.eliminatedAt);
    const ranked = [...alive, ...eliminated];
    ranked.forEach((player, index) => {
      player.rank = index + 1;
      if (!player.survivedMs) {
        player.survivedMs = Math.max(0, endedAt - this.state.startedAt);
      }
    });

    const winner = ranked[0] || null;
    this.state.winnerId = winner?.id || '';
    this.state.winnerName = winner?.name || '';
    this.state.projectiles.clear();
    this.state.pickups.clear();

    const payload = {
      matchId: this.state.matchId,
      reason,
      training: this.bots.size > 0,
      winnerId: this.state.winnerId,
      winnerName: this.state.winnerName,
      durationMs: Math.max(0, endedAt - this.state.startedAt),
      players: ranked.map((player) => ({
        id: player.id,
        name: player.name,
        handle: player.handle,
        avatar: player.avatar,
        rank: player.rank,
        kills: player.kills,
        damage: player.damage,
        survivedMs: player.survivedMs,
        alive: player.alive,
      })),
    };
    this.broadcast('matchEnd', payload);
    this.updateMetadata();
    this.persistResult(payload, endedAt);
  }

  async persistResult(payload, endedAt) {
    if (this.persisted || this.persisting) return;
    if (this.bots.size > 0) {
      // Treino contra a IA não entra no histórico nem no ranking.
      this.persisted = true;
      this.broadcast('matchSaved', { saved: true, training: true });
      return;
    }
    this.persisting = true;
    const saved = await persistMatch({
      id: this.state.matchId,
      roomCode: this.state.roomCode,
      visibility: this.state.visibility,
      playerCount: this.state.players.size,
      winnerId: this.state.winnerId,
      winnerName: this.state.winnerName,
      startedAt: this.state.startedAt,
      endedAt,
      durationMs: payload.durationMs,
      players: [...this.state.players.values()],
    });
    this.persisted = saved;
    this.persisting = false;
    this.broadcast('matchSaved', { saved });
  }
}
