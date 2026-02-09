import { Client, Databases, Account, ID, Query, Models, OAuthProvider, Permission, Role } from 'appwrite';

// Appwrite Configuration — loaded from .env (VITE_ prefix)
const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT as string;
const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID as string;

// Database and Collection IDs
export const DATABASE_ID = import.meta.env.VITE_DATABASE_ID as string;
export const LOBBIES_COLLECTION_ID = import.meta.env.VITE_LOBBIES_COLLECTION_ID as string;
export const GAMES_COLLECTION_ID = import.meta.env.VITE_GAMES_COLLECTION_ID as string;

// Function ID
export const FUNCTION_ID = import.meta.env.VITE_FUNCTION_ID as string;

// Initialize Appwrite Client
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

// Initialize Services
export const databases = new Databases(client);
export const account = new Account(client);
export { client, ID, Query, OAuthProvider, Permission, Role };
export type { Models };

// In-memory player ID — set from Appwrite session, never persisted to localStorage
let _cachedPlayerId: string = '';

export const setPlayerId = (id: string): void => {
  _cachedPlayerId = id;
};

export const getOrCreatePlayerId = (): string => {
  return _cachedPlayerId;
};

// Helper function to get/set player name
export const getPlayerName = (): string => {
  return localStorage.getItem('minesweeper_player_name') || 'Гравець';
};

export const setPlayerName = (name: string): void => {
  localStorage.setItem('minesweeper_player_name', name);
};

// Session state management
export const saveGameSession = (gameId: string, lobbyId: string | null, isSpectator: boolean = false): void => {
  localStorage.setItem('minesweeper_active_game', JSON.stringify({ gameId, lobbyId, isSpectator }));
};

export const getGameSession = (): { gameId: string; lobbyId: string | null; isSpectator: boolean } | null => {
  const session = localStorage.getItem('minesweeper_active_game');
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
};

export const clearGameSession = (): void => {
  localStorage.removeItem('minesweeper_active_game');
};
