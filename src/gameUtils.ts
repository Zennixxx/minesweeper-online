import { Cell, CellState, GameConfig, GameStatus } from './types';

// Generate a unique ID for each cell
export const generateCellId = (row: number, col: number): string => `${row}-${col}`;

// Create initial game board
export const createBoard = (config: GameConfig): Cell[][] => {
  const { rows, cols } = config;
  const board: Cell[][] = [];

  // Initialize empty board
  for (let row = 0; row < rows; row++) {
    board[row] = [];
    for (let col = 0; col < cols; col++) {
      board[row][col] = {
        id: generateCellId(row, col),
        row,
        col,
        isMine: false,
        neighborMines: 0,
        state: CellState.HIDDEN
      };
    }
  }

  return board;
};

// Place mines randomly on the board
export const placeMines = (board: Cell[][], config: GameConfig, firstClickRow: number, firstClickCol: number): Cell[][] => {
  const { rows, cols, mines } = config;
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  
  let placedMines = 0;
  
  while (placedMines < mines) {
    const randomRow = Math.floor(Math.random() * rows);
    const randomCol = Math.floor(Math.random() * cols);
    
    // Don't place mine on first click position or if cell already has mine
    if (
      (randomRow === firstClickRow && randomCol === firstClickCol) ||
      newBoard[randomRow][randomCol].isMine
    ) {
      continue;
    }
    
    newBoard[randomRow][randomCol].isMine = true;
    placedMines++;
  }
  
  return newBoard;
};

// Calculate neighbor mines for each cell
export const calculateNeighborMines = (board: Cell[][]): Cell[][] => {
  const rows = board.length;
  const cols = board[0].length;
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!newBoard[row][col].isMine) {
        let mineCount = 0;
        
        // Check all 8 neighbors
        for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
          for (let c = Math.max(0, col - 1); c <= Math.min(cols - 1, col + 1); c++) {
            if (r !== row || c !== col) {
              if (newBoard[r][c].isMine) {
                mineCount++;
              }
            }
          }
        }
        
        newBoard[row][col].neighborMines = mineCount;
      }
    }
  }
  
  return newBoard;
};

// Get all neighbor positions
export const getNeighbors = (row: number, col: number, rows: number, cols: number): [number, number][] => {
  const neighbors: [number, number][] = [];
  
  for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
    for (let c = Math.max(0, col - 1); c <= Math.min(cols - 1, col + 1); c++) {
      if (r !== row || c !== col) {
        neighbors.push([r, c]);
      }
    }
  }
  
  return neighbors;
};

// Reveal cell and auto-reveal empty neighbors
export const revealCells = (board: Cell[][], startRow: number, startCol: number): Cell[][] => {
  const rows = board.length;
  const cols = board[0].length;
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  
  const toReveal: [number, number][] = [[startRow, startCol]];
  const visited = new Set<string>();
  
  while (toReveal.length > 0) {
    const [row, col] = toReveal.pop()!;
    const cellId = generateCellId(row, col);
    
    if (visited.has(cellId) || newBoard[row][col].state !== CellState.HIDDEN) {
      continue;
    }
    
    visited.add(cellId);
    newBoard[row][col].state = CellState.REVEALED;
    
    // If cell has no neighbor mines, reveal all neighbors
    if (newBoard[row][col].neighborMines === 0 && !newBoard[row][col].isMine) {
      const neighbors = getNeighbors(row, col, rows, cols);
      toReveal.push(...neighbors);
    }
  }
  
  return newBoard;
};

// Check if game is won
export const checkWinCondition = (board: Cell[][]): boolean => {
  for (const row of board) {
    for (const cell of row) {
      // If there's a non-mine cell that's still hidden, game is not won
      if (!cell.isMine && cell.state === CellState.HIDDEN) {
        return false;
      }
    }
  }
  return true;
};

// Get game status
export const getGameStatus = (board: Cell[][], hasStarted: boolean): GameStatus => {
  if (!hasStarted) {
    return GameStatus.READY;
  }
  
  // Check if any mine is revealed (game lost)
  for (const row of board) {
    for (const cell of row) {
      if (cell.isMine && cell.state === CellState.REVEALED) {
        return GameStatus.LOST;
      }
    }
  }
  
  // Check win condition
  if (checkWinCondition(board)) {
    return GameStatus.WON;
  }
  
  return GameStatus.PLAYING;
};

// Count flags placed
export const countFlags = (board: Cell[][]): number => {
  let flagCount = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.state === CellState.FLAGGED) {
        flagCount++;
      }
    }
  }
  return flagCount;
};

// Reveal all mines (when game is lost)
export const revealAllMines = (board: Cell[][]): Cell[][] => {
  return board.map(row => 
    row.map(cell => ({
      ...cell,
      state: cell.isMine ? CellState.REVEALED : cell.state
    }))
  );
};