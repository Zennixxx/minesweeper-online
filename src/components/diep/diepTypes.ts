// ===== Diep.io Game Types =====

export interface Vec2 {
  x: number;
  y: number;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  ownerId: string;
  life: number; // frames remaining
  color: string;
}

export interface FoodItem {
  id: number;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  xp: number;
  type: 'square' | 'triangle' | 'pentagon';
  color: string;
  rotation: number;
  rotationSpeed: number;
}

export interface Tank {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  angle: number; // barrel angle
  xp: number;
  level: number;
  score: number;
  color: string;
  isBot: boolean;
  // Stats (0-7 each, max total depends on level)
  stats: TankStats;
  // Cooldown
  reloadTimer: number;
  // Respawn
  alive: boolean;
  respawnTimer: number;
  // Damage flash
  damageFlash: number;
  // Bot AI
  botTarget?: Vec2 | null;
  botShootTimer?: number;
  botChangeTimer?: number;
  // Network multiplayer
  isNetwork?: boolean;
  isShooting?: boolean;
  targetX?: number;
  targetY?: number;
  targetAngle?: number;
  docId?: string;
  networkPlayerId?: string;
  lastHitBy?: string;
}

export interface TankStats {
  healthRegen: number;   // 0-7
  maxHealth: number;     // 0-7
  bodyDamage: number;    // 0-7
  bulletSpeed: number;   // 0-7
  bulletPenetration: number; // 0-7 (bullet HP)
  bulletDamage: number;  // 0-7
  reload: number;        // 0-7
  moveSpeed: number;     // 0-7
}

export const STAT_NAMES: (keyof TankStats)[] = [
  'healthRegen',
  'maxHealth',
  'bodyDamage',
  'bulletSpeed',
  'bulletPenetration',
  'bulletDamage',
  'reload',
  'moveSpeed',
];

export const STAT_LABELS: Record<keyof TankStats, string> = {
  healthRegen: 'Реген HP',
  maxHealth: 'Макс HP',
  bodyDamage: 'Шкода тіла',
  bulletSpeed: 'Швидкість кулі',
  bulletPenetration: 'Пробивання',
  bulletDamage: 'Шкода кулі',
  reload: 'Перезарядка',
  moveSpeed: 'Швидкість руху',
};

export const STAT_MAX = 10;

// XP required per level (cumulative)
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // Exponential growth
  return Math.floor(15 * Math.pow(level - 1, 1.8));
}

// Points available per level
export function pointsAtLevel(level: number): number {
  return Math.max(0, level - 1);
}

// Game config
export const ARENA_SIZE = 4000;
export const MAX_FOOD = 200;
export const MAX_BOTS = 12;
export const FOOD_SPAWN_RATE = 3; // per second
export const MAX_LEVEL = 99;

// Tank colors
export const PLAYER_COLOR = '#00b2e1';
export const BOT_COLORS = [
  '#f04f54', '#bf7ff0', '#f0a04f', '#4ff07f',
  '#f0d94f', '#ff6b9d', '#4fc4f0', '#f07f4f',
  '#9d4ff0', '#4ff0c8', '#f04f8b', '#c8f04f',
];

// Food colors
export const FOOD_COLORS: Record<string, string> = {
  square: '#ffe869',
  triangle: '#fc7677',
  pentagon: '#768dfc',
};
