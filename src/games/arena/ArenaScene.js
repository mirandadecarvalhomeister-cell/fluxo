import Phaser from 'phaser';

const WIDTH = 1600;
const HEIGHT = 1000;
const COLORS = [0x8b5cf6, 0xf0386b, 0xffb020, 0x22d3ee, 0x34d399, 0xf97316];
const PLAYER_R = 22;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export class ArenaScene extends Phaser.Scene {
  constructor() {
    super('arena');
  }

  init(data = {}) {
    this.bridge = data.bridge || {};
    this.move = { mx: 0, my: 0, aim: 0 };
    this.lastSent = 0;
    this.dashQueued = false;
    this.fireQueued = false;
    this.pointerWasDown = false;
    this.touchOrigin = null;
    this.playerText = new Map();
    this.pickupText = new Map();
    this.cameraTarget = { x: WIDTH / 2, y: HEIGHT / 2 };
    this.bridge.fire = () => {
      this.fireQueued = true;
    };
    this.bridge.dash = () => {
      this.dashQueued = true;
    };
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0818');
    this.cameras.main.setBounds(-200, -200, WIDTH + 400, HEIGHT + 400);

    this.gfx = this.add.graphics().setDepth(1);
    this.overlay = this.add.graphics().setDepth(8);

    this.keys = this.input.keyboard.addKeys({
      up: 'W',
      down: 'S',
      left: 'A',
      right: 'D',
      up2: 'UP',
      down2: 'DOWN',
      left2: 'LEFT',
      right2: 'RIGHT',
      dash: 'SPACE',
      fire: 'F',
    });

    this.input.on('pointerdown', (pointer) => {
      this.pointerWasDown = true;
      if (pointer.wasTouch) {
        this.touchOrigin = { x: pointer.x, y: pointer.y };
      } else {
        this.fireQueued = true;
      }
    });
    this.input.on('pointerup', () => {
      this.pointerWasDown = false;
      this.touchOrigin = null;
    });

    this.scale.on('resize', () => this.applyZoom());
    this.applyZoom();
    this.events.once('shutdown', () => {
      this.playerText.forEach((text) => text.destroy());
      this.pickupText.forEach((text) => text.destroy());
      this.playerText.clear();
      this.pickupText.clear();
    });
  }

  applyZoom() {
    const width = this.scale.width || 900;
    const height = this.scale.height || 600;
    const mobile = width < 720;
    const zoom = mobile
      ? clamp(Math.min(width / 880, height / 720), 0.4, 0.95)
      : clamp(Math.min(width / 1180, height / 720), 0.55, 1.35);
    this.cameras.main.setZoom(zoom);
  }

  currentState() {
    try {
      return this.bridge.getState?.() || null;
    } catch {
      return null;
    }
  }

  update(time) {
    const state = this.currentState();
    this.drawWorld(state, time);

    const me = state?.me;
    if (!state || !me || !me.alive) {
      this.bridge.onDead?.();
      return;
    }
    this.bridge.onAlive?.();
    this.updateCamera(me);
    this.updateInput(state, me, time);
  }

  updateCamera(me) {
    const camera = this.cameras.main;
    const lerp = 0.12;
    this.cameraTarget.x += (me.x - this.cameraTarget.x) * lerp;
    this.cameraTarget.y += (me.y - this.cameraTarget.y) * lerp;
    camera.centerOn(this.cameraTarget.x, this.cameraTarget.y);
  }

  updateInput(state, me, time) {
    if (state.phase !== 'playing') {
      this.move = { mx: 0, my: 0, aim: me.aim || 0 };
      return;
    }
    const keys = this.keys || {};
    let mx = 0;
    let my = 0;
    if (keys.left?.isDown || keys.left2?.isDown) mx -= 1;
    if (keys.right?.isDown || keys.right2?.isDown) mx += 1;
    if (keys.up?.isDown || keys.up2?.isDown) my -= 1;
    if (keys.down?.isDown || keys.down2?.isDown) my += 1;

    const pointer = this.input.activePointer;
    let aim = me.aim || 0;

    if (pointer.wasTouch && pointer.isDown && this.touchOrigin) {
      const dx = pointer.x - this.touchOrigin.x;
      const dy = pointer.y - this.touchOrigin.y;
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 10) {
        const nx = dx / magnitude;
        const ny = dy / magnitude;
        mx = nx * Math.min(1, magnitude / 70);
        my = ny * Math.min(1, magnitude / 70);
        aim = Math.atan2(ny, nx);
      }
    } else if (!pointer.wasTouch) {
      const world = pointer.positionToCamera(this.cameras.main);
      if (world) {
        const dx = world.x - me.x;
        const dy = world.y - me.y;
        if (Math.hypot(dx, dy) > 6) aim = Math.atan2(dy, dx);
      }
    } else if (Math.hypot(mx, my) > 0.15) {
      aim = Math.atan2(my, mx);
    }

    if (keys.dash?.isDown) this.dashQueued = true;
    if (keys.fire?.isDown) this.fireQueued = true;

    this.move = { mx, my, aim };
    const fire = this.fireQueued;
    const dash = this.dashQueued;
    if (time - this.lastSent >= 50 || fire || dash) {
      this.lastSent = time;
      this.fireQueued = false;
      this.dashQueued = false;
      this.bridge.sendInput?.({
        mx,
        my,
        aim,
        fire,
        dash,
      });
    }
  }

  drawWorld(state, time) {
    const gfx = this.gfx;
    gfx.clear();
    const t = time / 1000;

    // Fundo do mapa
    gfx.fillStyle(0x0b0818, 1);
    gfx.fillRect(-300, -300, WIDTH + 600, HEIGHT + 600);
    gfx.fillStyle(0x171233, 1);
    gfx.fillRoundedRect(0, 0, WIDTH, HEIGHT, 34);
    gfx.lineStyle(3, 0x3a2f70, 1);
    gfx.strokeRoundedRect(0, 0, WIDTH, HEIGHT, 34);

    gfx.lineStyle(1, 0x5b35e8, 0.12);
    for (let x = 80; x < WIDTH; x += 80) {
      gfx.lineBetween(x, 0, x, HEIGHT);
    }
    for (let y = 80; y < HEIGHT; y += 80) {
      gfx.lineBetween(0, y, WIDTH, y);
    }

    if (!state) {
      this.overlay.clear();
      return;
    }

    const zone = state.zone || { x: WIDTH / 2, y: HEIGHT / 2, r: 720 };
    gfx.fillStyle(0x7f1d3a, 0.12);
    gfx.fillCircle(zone.x, zone.y, zone.r);
    gfx.lineStyle(6, 0xff3b6b, 0.9);
    gfx.strokeCircle(zone.x, zone.y, zone.r);
    gfx.lineStyle(2, 0xff86a6, 0.5);
    gfx.strokeCircle(zone.x, zone.y, Math.max(0, zone.r - 16));

    state.obstacles?.forEach((obstacle) => {
      const x = obstacle.x - obstacle.w / 2;
      const y = obstacle.y - obstacle.h / 2;
      if (obstacle.kind === 'hazard') {
        gfx.fillStyle(0xef4444, 0.22 + Math.sin(t * 5 + obstacle.x) * 0.08);
        gfx.fillRoundedRect(x, y, obstacle.w, obstacle.h, 16);
        gfx.lineStyle(3, 0xff7a7a, 0.95);
        gfx.strokeRoundedRect(x, y, obstacle.w, obstacle.h, 16);
        gfx.lineStyle(2, 0xffd0d0, 0.5);
        gfx.lineBetween(x + 20, y + obstacle.h / 2, obstacle.x, y + 8);
        return;
      }
      const barrier = obstacle.kind === 'barrier';
      gfx.fillStyle(barrier ? 0x0e7490 : 0x2b2354, barrier ? 0.9 : 1);
      gfx.fillRoundedRect(x, y, obstacle.w, obstacle.h, 12);
      gfx.lineStyle(2, barrier ? 0x67e8f9 : 0x5b4a9e, 1);
      gfx.strokeRoundedRect(x, y, obstacle.w, obstacle.h, 12);
      if (barrier) {
        gfx.lineStyle(2, 0xd9fbff, 0.35);
        gfx.lineBetween(x + 12, y + 8, x + obstacle.w - 12, y + 8);
      }
    });

    state.pickups?.forEach((pickup) => {
      const color =
        pickup.kind === 'heal' ? 0x34d399 : pickup.kind === 'shield' ? 0x60a5fa : 0xfbbf24;
      gfx.fillStyle(color, 0.25);
      gfx.fillCircle(pickup.x, pickup.y, 26 + Math.sin(t * 4 + pickup.x) * 3);
      gfx.fillStyle(color, 0.95);
      gfx.fillCircle(pickup.x, pickup.y, 14);
      gfx.lineStyle(2, 0xffffff, 0.6);
      gfx.strokeCircle(pickup.x, pickup.y, 20);
      this.getPickupText(pickup, color);
    });

    state.projectiles?.forEach((projectile) => {
      const color = COLORS[projectile.color % COLORS.length];
      gfx.fillStyle(color, 0.25);
      gfx.fillCircle(projectile.x, projectile.y, 12);
      gfx.fillStyle(0xffffff, 0.95);
      gfx.fillCircle(projectile.x, projectile.y, 5);
    });

    state.players?.forEach((player) => {
      if (!player.alive) return;
      const color = COLORS[player.color % COLORS.length];
      if (!player.connected) {
        gfx.lineStyle(2, 0x94a3b8, 0.7);
        gfx.strokeCircle(player.x, player.y, PLAYER_R + 8);
      }
      gfx.fillStyle(color, 0.22);
      gfx.fillCircle(player.x, player.y, PLAYER_R + 12);
      gfx.fillStyle(color, 1);
      gfx.fillCircle(player.x, player.y, PLAYER_R);
      gfx.lineStyle(player.isMe ? 4 : 2, player.isMe ? 0xffffff : 0x0b0818, player.isMe ? 1 : 0.5);
      gfx.strokeCircle(player.x, player.y, PLAYER_R);
      if (player.id === state.hostId) {
        gfx.lineStyle(2, 0xffd166, 0.9);
        gfx.strokeCircle(player.x, player.y, PLAYER_R + 6);
      }
      if (player.shieldUntil > Date.now()) {
        gfx.lineStyle(3, 0x60a5fa, 0.9);
        gfx.strokeCircle(player.x, player.y, PLAYER_R + 14);
      }
      // Direção da mira
      gfx.lineStyle(4, color, 0.9);
      gfx.lineBetween(
        player.x + Math.cos(player.aim) * (PLAYER_R - 4),
        player.y + Math.sin(player.aim) * (PLAYER_R - 4),
        player.x + Math.cos(player.aim) * (PLAYER_R + 20),
        player.y + Math.sin(player.aim) * (PLAYER_R + 20)
      );
      // Barra de vida
      const hpRatio = clamp(player.hp / (player.maxHp || 100), 0, 1);
      gfx.fillStyle(0x0b0818, 0.8);
      gfx.fillRoundedRect(player.x - 28, player.y - PLAYER_R - 18, 56, 8, 4);
      gfx.fillStyle(hpRatio > 0.5 ? 0x34d399 : hpRatio > 0.25 ? 0xfbbf24 : 0xef4444, 1);
      gfx.fillRoundedRect(player.x - 28, player.y - PLAYER_R - 18, 56 * hpRatio, 8, 4);
      this.getPlayerText(player, color);
    });

    // Nomes antigos que sumiram
    this.playerText.forEach((text, id) => {
      if (!state.players?.some((player) => player.id === id && player.alive)) {
        text.setVisible(false);
      }
    });
    this.pickupText.forEach((text, id) => {
      if (!state.pickups?.some((pickup) => pickup.id === id)) {
        text.setVisible(false);
      }
    });
  }

  getPlayerText(player, color) {
    let text = this.playerText.get(player.id);
    if (!text) {
      text = this.add
        .text(player.x, player.y, player.name, {
          fontFamily: 'Instrument Sans, system-ui, sans-serif',
          fontSize: '15px',
          color: '#ffffff',
          stroke: '#0b0818',
          strokeThickness: 4,
          align: 'center',
        })
        .setOrigin(0.5, 1)
        .setDepth(9);
      this.playerText.set(player.id, text);
    }
    text.setVisible(true);
    text.setText(player.id === this.bridge.myId?.() ? `${player.name} (você)` : player.name);
    text.setColor(player.connected ? '#ffffff' : '#94a3b8');
    text.setPosition(player.x, player.y - PLAYER_R - 22);
    text.setTint?.(player.connected ? 0xffffff : 0x94a3b8);
    return text;
  }

  getPickupText(pickup, color) {
    let text = this.pickupText.get(pickup.id);
    const symbol = pickup.kind === 'heal' ? '+' : pickup.kind === 'shield' ? '⛨' : '»';
    if (!text) {
      text = this.add
        .text(pickup.x, pickup.y, symbol, {
          fontFamily: 'Instrument Sans, system-ui, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#0b0818',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(9);
      this.pickupText.set(pickup.id, text);
    }
    text.setVisible(true);
    text.setPosition(pickup.x, pickup.y);
    text.setColor(
      color === 0x34d399 ? '#bbf7d0' : color === 0x60a5fa ? '#dbeafe' : '#fef3c7'
    );
    return text;
  }
}

export default ArenaScene;
