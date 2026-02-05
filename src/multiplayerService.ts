import { 
  databases, 
  DATABASE_ID, 
  LOBBIES_COLLECTION_ID, 
  GAMES_COLLECTION_ID,
  ID, 
  Query,
  getOrCreatePlayerId,
  getPlayerName
} from './lib/appwrite';
import { 
  Lobby, 
  LobbyStatus, 
  MultiplayerGameState, 
  MultiplayerGameStatus,
  serializeBoard,
  serializeConfig
} from './multiplayerTypes';
import { DifficultyLevel, DIFFICULTY_PRESETS, CellState } from './types';
import { createBoard, placeMines, calculateNeighborMines } from './gameUtils';

// ==================== LOBBY FUNCTIONS ====================

// Create a new lobby
export const createLobby = async (
  name: string, 
  password: string, 
  difficulty: DifficultyLevel
): Promise<Lobby> => {
  const playerId = getOrCreatePlayerId();
  const playerName = getPlayerName();
  
  const lobbyData = {
    name,
    password,
    hostId: playerId,
    hostName: playerName,
    guestId: null,
    guestName: null,
    status: LobbyStatus.WAITING,
    difficulty,
    createdAt: new Date().toISOString(),
    gameId: null
  };

  const response = await databases.createDocument(
    DATABASE_ID,
    LOBBIES_COLLECTION_ID,
    ID.unique(),
    lobbyData
  );

  return response as unknown as Lobby;
};

// Get all available lobbies
export const getLobbies = async (): Promise<Lobby[]> => {
  const response = await databases.listDocuments(
    DATABASE_ID,
    LOBBIES_COLLECTION_ID,
    [
      Query.equal('status', [LobbyStatus.WAITING, LobbyStatus.FULL]),
      Query.orderDesc('createdAt'),
      Query.limit(50)
    ]
  );

  return response.documents as unknown as Lobby[];
};

// Get lobby by ID
export const getLobby = async (lobbyId: string): Promise<Lobby> => {
  const response = await databases.getDocument(
    DATABASE_ID,
    LOBBIES_COLLECTION_ID,
    lobbyId
  );

  return response as unknown as Lobby;
};

// Join a lobby
export const joinLobby = async (lobbyId: string, password: string): Promise<Lobby> => {
  const lobby = await getLobby(lobbyId);
  
  // Check password
  if (lobby.password !== password) {
    throw new Error('Неправильний пароль');
  }

  // Check if lobby is available
  if (lobby.status !== LobbyStatus.WAITING) {
    throw new Error('Лобі вже заповнене');
  }

  const playerId = getOrCreatePlayerId();
  const playerName = getPlayerName();

  // Can't join your own lobby
  if (lobby.hostId === playerId) {
    throw new Error('Ви не можете приєднатися до власного лобі');
  }

  // Update lobby with guest info
  const response = await databases.updateDocument(
    DATABASE_ID,
    LOBBIES_COLLECTION_ID,
    lobbyId,
    {
      guestId: playerId,
      guestName: playerName,
      status: LobbyStatus.FULL
    }
  );

  return response as unknown as Lobby;
};

// Leave lobby
export const leaveLobby = async (lobbyId: string): Promise<void> => {
  const playerId = getOrCreatePlayerId();
  const lobby = await getLobby(lobbyId);

  if (lobby.hostId === playerId) {
    // Host leaves - delete lobby
    await databases.deleteDocument(DATABASE_ID, LOBBIES_COLLECTION_ID, lobbyId);
  } else if (lobby.guestId === playerId) {
    // Guest leaves - update lobby
    await databases.updateDocument(
      DATABASE_ID,
      LOBBIES_COLLECTION_ID,
      lobbyId,
      {
        guestId: null,
        guestName: null,
        status: LobbyStatus.WAITING
      }
    );
  }
};

// Delete lobby
export const deleteLobby = async (lobbyId: string): Promise<void> => {
  await databases.deleteDocument(DATABASE_ID, LOBBIES_COLLECTION_ID, lobbyId);
};

// ==================== GAME FUNCTIONS ====================

// Start a new game
export const startGame = async (lobbyId: string): Promise<MultiplayerGameState> => {
  const lobby = await getLobby(lobbyId);
  
  if (lobby.status !== LobbyStatus.FULL) {
    throw new Error('Лобі не заповнене');
  }

  const config = DIFFICULTY_PRESETS[lobby.difficulty];
  
  // Create board with mines (random first click position)
  let board = createBoard(config);
  const randomRow = Math.floor(Math.random() * config.rows);
  const randomCol = Math.floor(Math.random() * config.cols);
  board = placeMines(board, config, randomRow, randomCol);
  board = calculateNeighborMines(board);

  const gameData = {
    lobbyId,
    board: serializeBoard(board),
    config: serializeConfig(config),
    hostId: lobby.hostId,
    hostName: lobby.hostName,
    hostScore: 0,
    guestId: lobby.guestId!,
    guestName: lobby.guestName!,
    guestScore: 0,
    currentTurn: lobby.hostId, // Host goes first
    status: MultiplayerGameStatus.PLAYING,
    winnerId: null,
    minesRevealed: 0,
    totalMines: config.mines,
    lastMoveBy: null,
    lastMoveCell: null
  };

  const response = await databases.createDocument(
    DATABASE_ID,
    GAMES_COLLECTION_ID,
    ID.unique(),
    gameData
  );

  // Update lobby with game ID
  await databases.updateDocument(
    DATABASE_ID,
    LOBBIES_COLLECTION_ID,
    lobbyId,
    {
      gameId: response.$id,
      status: LobbyStatus.IN_GAME
    }
  );

  return response as unknown as MultiplayerGameState;
};

// Get game by ID
export const getGame = async (gameId: string): Promise<MultiplayerGameState> => {
  const response = await databases.getDocument(
    DATABASE_ID,
    GAMES_COLLECTION_ID,
    gameId
  );

  return response as unknown as MultiplayerGameState;
};

// Make a move in the game
export const makeMove = async (
  gameId: string, 
  row: number, 
  col: number
): Promise<MultiplayerGameState> => {
  const game = await getGame(gameId);
  const playerId = getOrCreatePlayerId();

  // Check if it's player's turn
  if (game.currentTurn !== playerId) {
    throw new Error('Зараз не ваш хід');
  }

  // Check if game is still playing
  if (game.status !== MultiplayerGameStatus.PLAYING) {
    throw new Error('Гра вже завершена');
  }

  // Parse board
  const board = JSON.parse(game.board);
  const cell = board[row][col];

  // Check if cell is already revealed
  if (cell.state === CellState.REVEALED) {
    throw new Error('Ця клітинка вже відкрита');
  }

  // Reveal the cell
  cell.state = CellState.REVEALED;

  let newHostScore = game.hostScore;
  let newGuestScore = game.guestScore;
  let nextTurn = game.currentTurn;
  let newMinesRevealed = game.minesRevealed;

  if (cell.isMine) {
    // Hit a mine - turn passes to opponent
    newMinesRevealed++;
    nextTurn = playerId === game.hostId ? game.guestId : game.hostId;
  } else {
    // Safe cell - add points
    const points = cell.neighborMines === 0 ? 1 : cell.neighborMines;
    
    if (playerId === game.hostId) {
      newHostScore += points;
    } else {
      newGuestScore += points;
    }

    // If empty cell, reveal neighbors (and count all revealed)
    if (cell.neighborMines === 0) {
      const revealed = revealEmptyCells(board, row, col);
      const additionalPoints = revealed.reduce((sum, [r, c]) => {
        const revealedCell = board[r][c];
        return sum + (revealedCell.neighborMines === 0 ? 1 : revealedCell.neighborMines);
      }, 0);
      
      if (playerId === game.hostId) {
        newHostScore += additionalPoints;
      } else {
        newGuestScore += additionalPoints;
      }
    }
    
    // Player keeps their turn after safe move
    nextTurn = playerId;
  }

  // Check if game is over
  const gameOver = checkGameOver(board);
  let status: MultiplayerGameStatus = game.status;
  let winnerId: string | null = null;

  if (gameOver) {
    status = MultiplayerGameStatus.FINISHED;
    if (newHostScore > newGuestScore) {
      winnerId = game.hostId;
    } else if (newGuestScore > newHostScore) {
      winnerId = game.guestId;
    } else {
      winnerId = 'draw';
    }
  }

  // Update game
  const response = await databases.updateDocument(
    DATABASE_ID,
    GAMES_COLLECTION_ID,
    gameId,
    {
      board: JSON.stringify(board),
      hostScore: newHostScore,
      guestScore: newGuestScore,
      currentTurn: nextTurn,
      status,
      winnerId,
      minesRevealed: newMinesRevealed,
      lastMoveBy: playerId,
      lastMoveCell: `${row}-${col}`
    }
  );

  return response as unknown as MultiplayerGameState;
};

// Helper: Reveal empty cells recursively
const revealEmptyCells = (board: any[][], startRow: number, startCol: number): [number, number][] => {
  const rows = board.length;
  const cols = board[0].length;
  const revealed: [number, number][] = [];
  const toCheck: [number, number][] = [[startRow, startCol]];
  const visited = new Set<string>();

  while (toCheck.length > 0) {
    const [row, col] = toCheck.pop()!;
    const key = `${row}-${col}`;

    if (visited.has(key)) continue;
    visited.add(key);

    const cell = board[row][col];
    if (cell.state === CellState.REVEALED && (row !== startRow || col !== startCol)) continue;

    if (cell.neighborMines === 0 && !cell.isMine) {
      // Check all neighbors
      for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
        for (let c = Math.max(0, col - 1); c <= Math.min(cols - 1, col + 1); c++) {
          if (r !== row || c !== col) {
            const neighbor = board[r][c];
            if (neighbor.state !== CellState.REVEALED && !neighbor.isMine) {
              neighbor.state = CellState.REVEALED;
              revealed.push([r, c]);
              if (neighbor.neighborMines === 0) {
                toCheck.push([r, c]);
              }
            }
          }
        }
      }
    }
  }

  return revealed;
};

// Helper: Check if game is over
const checkGameOver = (board: any[][]): boolean => {
  // Game is over if all non-mine cells are revealed
  for (const row of board) {
    for (const cell of row) {
      if (!cell.isMine && cell.state !== CellState.REVEALED) {
        return false;
      }
    }
  }
  return true;
};

// Finish game and update lobby
export const finishGame = async (lobbyId: string): Promise<void> => {
  await databases.updateDocument(
    DATABASE_ID,
    LOBBIES_COLLECTION_ID,
    lobbyId,
    {
      status: LobbyStatus.FINISHED
    }
  );
};

// Leave game (forfeit) - the other player wins
export const leaveGame = async (gameId: string): Promise<void> => {
  const game = await getGame(gameId);
  const playerId = getOrCreatePlayerId();

  // Only allow leaving if game is still in progress
  if (game.status !== MultiplayerGameStatus.PLAYING) {
    return;
  }

  // Determine winner (the one who didn't leave)
  const winnerId = playerId === game.hostId ? game.guestId : game.hostId;

  // Update game as finished with winner
  await databases.updateDocument(
    DATABASE_ID,
    GAMES_COLLECTION_ID,
    gameId,
    {
      status: MultiplayerGameStatus.FINISHED,
      winnerId: winnerId
    }
  );

  // Delete the lobby
  try {
    await databases.deleteDocument(DATABASE_ID, LOBBIES_COLLECTION_ID, game.lobbyId);
  } catch (e) {
    // Lobby might already be deleted
  }
};

// Delete game and lobby completely
export const deleteGameAndLobby = async (gameId: string, lobbyId: string): Promise<void> => {
  try {
    await databases.deleteDocument(DATABASE_ID, GAMES_COLLECTION_ID, gameId);
  } catch (e) {
    // Game might already be deleted
  }
  try {
    await databases.deleteDocument(DATABASE_ID, LOBBIES_COLLECTION_ID, lobbyId);
  } catch (e) {
    // Lobby might already be deleted
  }
};
