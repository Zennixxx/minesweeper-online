// ===== Diep.io Game Engine =====
// Pure game logic, no React dependencies for performance

import {
  Tank, Bullet, FoodItem, Vec2, TankStats,
  ARENA_SIZE, MAX_FOOD, MAX_BOTS, FOOD_SPAWN_RATE,
  MAX_LEVEL, PLAYER_COLOR, BOT_COLORS, FOOD_COLORS,
  xpForLevel, STAT_NAMES, STAT_MAX,
} from './diepTypes';

let nextId = 1;
function genId(): number { return nextId++; }

// ===== Stat calculations =====

function getMaxHp(stats: TankStats, level: number): number {
  return 50 + level * 2 + stats.maxHealth * 20;
}

function getReloadTime(stats: TankStats): number {
  return Math.max(5, 30 - stats.reload * 3);
}

function getBulletSpeed(stats: TankStats): number {
  return 8 + stats.bulletSpeed * 1.5;
}

function getBulletDamage(stats: TankStats): number {
  return 5 + stats.bulletDamage * 3;
}

function getBulletPen(stats: TankStats): number {
  return 1 + stats.bulletPenetration * 0.5;
}

function getMoveSpeed(stats: TankStats): number {
  return 3 + stats.moveSpeed * 0.5;
}

function getBodyDamage(stats: TankStats): number {
  return 5 + stats.bodyDamage * 4;
}

function getHealthRegen(stats: TankStats): number {
  return 0.02 + stats.healthRegen * 0.04;
}

// ===== Game State =====

export interface GameState {
  player: Tank;
  bots: Tank[];
  bullets: Bullet[];
  food: FoodItem[];
  camera: Vec2;
  frame: number;
  gameOver: boolean;
  // Input state
  keys: Set<string>;
  mouse: Vec2;
  mouseDown: boolean;
  autoFire: boolean;
  // Network multiplayer
  networkPlayers: Tank[];
  myDocId: string | null;
  roomId: string | null;
  onNetworkDeath?: (killerDocId: string, score: number) => void;
}

// ===== Initialization =====

function createTank(
  id: string, name: string, x: number, y: number,
  color: string, isBot: boolean
): Tank {
  const stats: TankStats = {
    healthRegen: 0, maxHealth: 0, bodyDamage: 0,
    bulletSpeed: 0, bulletPenetration: 0, bulletDamage: 0,
    reload: 0, moveSpeed: 0,
  };
  return {
    id, name, x, y, vx: 0, vy: 0,
    radius: 25,
    hp: getMaxHp(stats, 1),
    maxHp: getMaxHp(stats, 1),
    angle: 0, xp: 0, level: 1, score: 0,
    color, isBot, stats,
    reloadTimer: 0, alive: true, respawnTimer: 0,
    damageFlash: 0,
    botTarget: null, botShootTimer: 0, botChangeTimer: 0,
  };
}

function randomPos(margin: number = 200): Vec2 {
  return {
    x: margin + Math.random() * (ARENA_SIZE - margin * 2),
    y: margin + Math.random() * (ARENA_SIZE - margin * 2),
  };
}

function spawnFood(): FoodItem {
  const typeRoll = Math.random();
  let type: FoodItem['type'];
  let radius: number;
  let hp: number;
  let xp: number;

  if (typeRoll < 0.6) {
    type = 'square'; radius = 12; hp = 10; xp = 10;
  } else if (typeRoll < 0.9) {
    type = 'triangle'; radius = 15; hp = 25; xp = 25;
  } else {
    type = 'pentagon'; radius = 22; hp = 100; xp = 130;
  }

  const pos = randomPos(100);
  return {
    id: genId(),
    x: pos.x, y: pos.y,
    radius, hp, maxHp: hp, xp, type,
    color: FOOD_COLORS[type],
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.02,
  };
}

const BOT_NAMES = [
  'Arena Closer', 'Destroyer', 'Sniper', 'Hunter',
  'Trapper', 'Overseer', 'Booster', 'Annihilator',
  'Predator', 'Stalker', 'Ranger', 'Commander',
];

function spawnBot(index: number): Tank {
  const pos = randomPos(300);
  const name = BOT_NAMES[index % BOT_NAMES.length];
  const color = BOT_COLORS[index % BOT_COLORS.length];
  const tank = createTank(`bot_${index}`, name, pos.x, pos.y, color, true);

  // Give bots some starting stats based on random allocation
  const pts = Math.floor(Math.random() * 10);
  for (let i = 0; i < pts; i++) {
    const stat = STAT_NAMES[Math.floor(Math.random() * STAT_NAMES.length)];
    if (tank.stats[stat] < STAT_MAX) {
      tank.stats[stat]++;
      tank.level++;
      tank.xp = xpForLevel(tank.level);
    }
  }
  tank.maxHp = getMaxHp(tank.stats, tank.level);
  tank.hp = tank.maxHp;
  tank.score = Math.floor(Math.random() * 500);

  return tank;
}

export function initGame(playerName: string): GameState {
  const playerPos = { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
  const player = createTank('player', playerName, playerPos.x, playerPos.y, PLAYER_COLOR, false);

  const bots: Tank[] = [];
  for (let i = 0; i < MAX_BOTS; i++) {
    bots.push(spawnBot(i));
  }

  const food: FoodItem[] = [];
  for (let i = 0; i < MAX_FOOD * 0.7; i++) {
    food.push(spawnFood());
  }

  return {
    player,
    bots,
    bullets: [],
    food,
    camera: { x: playerPos.x, y: playerPos.y },
    frame: 0,
    gameOver: false,
    keys: new Set(),
    mouse: { x: 0, y: 0 },
    mouseDown: false,
    autoFire: false,
    networkPlayers: [],
    myDocId: null,
    roomId: null,
  };
}

// ===== Update Logic =====

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function fireBullet(tank: Tank, bullets: Bullet[]): void {
  const speed = getBulletSpeed(tank.stats);
  const dmg = getBulletDamage(tank.stats);
  const pen = getBulletPen(tank.stats);
  const barrelLen = tank.radius + 15;

  bullets.push({
    id: genId(),
    x: tank.x + Math.cos(tank.angle) * barrelLen,
    y: tank.y + Math.sin(tank.angle) * barrelLen,
    vx: Math.cos(tank.angle) * speed,
    vy: Math.sin(tank.angle) * speed,
    radius: 8 + tank.stats.bulletDamage * 0.5,
    damage: dmg,
    ownerId: tank.id,
    life: Math.floor(60 + pen * 20),
    color: tank.color,
  });
}

function addXp(tank: Tank, amount: number): void {
  tank.xp += amount;
  tank.score += amount;
  while (tank.level < MAX_LEVEL && tank.xp >= xpForLevel(tank.level + 1)) {
    tank.level++;
    tank.radius = 25 + tank.level * 0.3;
  }
  tank.maxHp = getMaxHp(tank.stats, tank.level);
}

function updateBotAI(bot: Tank, state: GameState): void {
  if (!bot.alive) return;

  bot.botChangeTimer = (bot.botChangeTimer || 0) - 1;
  bot.botShootTimer = (bot.botShootTimer || 0) - 1;

  // Choose target periodically
  if (bot.botChangeTimer! <= 0) {
    bot.botChangeTimer = 60 + Math.floor(Math.random() * 120);

    // Look for nearby food or player
    let closestTarget: Vec2 | null = null;
    let closestDist = 600;

    // Target player if close
    if (state.player.alive) {
      const d = dist(bot, state.player);
      if (d < 500) {
        closestTarget = { x: state.player.x, y: state.player.y };
        closestDist = d;
      }
    }

    // Target other bots sometimes
    for (const other of state.bots) {
      if (other.id === bot.id || !other.alive) continue;
      const d = dist(bot, other);
      if (d < closestDist && Math.random() < 0.3) {
        closestTarget = { x: other.x, y: other.y };
        closestDist = d;
      }
    }

    // Target food
    if (!closestTarget) {
      for (const f of state.food) {
        const d = dist(bot, f);
        if (d < closestDist) {
          closestTarget = { x: f.x, y: f.y };
          closestDist = d;
        }
      }
    }

    // Random wander
    if (!closestTarget) {
      closestTarget = randomPos(300);
    }

    bot.botTarget = closestTarget;
  }

  if (bot.botTarget) {
    const d = dist(bot, bot.botTarget);
    const angle = angleTo(bot, bot.botTarget);

    // Move towards target
    const speed = getMoveSpeed(bot.stats);
    if (d > 50) {
      bot.vx += Math.cos(angle) * speed * 0.1;
      bot.vy += Math.sin(angle) * speed * 0.1;
    }

    // Aim at target
    bot.angle = angle;

    // Shoot at targets (10% chance per frame if close enough)
    if (d < 500 && bot.botShootTimer! <= 0) {
      bot.botShootTimer = getReloadTime(bot.stats);
      fireBullet(bot, state.bullets);
    }
  }

  // Auto-upgrade stats for bots
  const usedPts = Object.values(bot.stats).reduce((a, b) => a + b, 0);
  const available = bot.level - 1 - usedPts;
  if (available > 0) {
    const stat = STAT_NAMES[Math.floor(Math.random() * STAT_NAMES.length)];
    if (bot.stats[stat] < STAT_MAX) {
      bot.stats[stat]++;
      bot.maxHp = getMaxHp(bot.stats, bot.level);
    }
  }
}

function respawnTank(tank: Tank): void {
  const pos = randomPos(300);
  tank.x = pos.x;
  tank.y = pos.y;
  tank.vx = 0;
  tank.vy = 0;
  tank.hp = tank.maxHp;
  tank.alive = true;
  tank.respawnTimer = 0;
  tank.damageFlash = 0;
  // Bots lose some score on death
  if (tank.isBot) {
    tank.score = Math.floor(tank.score * 0.7);
  }
}

export function updateGame(state: GameState): void {
  state.frame++;

  const { player, bots, bullets, food } = state;

  // ===== Player movement =====
  if (player.alive) {
    const speed = getMoveSpeed(player.stats);
    let ax = 0, ay = 0;
    if (state.keys.has('w') || state.keys.has('arrowup')) ay -= 1;
    if (state.keys.has('s') || state.keys.has('arrowdown')) ay += 1;
    if (state.keys.has('a') || state.keys.has('arrowleft')) ax -= 1;
    if (state.keys.has('d') || state.keys.has('arrowright')) ax += 1;

    // Normalize diagonal
    if (ax !== 0 && ay !== 0) {
      const inv = 1 / Math.SQRT2;
      ax *= inv;
      ay *= inv;
    }

    player.vx += ax * speed * 0.15;
    player.vy += ay * speed * 0.15;

    // Player aim at mouse (mouse is in screen coords, convert to world)
    player.angle = Math.atan2(
      state.mouse.y - (player.y - state.camera.y),
      state.mouse.x - (player.x - state.camera.x)
    );

    // Shooting
    if (player.reloadTimer > 0) player.reloadTimer--;
    if ((state.mouseDown || state.autoFire) && player.reloadTimer <= 0) {
      player.reloadTimer = getReloadTime(player.stats);
      fireBullet(player, bullets);
    }
  } else {
    player.respawnTimer--;
    if (player.respawnTimer <= 0) {
      // Reset player on respawn
      player.xp = 0;
      player.level = 1;
      player.score = Math.floor(player.score * 0.5);
      player.stats = {
        healthRegen: 0, maxHealth: 0, bodyDamage: 0,
        bulletSpeed: 0, bulletPenetration: 0, bulletDamage: 0,
        reload: 0, moveSpeed: 0,
      };
      player.radius = 25;
      player.maxHp = getMaxHp(player.stats, 1);
      respawnTank(player);
    }
  }

  // ===== Network player Dead Reckoning & shooting =====
  for (const np of state.networkPlayers) {
    if (!np.alive) continue;

    // Dead Reckoning: extrapolate position using predicted velocity (units/sec ÷ 60fps)
    np.x += (np.predictVx || 0) / 60;
    np.y += (np.predictVy || 0) / 60;

    // Soft correction toward authoritative target (prevents unbounded drift)
    if (np.targetX !== undefined) {
      const errX = np.targetX - np.x;
      const errY = (np.targetY ?? np.y) - np.y;
      const errDist = Math.sqrt(errX * errX + errY * errY);
      if (errDist > 250) {
        // Big error (teleport / large lag spike) — snap immediately
        np.x = np.targetX;
        np.y = np.targetY!;
      } else {
        // Gentle 5% blend per frame — reaches target in ~1 sec
        np.x += errX * 0.05;
        np.y += errY * 0.05;
      }
    }

    // Clamp to arena bounds
    np.x = clamp(np.x, np.radius, ARENA_SIZE - np.radius);
    np.y = clamp(np.y, np.radius, ARENA_SIZE - np.radius);

    // Smooth barrel angle interpolation
    if (np.targetAngle !== undefined) {
      let diff = np.targetAngle - np.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      np.angle += diff * 0.2;
    }

    // Network player shooting (visual bullets)
    if (np.reloadTimer > 0) np.reloadTimer--;
    if (np.isShooting && np.reloadTimer <= 0) {
      np.reloadTimer = getReloadTime(np.stats);
      fireBullet(np, bullets);
    }
    // Damage flash decay
    if (np.damageFlash > 0) np.damageFlash--;
  }

  // ===== Update all tanks (player + bots + network) =====
  // Bots are fully disabled when real network players are in the room
  const botsActive = state.networkPlayers.length === 0;
  const allTanks = botsActive
    ? [player, ...bots, ...state.networkPlayers]
    : [player, ...state.networkPlayers];

  for (const tank of allTanks) {
    // Network players are handled above (interpolation)
    if (tank.isNetwork) continue;

    if (!tank.alive) {
      if (tank.isBot) {
        tank.respawnTimer--;
        if (tank.respawnTimer <= 0) {
          respawnTank(tank);
        }
      }
      continue;
    }

    // Friction
    tank.vx *= 0.92;
    tank.vy *= 0.92;

    // Move
    tank.x += tank.vx;
    tank.y += tank.vy;

    // Arena bounds
    tank.x = clamp(tank.x, tank.radius, ARENA_SIZE - tank.radius);
    tank.y = clamp(tank.y, tank.radius, ARENA_SIZE - tank.radius);

    // Health regen
    const regen = getHealthRegen(tank.stats);
    tank.hp = Math.min(tank.maxHp, tank.hp + regen);

    // Damage flash decay
    if (tank.damageFlash > 0) tank.damageFlash--;
  }

  // ===== Bot AI (disabled when real players are in the room) =====
  if (botsActive) {
    for (const bot of bots) {
      updateBotAI(bot, state);
      if (bot.alive && bot.reloadTimer > 0) bot.reloadTimer--;
    }
  }

  // ===== Update bullets =====
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life--;

    // Remove if expired or out of arena
    if (b.life <= 0 || b.x < -50 || b.x > ARENA_SIZE + 50 ||
      b.y < -50 || b.y > ARENA_SIZE + 50) {
      bullets.splice(i, 1);
      continue;
    }

    // Bullet vs food
    for (let j = food.length - 1; j >= 0; j--) {
      const f = food[j];
      if (dist(b, f) < b.radius + f.radius) {
        f.hp -= b.damage;
        b.life = 0;
        if (f.hp <= 0) {
          // Give XP to the bullet owner
          const owner = allTanks.find(t => t.id === b.ownerId);
          if (owner) addXp(owner, f.xp);
          food.splice(j, 1);
        }
        break;
      }
    }

    if (b.life <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    // Bullet vs tanks
    for (const tank of allTanks) {
      if (!tank.alive || tank.id === b.ownerId) continue;
      if (dist(b, tank) < b.radius + tank.radius) {
        if (tank.isNetwork) {
          // Visual feedback only — real damage is resolved on their client
          tank.damageFlash = 8;
        } else {
          tank.hp -= b.damage;
          tank.damageFlash = 8;
          tank.lastHitBy = b.ownerId;
          if (tank.hp <= 0) {
            tank.alive = false;
            tank.respawnTimer = tank.isBot ? 180 : 180;
            // Report death to server if killed by network player
            if (!tank.isBot && tank.lastHitBy?.startsWith('net_') && state.onNetworkDeath) {
              state.onNetworkDeath(tank.lastHitBy.substring(4), tank.score);
            }
            const killer = allTanks.find(t => t.id === b.ownerId);
            if (killer && !killer.isNetwork) {
              addXp(killer, Math.floor(tank.score * 0.3 + 50));
            }
          }
        }
        b.life = 0;
        break;
      }
    }

    if (b.life <= 0) {
      bullets.splice(i, 1);
    }
  }

  // ===== Tank vs tank collisions =====
  for (let i = 0; i < allTanks.length; i++) {
    const a = allTanks[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < allTanks.length; j++) {
      const b2 = allTanks[j];
      if (!b2.alive) continue;
      const d = dist(a, b2);
      const overlap = a.radius + b2.radius - d;
      if (overlap > 0) {
        const angle = angleTo(a, b2);
        const push = overlap * 0.5;
        a.x -= Math.cos(angle) * push;
        a.y -= Math.sin(angle) * push;
        b2.x += Math.cos(angle) * push;
        b2.y += Math.sin(angle) * push;

        // Body damage (skip damage TO network tanks — they handle it on their client)
        const dmgA = getBodyDamage(a.stats);
        const dmgB = getBodyDamage(b2.stats);
        if (!a.isNetwork) { a.hp -= dmgB * 0.05; a.lastHitBy = b2.id; }
        if (!b2.isNetwork) { b2.hp -= dmgA * 0.05; b2.lastHitBy = a.id; }
        a.damageFlash = 4;
        b2.damageFlash = 4;

        if (a.hp <= 0 && a.alive && !a.isNetwork) {
          a.alive = false;
          a.respawnTimer = a.isBot ? 180 : 180;
          if (!a.isBot && a.lastHitBy?.startsWith('net_') && state.onNetworkDeath) {
            state.onNetworkDeath(a.lastHitBy.substring(4), a.score);
          }
          if (!b2.isNetwork) addXp(b2, Math.floor(a.score * 0.3 + 50));
        }
        if (b2.hp <= 0 && b2.alive && !b2.isNetwork) {
          b2.alive = false;
          b2.respawnTimer = b2.isBot ? 180 : 180;
          if (!b2.isBot && b2.lastHitBy?.startsWith('net_') && state.onNetworkDeath) {
            state.onNetworkDeath(b2.lastHitBy.substring(4), b2.score);
          }
          if (!a.isNetwork) addXp(a, Math.floor(b2.score * 0.3 + 50));
        }
      }
    }
  }

  // ===== Spawn food =====
  if (food.length < MAX_FOOD && state.frame % Math.floor(60 / FOOD_SPAWN_RATE) === 0) {
    food.push(spawnFood());
  }

  // ===== Camera follow player =====
  if (player.alive) {
    state.camera.x += (player.x - state.camera.x) * 0.08;
    state.camera.y += (player.y - state.camera.y) * 0.08;
  }

  // ===== Food rotation =====
  for (const f of food) {
    f.rotation += f.rotationSpeed;
  }
}

// ===== Rendering =====

function drawGrid(ctx: CanvasRenderingContext2D, camera: Vec2, w: number, h: number): void {
  const gridSize = 40;
  const offsetX = -camera.x % gridSize;
  const offsetY = -camera.y % gridSize;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = offsetX; x < w; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = offsetY; y < h; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

function drawArenaBorder(ctx: CanvasRenderingContext2D, camera: Vec2, w: number, h: number): void {
  const halfW = w / 2;
  const halfH = h / 2;

  ctx.strokeStyle = 'rgba(255, 80, 80, 0.4)';
  ctx.lineWidth = 4;

  const left = -camera.x + halfW;
  const top = -camera.y + halfH;
  const right = ARENA_SIZE - camera.x + halfW;
  const bottom = ARENA_SIZE - camera.y + halfH;

  ctx.strokeRect(left, top, right - left, bottom - top);
}

function drawFood(ctx: CanvasRenderingContext2D, f: FoodItem, cx: number, cy: number): void {
  const x = f.x - cx;
  const y = f.y - cy;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(f.rotation);

  ctx.fillStyle = f.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;

  if (f.type === 'square') {
    const s = f.radius * 0.85;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeRect(-s, -s, s * 2, s * 2);
  } else if (f.type === 'triangle') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * f.radius;
      const py = Math.sin(a) * f.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * f.radius;
      const py = Math.sin(a) * f.radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // HP bar for damaged food
  if (f.hp < f.maxHp) {
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    const barW = f.radius * 2;
    const barH = 4;
    const barY = f.radius + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-barW / 2, barY, barW, barH);
    ctx.fillStyle = '#4f4';
    ctx.fillRect(-barW / 2, barY, barW * (f.hp / f.maxHp), barH);
  }

  ctx.restore();
}

function drawTank(ctx: CanvasRenderingContext2D, tank: Tank, cx: number, cy: number): void {
  const x = tank.x - cx;
  const y = tank.y - cy;

  ctx.save();
  ctx.translate(x, y);

  // Barrel
  ctx.save();
  ctx.rotate(tank.angle);
  const barrelW = tank.radius * 0.55;
  const barrelL = tank.radius + 18;
  ctx.fillStyle = 'rgba(150, 150, 150, 0.9)';
  ctx.strokeStyle = 'rgba(80, 80, 80, 0.6)';
  ctx.lineWidth = 2;
  ctx.fillRect(0, -barrelW / 2, barrelL, barrelW);
  ctx.strokeRect(0, -barrelW / 2, barrelL, barrelW);
  ctx.restore();

  // Tank body
  const bodyColor = tank.damageFlash > 0 ? '#fff' : tank.color;
  ctx.beginPath();
  ctx.arc(0, 0, tank.radius, 0, Math.PI * 2);
  ctx.fillStyle = bodyColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // HP bar
  const barW = tank.radius * 2.5;
  const barH = 5;
  const barY = tank.radius + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(-barW / 2, barY, barW, barH);
  ctx.fillStyle = tank.hp / tank.maxHp > 0.3 ? '#4f4' : '#f44';
  ctx.fillRect(-barW / 2, barY, barW * Math.max(0, tank.hp / tank.maxHp), barH);

  // Name and level
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(tank.name, 0, -tank.radius - 14);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Lv.${tank.level}`, 0, -tank.radius - 4);

  ctx.restore();
}

function drawBullet(ctx: CanvasRenderingContext2D, b: Bullet, cx: number, cy: number): void {
  const x = b.x - cx;
  const y = b.y - cy;

  ctx.beginPath();
  ctx.arc(x, y, b.radius, 0, Math.PI * 2);
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawMinimap(
  ctx: CanvasRenderingContext2D, state: GameState,
  canvasW: number, canvasH: number
): void {
  const mmSize = 150;
  const mmX = canvasW - mmSize - 15;
  const mmY = canvasH - mmSize - 15;
  const scale = mmSize / ARENA_SIZE;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(mmX, mmY, mmSize, mmSize);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX, mmY, mmSize, mmSize);

  // Player dot
  if (state.player.alive) {
    ctx.fillStyle = state.player.color;
    ctx.beginPath();
    ctx.arc(mmX + state.player.x * scale, mmY + state.player.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bot dots (only in single-player mode)
  if (state.networkPlayers.length === 0) {
    for (const bot of state.bots) {
      if (!bot.alive) continue;
      ctx.fillStyle = bot.color;
      ctx.beginPath();
      ctx.arc(mmX + bot.x * scale, mmY + bot.y * scale, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Network player dots (slightly larger)
  for (const np of state.networkPlayers) {
    if (!np.alive) continue;
    ctx.fillStyle = np.color;
    ctx.beginPath();
    ctx.arc(mmX + np.x * scale, mmY + np.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLeaderboard(ctx: CanvasRenderingContext2D, state: GameState, canvasW: number): void {
  const allTanks = state.networkPlayers.length > 0
    ? [state.player, ...state.networkPlayers]
    : [state.player, ...state.bots];
  const sorted = allTanks
    .filter(t => t.alive || t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const x = canvasW - 210;
  const y = 15;
  const w = 195;
  const lineH = 24;
  const h = 30 + sorted.length * lineH;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Лідери', x + w / 2, y + 18);

  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const rowY = y + 30 + i * lineH;

    // Highlight bar for player
    if (t.id === 'player') {
      ctx.fillStyle = 'rgba(0, 178, 225, 0.15)';
      ctx.fillRect(x + 2, rowY - 2, w - 4, lineH - 2);
    }

    // Score bar
    const maxScore = sorted[0]?.score || 1;
    const barWidth = (w - 50) * (t.score / maxScore);
    ctx.fillStyle = t.color + '40'; // with alpha
    ctx.fillRect(x + 25, rowY, barWidth, lineH - 6);

    // Rank
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${i + 1}.`, x + 8, rowY + 13);

    // Name
    ctx.fillStyle = t.id === 'player' ? '#fff' : 'rgba(255,255,255,0.8)';
    ctx.fillText(t.name, x + 30, rowY + 13);

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`${t.score}`, x + w - 8, rowY + 13);
    ctx.textAlign = 'left';
  }
}

function drawXpBar(ctx: CanvasRenderingContext2D, player: Tank, canvasW: number, canvasH: number): void {
  const barW = canvasW * 0.35;
  const barH = 20;
  const x = (canvasW - barW) / 2;
  const y = canvasH - 35;

  const currentXp = player.xp - xpForLevel(player.level);
  const nextXp = xpForLevel(player.level + 1) - xpForLevel(player.level);
  const progress = player.level >= MAX_LEVEL ? 1 : Math.max(0, currentXp / nextXp);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x, y, barW, barH);

  ctx.fillStyle = '#f0c040';
  ctx.fillRect(x, y, barW * progress, barH);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Рівень ${player.level}`, canvasW / 2, y + 14);
}

function drawDeathScreen(ctx: CanvasRenderingContext2D, player: Tank, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#ff4444';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Вас знищено!', w / 2, h / 2 - 30);

  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText(`Рахунок: ${player.score}`, w / 2, h / 2 + 10);

  const secs = Math.ceil(player.respawnTimer / 60);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Відродження через ${secs}с...`, w / 2, h / 2 + 40);
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number
): void {
  const halfW = width / 2;
  const halfH = height / 2;

  // Camera offset (world pos -> screen pos)
  const cx = state.camera.x - halfW;
  const cy = state.camera.y - halfH;

  // Clear
  ctx.fillStyle = '#0d0d11';
  ctx.fillRect(0, 0, width, height);

  // Grid
  drawGrid(ctx, state.camera, width, height);

  // Arena border
  drawArenaBorder(ctx, state.camera, width, height);

  // Food
  for (const f of state.food) {
    // Cull off-screen
    if (Math.abs(f.x - state.camera.x) > halfW + 50 ||
      Math.abs(f.y - state.camera.y) > halfH + 50) continue;
    drawFood(ctx, f, cx, cy);
  }

  // Bullets
  for (const b of state.bullets) {
    if (Math.abs(b.x - state.camera.x) > halfW + 50 ||
      Math.abs(b.y - state.camera.y) > halfH + 50) continue;
    drawBullet(ctx, b, cx, cy);
  }

  // Tanks (exclude bots in multiplayer mode)
  const renderBots = state.networkPlayers.length === 0;
  const renderTanks = renderBots
    ? [state.player, ...state.bots, ...state.networkPlayers]
    : [state.player, ...state.networkPlayers];
  for (const tank of renderTanks) {
    if (!tank.alive) continue;
    if (Math.abs(tank.x - state.camera.x) > halfW + 100 ||
      Math.abs(tank.y - state.camera.y) > halfH + 100) continue;
    drawTank(ctx, tank, cx, cy);
  }

  // UI overlays
  drawLeaderboard(ctx, state, width);
  drawMinimap(ctx, state, width, height);
  drawXpBar(ctx, state.player, width, height);

  // Death screen
  if (!state.player.alive) {
    drawDeathScreen(ctx, state.player, width, height);
  }
}

// ===== Leaderboard data for React overlay =====
export interface LeaderboardEntry {
  name: string;
  score: number;
  level: number;
  color: string;
  isPlayer: boolean;
}

export function getLeaderboard(state: GameState): LeaderboardEntry[] {
  const allTanks = [state.player, ...state.bots, ...state.networkPlayers];
  return allTanks
    .filter(t => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(t => ({
      name: t.name,
      score: t.score,
      level: t.level,
      color: t.color,
      isPlayer: t.id === 'player',
    }));
}

// ===== Upgrade helpers =====
export function getAvailablePoints(player: Tank): number {
  const usedPts = Object.values(player.stats).reduce((a, b) => a + b, 0);
  return Math.max(0, player.level - 1 - usedPts);
}

export function upgradeStat(player: Tank, stat: keyof TankStats): boolean {
  if (getAvailablePoints(player) <= 0) return false;
  if (player.stats[stat] >= STAT_MAX) return false;
  player.stats[stat]++;
  player.maxHp = getMaxHp(player.stats, player.level);
  player.hp = Math.min(player.hp, player.maxHp);
  return true;
}

// ===== Network player management =====

import type { ArenaPlayerState } from './arenaService';

export function addNetworkPlayer(state: GameState, p: ArenaPlayerState): void {
  // Don't add duplicates
  if (state.networkPlayers.some(np => np.docId === p.docId)) {
    updateNetworkPlayerState(state, p);
    return;
  }

  const stats: TankStats = p.stats || {
    healthRegen: 0, maxHealth: 0, bodyDamage: 0,
    bulletSpeed: 0, bulletPenetration: 0, bulletDamage: 0,
    reload: 0, moveSpeed: 0,
  };

  const tank: Tank = {
    id: `net_${p.docId}`,
    name: p.name,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    radius: 25 + p.level * 0.3,
    hp: p.hp,
    maxHp: p.maxHp,
    angle: p.angle,
    xp: 0,
    level: p.level,
    score: p.score,
    color: p.color,
    isBot: false,
    isNetwork: true,
    isShooting: p.isShooting,
    stats,
    reloadTimer: 0,
    alive: p.alive,
    respawnTimer: 0,
    damageFlash: 0,
    targetX: p.x,
    targetY: p.y,
    targetAngle: p.angle,
    docId: p.docId,
    networkPlayerId: p.playerId,
    predictVx: 0,
    predictVy: 0,
    lastNetworkUpdate: performance.now(),
  };

  state.networkPlayers.push(tank);
}

export function updateNetworkPlayerState(state: GameState, p: ArenaPlayerState): void {
  const tank = state.networkPlayers.find(np => np.docId === p.docId);
  if (!tank) {
    addNetworkPlayer(state, p);
    return;
  }

  const now = performance.now();
  const dt = (tank.lastNetworkUpdate && tank.lastNetworkUpdate > 0)
    ? (now - tank.lastNetworkUpdate) / 1000  // seconds since last update
    : 0;

  // Compute Dead Reckoning velocity from position delta
  if (dt > 0.05 && dt < 3.0 && tank.targetX !== undefined) {
    const dx = p.x - tank.targetX;
    const dy = p.y - (tank.targetY ?? tank.y);
    // Blend: 60% new measurement, 40% previous (stabilize noisy GPS-like updates)
    tank.predictVx = (dx / dt) * 0.6 + (tank.predictVx || 0) * 0.4;
    tank.predictVy = (dy / dt) * 0.6 + (tank.predictVy || 0) * 0.4;
  } else if (dt >= 3.0) {
    // Stale — player probably stopped moving
    tank.predictVx = 0;
    tank.predictVy = 0;
  }
  tank.lastNetworkUpdate = now;

  // Set authoritative targets
  tank.targetX = p.x;
  tank.targetY = p.y;
  tank.targetAngle = p.angle;

  // Update authoritative state directly
  tank.hp = p.hp;
  tank.maxHp = p.maxHp;
  tank.score = p.score;
  tank.level = p.level;
  tank.stats = p.stats;
  tank.alive = p.alive;
  tank.isShooting = p.isShooting;
  tank.radius = 25 + p.level * 0.3;
  tank.name = p.name;
}

export function removeNetworkPlayer(state: GameState, docId: string): void {
  state.networkPlayers = state.networkPlayers.filter(np => np.docId !== docId);
}
