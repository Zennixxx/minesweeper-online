// Game states
export enum GameStatus {
  READY = 'ready',
  PLAYING = 'playing',
  WON = 'won',
  LOST = 'lost'
}

// Cell states
export enum CellState {
  HIDDEN = 'hidden',
  REVEALED = 'revealed',
  FLAGGED = 'flagged'
}

// Cell interface
export interface Cell {
  id: string;
  row: number;
  col: number;
  isMine: boolean;
  neighborMines: number;
  state: CellState;
}

// Game configuration
export interface GameConfig {
  rows: number;
  cols: number;
  mines: number;
}

// Game difficulty presets
export const DIFFICULTY_PRESETS = {
  EASY: { rows: 9, cols: 9, mines: 10 },
  MEDIUM: { rows: 16, cols: 16, mines: 40 },
  HARD: { rows: 16, cols: 30, mines: 99 }
} as const;

export type DifficultyLevel = keyof typeof DIFFICULTY_PRESETS;