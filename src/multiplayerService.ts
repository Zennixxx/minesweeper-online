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
  serializeConfig,
  LobbyPlayer,
  GamePlayer,
  serializePlayers,
  deserializeLobbyPlayers,
  deserializeGamePlayers,
  deserializeTurnOrder,
  serializeSpectators,
  deserializeSpectators
} from './multiplayerTypes';
import { DifficultyLevel, DIFFICULTY_PRESETS, CellState } from './types';
import { createBoard, placeMines, calculateNeighborMines } from './gameUtils';

// ==================== LOBBY FUNCTIONS ====================

// Create a new lobby
export const createLobby = async (
  name: string, 
  password: string, 
  difficulty: DifficultyLevel,
  maxPlayers: number = 2
): Promise<Lobby> => {
  const playerId = getOrCreatePlayerId();
  const playerName = getPlayerName();
  
  const players: LobbyPlayer[] = [{ id: playerId, name: playerName }];
  
  const lobbyData = {
    name,
    password,
    hostId: playerId,
    hostName: playerName,
    maxPlayers,
    players: serializePlayers(players),
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
      Query.equal('status', [LobbyStatus.WAITING, LobbyStatus.FULL, LobbyStatus.IN_GAME]),
      Query.orderDesc('createdAt'),
      Query.limit(50)
    ]
  );

  // Filter out lobbies where the game has finished
  const lobbies = response.documents as unknown as Lobby[];
  const activeLobbies: Lobby[] = [];
  
  for (const lobby of lobbies) {
    if (lobby.status === LobbyStatus.IN_GAME && lobby.gameId) {
      try {
        const game = await databases.getDocument(DATABASE_ID, GAMES_COLLECTION_ID, lobby.gameId) as unknown as MultiplayerGameState;
        if (game.status === MultiplayerGameStatus.FINISHED) {
          // Delete finished lobby
          try {
            await databases.deleteDocument(DATABASE_ID, LOBBIES_COLLECTION_ID, lobby.$id!);
          } catch (e) {
            // Ignore deletion errors
          }
          continue;
        }
      } catch (e) {
        // Game not found, skip this lobby
        continue;
      }
    }
    activeLobbies.push(lobby);
  }

  return activeLobbies;
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
  
  // Check password only if lobby has one
  if (lobby.password && lobby.password !== password) {
    throw new Error('Неправильний пароль');
  }

  const playerId = getOrCreatePlayerId();
  const playerName = getPlayerName();
  
  // Parse current players
  const players = deserializeLobbyPlayers(lobby.players);
  const maxPlayers = lobby.maxPlayers || 2;

  // Check if already in lobby
  if (players.some(p => p.id === playerId)) {
    throw new Error('Ви вже в цьому лобі');
  }

  // Check if lobby is full
  if (players.length >= maxPlayers) {
    throw new Error('Лобі вже заповнене');
  }

  // Add player to array
  players.push({ id: playerId, name: playerName });
  
  // Determine new status
  const newStatus = players.length >= maxPlayers ? LobbyStatus.FULL : LobbyStatus.WAITING;
  
  // For backwards compatibility, also update guestId/guestName for 2-player lobbies
  const updateData: any = {
    players: serializePlayers(players),
    status: newStatus
  };
  
  if (maxPlayers === 2 && players.length === 2) {
    updateData.guestId = playerId;
    updateData.guestName = playerName;
  }

  const response = await databases.updateDocument(
    DATABASE_ID,
    LOBBIES_COLLECTION_ID,
    lobbyId,
    updateData
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
  } else {
    // Non-host leaves - remove from players array
    const players = deserializeLobbyPlayers(lobby.players);
    const filteredPlayers = players.filter(p => p.id !== playerId);
    
    const updateData: any = {
      players: serializePlayers(filteredPlayers),
      status: LobbyStatus.WAITING
    };
    
    // For backwards compatibility
    if (lobby.guestId === playerId) {
      updateData.guestId = null;
      updateData.guestName = null;
    }
    
    await databases.updateDocument(
      DATABASE_ID,
      LOBBIES_COLLECTION_ID,
      lobbyId,
      updateData
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

  // Get players from lobby
  const lobbyPlayers = deserializeLobbyPlayers(lobby.players);
  
  // Create game players with scores
  const gamePlayers: GamePlayer[] = lobbyPlayers.map(p => ({
    id: p.id,
    name: p.name,
    score: 0
  }));
  
  // Create turn order (host first, then randomize others)
  const turnOrder = [lobby.hostId, ...lobbyPlayers.filter(p => p.id !== lobby.hostId).map(p => p.id)];

  const gameData: any = {
    lobbyId,
    board: serializeBoard(board),
    config: serializeConfig(config),
    players: serializePlayers(gamePlayers),
    turnOrder: JSON.stringify(turnOrder),
    currentTurnIndex: 0,
    // Backwards compatibility fields
    hostId: lobby.hostId,
    hostName: lobby.hostName,
    hostScore: 0,
    guestId: lobbyPlayers.length > 1 ? lobbyPlayers[1].id : '',
    guestName: lobbyPlayers.length > 1 ? lobbyPlayers[1].name : '',
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

  // Parse board and players
  const board = JSON.parse(game.board);
  const gamePlayers = deserializeGamePlayers(game.players);
  const turnOrder = deserializeTurnOrder(game.turnOrder);
  let currentTurnIndex = game.currentTurnIndex || 0;
  const cell = board[row][col];

  // Check if cell is already revealed
  if (cell.state === CellState.REVEALED) {
    throw new Error('Ця клітинка вже відкрита');
  }

  // Reveal the cell
  cell.state = CellState.REVEALED;

  let newMinesRevealed = game.minesRevealed;
  let nextTurn = game.currentTurn;
  let nextTurnIndex = currentTurnIndex;

  // Find current player in players array
  const currentPlayerIndex = gamePlayers.findIndex(p => p.id === playerId);

  if (cell.isMine) {
    // Hit a mine - turn passes to next player
    newMinesRevealed++;
    if (turnOrder.length > 0) {
      nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
      nextTurn = turnOrder[nextTurnIndex];
    } else {
      // Fallback for old format
      nextTurn = playerId === game.hostId ? game.guestId : game.hostId;
    }
  } else {
    // Safe cell - add points
    const points = cell.neighborMines === 0 ? 1 : cell.neighborMines;
    
    if (currentPlayerIndex >= 0) {
      gamePlayers[currentPlayerIndex].score += points;
    }

    // If empty cell, reveal neighbors (and count all revealed)
    if (cell.neighborMines === 0) {
      const revealed = revealEmptyCells(board, row, col);
      const additionalPoints = revealed.reduce((sum, [r, c]) => {
        const revealedCell = board[r][c];
        return sum + (revealedCell.neighborMines === 0 ? 1 : revealedCell.neighborMines);
      }, 0);
      
      if (currentPlayerIndex >= 0) {
        gamePlayers[currentPlayerIndex].score += additionalPoints;
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
    
    // Find winner (player with highest score)
    if (gamePlayers.length > 0) {
      const maxScore = Math.max(...gamePlayers.map(p => p.score));
      const winners = gamePlayers.filter(p => p.score === maxScore);
      
      if (winners.length === 1) {
        winnerId = winners[0].id;
      } else {
        winnerId = 'draw';
      }
    } else {
      // Fallback for old format
      const hostScore = gamePlayers.find(p => p.id === game.hostId)?.score || game.hostScore;
      const guestScore = gamePlayers.find(p => p.id === game.guestId)?.score || game.guestScore;
      
      if (hostScore > guestScore) {
        winnerId = game.hostId;
      } else if (guestScore > hostScore) {
        winnerId = game.guestId;
      } else {
        winnerId = 'draw';
      }
    }
  }

  // Update backwards compatibility scores
  const hostScore = gamePlayers.find(p => p.id === game.hostId)?.score || 0;
  const guestScore = gamePlayers.find(p => p.id === game.guestId)?.score || 0;

  // Update game
  const response = await databases.updateDocument(
    DATABASE_ID,
    GAMES_COLLECTION_ID,
    gameId,
    {
      board: JSON.stringify(board),
      players: serializePlayers(gamePlayers),
      currentTurnIndex: nextTurnIndex,
      hostScore,
      guestScore,
      currentTurn: nextTurn,
      status,
      winnerId,
      minesRevealed: newMinesRevealed,
      lastMoveBy: playerId,
      lastMoveCell: `${row}-${col}`
    }
  );

  // If game finished, delete the lobby
  if (gameOver) {
    try {
      await databases.deleteDocument(DATABASE_ID, LOBBIES_COLLECTION_ID, game.lobbyId);
    } catch (e) {
      // Lobby might already be deleted
    }
  }

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

// ==================== SPECTATOR FUNCTIONS ====================

// Join a game as spectator
export const joinAsSpectator = async (gameId: string): Promise<MultiplayerGameState> => {
  const game = await getGame(gameId);
  const playerId = getOrCreatePlayerId();
  
  // Get current spectators
  const spectators = deserializeSpectators(game.spectators);
  
  // Check if already spectating
  if (spectators.includes(playerId)) {
    return game;
  }
  
  // Add to spectators
  spectators.push(playerId);
  
  // Update game
  const response = await databases.updateDocument(
    DATABASE_ID,
    GAMES_COLLECTION_ID,
    gameId,
    {
      spectators: serializeSpectators(spectators)
    }
  );
  
  return response as unknown as MultiplayerGameState;
};

// Leave game as spectator
export const leaveAsSpectator = async (gameId: string): Promise<void> => {
  try {
    const game = await getGame(gameId);
    const playerId = getOrCreatePlayerId();
    
    // Get current spectators
    const spectators = deserializeSpectators(game.spectators);
    
    // Remove from spectators
    const newSpectators = spectators.filter(id => id !== playerId);
    
    // Only update if there was a change
    if (newSpectators.length !== spectators.length) {
      await databases.updateDocument(
        DATABASE_ID,
        GAMES_COLLECTION_ID,
        gameId,
        {
          spectators: serializeSpectators(newSpectators)
        }
      );
    }
  } catch (e) {
    // Game might be deleted or already finished - ignore
  }
};
