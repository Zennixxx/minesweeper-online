import { Client, Databases, ID, Query, Models } from 'appwrite';

// Appwrite Configuration
// ⚠️ ВАЖНО: Замените эти значения на свои из Appwrite Console
const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1'; // або ваш self-hosted endpoint
const APPWRITE_PROJECT_ID = '697e466f003aeb849026'; // Замініть на ID вашого проекту

// Database and Collection IDs (створіть їх в Appwrite Console)
export const DATABASE_ID = 'minesweeper_db';
export const LOBBIES_COLLECTION_ID = 'lobbies';
export const GAMES_COLLECTION_ID = 'games';

// Initialize Appwrite Client
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

// Initialize Services
export const databases = new Databases(client);
export { client, ID, Query };
export type { Models };

// Helper function to generate player ID (stored in localStorage)
export const getOrCreatePlayerId = (): string => {
  let playerId = localStorage.getItem('minesweeper_player_id');
  if (!playerId) {
    playerId = ID.unique();
    localStorage.setItem('minesweeper_player_id', playerId);
  }
  return playerId;
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
