/**
 * multiplayerServiceSecure.ts
 * 
 * Drop-in replacement for multiplayerService.ts that routes all write operations
 * through Appwrite Functions for server-side validation.
 * 
 * Read operations (getLobbies, getLobby, getGame) still use client SDK directly
 * since they only need read access.
 */

import {
  databases,
  DATABASE_ID,
  LOBBIES_COLLECTION_ID,
  GAMES_COLLECTION_ID,
  Query,
  getOrCreatePlayerId,
} from './lib/appwrite';
import {
  Lobby,
  LobbyStatus,
  MultiplayerGameState,
  GameMode,
  deserializeSpectators,
  serializeSpectators,
} from './multiplayerTypes';
import { DifficultyLevel } from './types';
import { client } from './lib/appwrite';
import { Functions, ExecutionMethod } from 'appwrite';

// Initialize Functions service
const functions = new Functions(client);

// Single function ID — all routes go through one function
const FUNCTION_ID = '69892683001dddbac8ac';

// Helper to call an Appwrite Function with path-based routing
async function callFunction<T = any>(path: string, data: Record<string, any>): Promise<T> {
  const execution = await functions.createExecution(
    FUNCTION_ID,
    JSON.stringify(data),
    false,      // async = false (wait for result)
    path,       // path-based routing
    ExecutionMethod.POST,
  );

  if (execution.status === 'failed') {
    throw new Error(`Function ${path} failed: ${execution.errors}`);
  }

  const response = JSON.parse(execution.responseBody);
  if (!response.ok) {
    throw new Error(response.error || 'Unknown server error');
  }

  return response;
}

// ==================== LOBBY FUNCTIONS ====================

// Create a new lobby (through server function)
export const createLobby = async (
  name: string,
  password: string,
  difficulty: DifficultyLevel,
  maxPlayers: number = 2,
  gameMode: string = GameMode.CLASSIC
): Promise<Lobby> => {
  const response = await callFunction('/lobby/create', {
    name,
    password,
    difficulty,
    maxPlayers,
    gameMode,
  });

  return response.lobby as Lobby;
};

// Get all available lobbies (read-only, client SDK is fine)
export const getLobbies = async (): Promise<Lobby[]> => {
  const response = await databases.listDocuments(
    DATABASE_ID,
    LOBBIES_COLLECTION_ID,
    [
      Query.equal('status', [LobbyStatus.WAITING, LobbyStatus.FULL, LobbyStatus.IN_GAME]),
      Query.orderDesc('createdAt'),
      Query.limit(50)
    ]
  );

  return response.documents as unknown as Lobby[];
};

// Get lobby by ID (read-only)
export const getLobby = async (lobbyId: string): Promise<Lobby> => {
  const response = await databases.getDocument(
    DATABASE_ID,
    LOBBIES_COLLECTION_ID,
    lobbyId
  );
  return response as unknown as Lobby;
};

// Join a lobby (through server function)
export const joinLobby = async (lobbyId: string, password: string): Promise<Lobby> => {
  const response = await callFunction('/lobby/join', {
    lobbyId,
    password,
  });

  return response.lobby as Lobby;
};

// Leave lobby (through server function)
export const leaveLobby = async (lobbyId: string): Promise<void> => {
  await callFunction('/lobby/leave', { lobbyId });
};

// Delete lobby (host can directly delete thanks to document-level permissions)
export const deleteLobby = async (lobbyId: string): Promise<void> => {
  await databases.deleteDocument(DATABASE_ID, LOBBIES_COLLECTION_ID, lobbyId);
};

// ==================== GAME FUNCTIONS ====================

// Start a new game (through server function — board generated server-side)
export const startGame = async (lobbyId: string): Promise<MultiplayerGameState> => {
  const response = await callFunction('/game/start', { lobbyId });

  // The response contains a SAFE board (no mine positions)
  return response as unknown as MultiplayerGameState;
};

// Get game by ID (read-only — NOTE: board field contains mines on server,
// but with proper permissions, clients won't see the raw board)
export const getGame = async (gameId: string): Promise<MultiplayerGameState> => {
  const response = await databases.getDocument(
    DATABASE_ID,
    GAMES_COLLECTION_ID,
    gameId
  );
  return response as unknown as MultiplayerGameState;
};

// Make a move in classic mode (through server function)
export const makeMove = async (
  gameId: string,
  row: number,
  col: number
): Promise<MultiplayerGameState> => {
  const response = await callFunction('/game/move', {
    gameId,
    row,
    col,
  });

  return response as unknown as MultiplayerGameState;
};

// Make a move in race mode (through server function)
export const makeRaceMove = async (
  gameId: string,
  row: number,
  col: number
): Promise<MultiplayerGameState> => {
  const response = await callFunction('/game/race-move', {
    gameId,
    row,
    col,
  });

  return response as unknown as MultiplayerGameState;
};

// Leave game / forfeit (through server function)
export const leaveGame = async (gameId: string): Promise<void> => {
  await callFunction('/game/leave', { gameId });
};

// Delete game and lobby completely
export const deleteGameAndLobby = async (gameId: string, lobbyId: string): Promise<void> => {
  try {
    await databases.deleteDocument(DATABASE_ID, GAMES_COLLECTION_ID, gameId);
  } catch { /* already deleted */ }
  try {
    await databases.deleteDocument(DATABASE_ID, LOBBIES_COLLECTION_ID, lobbyId);
  } catch { /* already deleted */ }
};

// Finish game and update lobby
export const finishGame = async (_lobbyId: string): Promise<void> => {
  // This is now handled server-side in the move functions
  // Kept for backwards compatibility but does nothing
};

// ==================== SPECTATOR FUNCTIONS ====================
// Spectator functions can remain client-side since they only modify the spectators array
// and don't affect game integrity

export const joinAsSpectator = async (gameId: string): Promise<MultiplayerGameState> => {
  const game = await getGame(gameId);
  const playerId = getOrCreatePlayerId();
  const spectators = deserializeSpectators(game.spectators);

  if (spectators.includes(playerId)) return game;

  spectators.push(playerId);

  const response = await databases.updateDocument(
    DATABASE_ID,
    GAMES_COLLECTION_ID,
    gameId,
    { spectators: serializeSpectators(spectators) }
  );

  return response as unknown as MultiplayerGameState;
};

export const leaveAsSpectator = async (gameId: string): Promise<void> => {
  try {
    const game = await getGame(gameId);
    const playerId = getOrCreatePlayerId();
    const spectators = deserializeSpectators(game.spectators);
    const newSpectators = spectators.filter(id => id !== playerId);

    if (newSpectators.length !== spectators.length) {
      await databases.updateDocument(
        DATABASE_ID,
        GAMES_COLLECTION_ID,
        gameId,
        { spectators: serializeSpectators(newSpectators) }
      );
    }
  } catch { /* ignore */ }
};
