// ===== Arena Multiplayer Service =====
// Handles network communication for the diep.io arena mode
// Uses Appwrite Database + Realtime for player synchronization

import {
  client,
  databases,
  DATABASE_ID,
  FUNCTION_ID,
  ARENA_PLAYERS_COLLECTION_ID,
  Query,
} from '../../lib/appwrite';
import { Functions, ExecutionMethod } from 'appwrite';
import { TankStats } from './diepTypes';

const functions = new Functions(client);

// ===== Server function helper =====

async function callArenaFunction<T = any>(path: string, data: Record<string, any>): Promise<T> {
  const execution = await functions.createExecution(
    FUNCTION_ID,
    JSON.stringify(data),
    false,
    path,
    ExecutionMethod.POST,
  );

  if (execution.status === 'failed') {
    throw new Error(`Arena ${path} failed: ${execution.errors}`);
  }

  const response = JSON.parse(execution.responseBody);
  if (!response.ok) {
    throw new Error(response.error || 'Server error');
  }
  return response;
}

// ===== Types =====

export interface ArenaJoinResult {
  roomId: string;
  docId: string;
  x: number;
  y: number;
  color: string;
  reconnected?: boolean;
}

export interface ArenaPlayerState {
  docId: string;
  playerId: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  score: number;
  level: number;
  stats: TankStats;
  alive: boolean;
  color: string;
  isShooting: boolean;
}

export interface ArenaCallbacks {
  onPlayerJoin: (player: ArenaPlayerState) => void;
  onPlayerUpdate: (player: ArenaPlayerState) => void;
  onPlayerLeave: (docId: string) => void;
}

// ===== Module state =====

let currentRoomId: string | null = null;
let currentDocId: string | null = null;
let unsubscriber: (() => void) | null = null;
let lastSyncTime = 0;
let syncBackoffUntil = 0;
let syncBackoffMs = 1000;
// Adaptive sync: faster when moving, slower when idle
const SYNC_INTERVAL_MOVING = 500;  // ms (~2/sec) when player moves
const SYNC_INTERVAL_IDLE   = 2500; // ms when player is still
// Tracks last successfully sent values to detect meaningful change
let lastSentX = 0;
let lastSentY = 0;
let lastSentAngle = 0;
let lastSentAlive = true;

// ===== Default stats =====

const DEFAULT_STATS: TankStats = {
  healthRegen: 0, maxHealth: 0, bodyDamage: 0,
  bulletSpeed: 0, bulletPenetration: 0, bulletDamage: 0,
  reload: 0, moveSpeed: 0,
};

function parseStats(val: any): TankStats {
  if (!val) return { ...DEFAULT_STATS };
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return { ...DEFAULT_STATS }; }
  }
  return val;
}

function docToPlayerState(doc: any): ArenaPlayerState {
  return {
    docId: doc.$id,
    playerId: doc.playerId,
    name: doc.name || 'Гравець',
    x: doc.x || 0,
    y: doc.y || 0,
    angle: doc.angle || 0,
    hp: doc.hp || 50,
    maxHp: doc.maxHp || 50,
    score: doc.score || 0,
    level: doc.level || 1,
    stats: parseStats(doc.stats),
    alive: doc.alive !== false,
    color: doc.color || '#888',
    isShooting: doc.isShooting || false,
  };
}

// ===== Public API =====

/** Join arena — finds or creates a room, creates player document */
export async function joinArena(name: string): Promise<ArenaJoinResult> {
  const response = await callArenaFunction<any>('/arena/join', { name });
  currentRoomId = response.roomId;
  currentDocId = response.playerDocId;
  lastSyncTime = 0;
  syncBackoffUntil = 0;
  syncBackoffMs = 1000;
  lastSentX = 0;
  lastSentY = 0;
  lastSentAngle = 0;
  lastSentAlive = true;
  return {
    roomId: response.roomId,
    docId: response.playerDocId,
    x: response.x,
    y: response.y,
    color: response.color,
    reconnected: response.reconnected,
  };
}

/** Leave arena — deletes player document, cleans up */
export async function leaveArena(): Promise<void> {
  if (unsubscriber) {
    unsubscriber();
    unsubscriber = null;
  }
  if (currentDocId) {
    try {
      await callArenaFunction('/arena/leave', {
        docId: currentDocId,
        roomId: currentRoomId || '',
      });
    } catch {
      // Ignore — might already be cleaned up
    }
  }
  currentRoomId = null;
  currentDocId = null;
}

/**
 * Sync player state to Appwrite (throttled).
 * Call this every frame — internal throttle limits actual writes to ~6/sec.
 */
export function syncPlayerState(data: {
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  score: number;
  level: number;
  stats: TankStats;
  alive: boolean;
  isShooting: boolean;
}): void {
  const now = Date.now();
  if (now < syncBackoffUntil || !currentDocId) return;

  // Adaptive interval: send faster when actively moving or state changed significantly
  const moved = Math.abs(data.x - lastSentX) > 4 ||
                Math.abs(data.y - lastSentY) > 4 ||
                Math.abs(data.angle - lastSentAngle) > 0.08 ||
                data.alive !== lastSentAlive;
  const interval = moved ? SYNC_INTERVAL_MOVING : SYNC_INTERVAL_IDLE;

  if (now - lastSyncTime < interval) return;
  lastSyncTime = now;

  databases.updateDocument(
    DATABASE_ID,
    ARENA_PLAYERS_COLLECTION_ID,
    currentDocId,
    {
      x: Math.round(data.x * 10) / 10,
      y: Math.round(data.y * 10) / 10,
      angle: Math.round(data.angle * 1000) / 1000,
      hp: Math.round(data.hp * 10) / 10,
      maxHp: Math.round(data.maxHp * 10) / 10,
      score: data.score,
      level: data.level,
      stats: JSON.stringify(data.stats),
      alive: data.alive,
      isShooting: data.isShooting,
      lastUpdate: new Date().toISOString(),
    }
  ).then(() => {
    // Success — update last sent values and reset backoff
    lastSentX = data.x;
    lastSentY = data.y;
    lastSentAngle = data.angle;
    lastSentAlive = data.alive;
    syncBackoffMs = 1000;
  }).catch((e: any) => {
    const msg: string = e?.message || '';
    if (msg.includes('Rate limit') || msg.includes('429')) {
      // Exponential backoff: 2s → 4s → 8s → max 30s
      syncBackoffMs = Math.min(syncBackoffMs * 2, 30000);
      syncBackoffUntil = Date.now() + syncBackoffMs;
      console.warn(`Arena sync rate limited — backing off ${syncBackoffMs}ms`);
    } else {
      console.warn('Arena sync error:', msg);
    }
  });
}

/**
 * Subscribe to arena Realtime updates.
 * Returns unsubscribe function.
 */
export function subscribeToArena(roomId: string, callbacks: ArenaCallbacks): () => void {
  const channel = `databases.${DATABASE_ID}.collections.${ARENA_PLAYERS_COLLECTION_ID}.documents`;

  const unsub = client.subscribe(channel, (event) => {
    const payload = event.payload as any;

    // Filter: only our room, ignore own updates
    if (payload.roomId !== roomId) return;
    if (payload.$id === currentDocId) return;

    const playerState = docToPlayerState(payload);
    const events = event.events || [];
    const eventStr = events.join(',');

    if (eventStr.includes('.create')) {
      callbacks.onPlayerJoin(playerState);
    } else if (eventStr.includes('.delete')) {
      callbacks.onPlayerLeave(payload.$id);
    } else {
      callbacks.onPlayerUpdate(playerState);
    }
  });

  unsubscriber = unsub;
  return unsub;
}

/** Load existing players already in the room */
export async function getExistingPlayers(roomId: string): Promise<ArenaPlayerState[]> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      ARENA_PLAYERS_COLLECTION_ID,
      [
        Query.equal('roomId', roomId),
        Query.limit(50),
      ]
    );

    return response.documents
      .filter((doc: any) => doc.$id !== currentDocId)
      .map(docToPlayerState);
  } catch (e) {
    console.warn('Failed to load existing players:', e);
    return [];
  }
}

/** Report death to server so killer gets score reward */
export async function reportDeath(killerDocId: string, victimScore: number): Promise<void> {
  try {
    await callArenaFunction('/arena/death', {
      killerDocId,
      victimScore,
      roomId: currentRoomId || '',
    });
  } catch {
    // Non-critical — ignore
  }
}

/** Get current document ID */
export function getCurrentDocId(): string | null {
  return currentDocId;
}

/** Get current room ID */
export function getCurrentRoomId(): string | null {
  return currentRoomId;
}
