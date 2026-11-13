import { schema, t } from '@colyseus/schema';

// Estado compartilhado da Arena do Caos. O cliente mantém uma cópia idêntica
// em src/games/arena/schema.js — os campos precisam estar na mesma ordem.
export const Player = schema(
  {
    id: t.string().default(''),
    name: t.string().default('Jogador'),
    handle: t.string().default(''),
    avatar: t.string().default(''),
    x: t.number().default(0),
    y: t.number().default(0),
    vx: t.number().default(0),
    vy: t.number().default(0),
    aim: t.number().default(0),
    hp: t.uint8().default(100),
    maxHp: t.uint8().default(100),
    alive: t.boolean().default(true),
    connected: t.boolean().default(true),
    ready: t.boolean().default(false),
    kills: t.uint8().default(0),
    damage: t.uint32().default(0),
    color: t.uint8().default(0),
    rank: t.uint8().default(0),
    dashReadyAt: t.number().default(0),
    fireReadyAt: t.number().default(0),
    shieldUntil: t.number().default(0),
    speedUntil: t.number().default(0),
    eliminatedAt: t.number().default(0),
    survivedMs: t.uint32().default(0),
  },
  'Player'
);

export const Projectile = schema(
  {
    id: t.string().default(''),
    owner: t.string().default(''),
    x: t.number().default(0),
    y: t.number().default(0),
    vx: t.number().default(0),
    vy: t.number().default(0),
    color: t.uint8().default(0),
    life: t.number().default(0),
  },
  'Projectile'
);

export const Obstacle = schema(
  {
    id: t.string().default(''),
    kind: t.string().default('wall'),
    x: t.number().default(0),
    y: t.number().default(0),
    w: t.number().default(0),
    h: t.number().default(0),
    vx: t.number().default(0),
    vy: t.number().default(0),
  },
  'Obstacle'
);

export const Pickup = schema(
  {
    id: t.string().default(''),
    kind: t.string().default('heal'),
    x: t.number().default(0),
    y: t.number().default(0),
  },
  'Pickup'
);

export const ArenaState = schema(
  {
    phase: t.string().default('lobby'),
    roomCode: t.string().default(''),
    visibility: t.string().default('public'),
    hostId: t.string().default(''),
    matchId: t.string().default(''),
    players: t.map(Player),
    projectiles: t.map(Projectile),
    obstacles: t.array(Obstacle),
    pickups: t.map(Pickup),
    zoneX: t.number().default(800),
    zoneY: t.number().default(500),
    zoneR: t.number().default(720),
    zoneTargetX: t.number().default(800),
    zoneTargetY: t.number().default(500),
    zoneTargetR: t.number().default(720),
    zoneNextAt: t.number().default(0),
    timeLeft: t.number().default(0),
    countdown: t.uint8().default(0),
    maxPlayers: t.uint8().default(8),
    winnerId: t.string().default(''),
    winnerName: t.string().default(''),
    startedAt: t.number().default(0),
    endedAt: t.number().default(0),
    playerCount: t.uint8().default(0),
    version: t.uint8().default(1),
  },
  'ArenaState'
);
