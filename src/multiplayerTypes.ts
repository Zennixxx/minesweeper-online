import { Cell, CellState, GameConfig, DifficultyLevel } from './types';

// Multiplayer Game Status
export enum MultiplayerGameStatus {
  WAITING = 'waiting',      // Ожидание второго игрока
  PLAYING = 'playing',      // Игра идёт
  FINISHED = 'finished'     // Игра завершена
}

// Lobby Status
export enum LobbyStatus {
  WAITING = 'waiting',      // Ожидание игрока
  FULL = 'full',            // Лобби заполнено
  IN_GAME = 'in_game',      // Игра началась
  FINISHED = 'finished'     // Игра завершена
}

// Player in game
export interface Player {
  id: string;
  name: string;
  score: number;
}

// Lobby interface
export interface Lobby {
  $id?: string;
  name: string;
  password: string;
  hostId: string;
  hostName: string;
  guestId: string | null;
  guestName: string | null;
  status: LobbyStatus;
  difficulty: DifficultyLevel;
  createdAt: string;
  gameId: string | null;
}

// Multiplayer Game State
export interface MultiplayerGameState {
  $id?: string;
  lobbyId: string;
  board: string; // JSON stringified Cell[][]
  config: string; // JSON stringified GameConfig
  hostId: string;
  hostName: string;
  hostScore: number;
  guestId: string;
  guestName: string;
  guestScore: number;
  currentTurn: string; // Player ID whose turn it is
  status: MultiplayerGameStatus;
  winnerId: string | null;
  minesRevealed: number;
  totalMines: number;
  lastMoveBy: string | null;
  lastMoveCell: string | null; // "row-col"
}

// Serialize board for storage
export const serializeBoard = (board: Cell[][]): string => {
  return JSON.stringify(board);
};

// Deserialize board from storage
export const deserializeBoard = (boardStr: string): Cell[][] => {
  return JSON.parse(boardStr);
};

// Serialize config for storage
export const serializeConfig = (config: GameConfig): string => {
  return JSON.stringify(config);
};

// Deserialize config from storage
export const deserializeConfig = (configStr: string): GameConfig => {
  return JSON.parse(configStr);
};

// Calculate score for revealing a cell
export const calculateCellScore = (cell: Cell): number => {
  if (cell.isMine) {
    return 0; // No points for mines
  }
  if (cell.neighborMines === 0) {
    return 1; // Empty cells give 1 point
  }
  return cell.neighborMines; // Numbered cells give points equal to the number
};

// Check if game is over (all non-mine cells revealed)
export const isGameOver = (board: Cell[][]): boolean => {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.isMine && cell.state !== CellState.REVEALED) {
        return false;
      }
    }
  }
  return true;
};

// Count revealed cells
export const countRevealedCells = (board: Cell[][]): number => {
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.state === CellState.REVEALED && !cell.isMine) {
        count++;
      }
    }
  }
  return count;
};

// Get total non-mine cells
export const getTotalNonMineCells = (config: GameConfig): number => {
  return config.rows * config.cols - config.mines;
};
