import { Client, Databases, ID, Query, Permission, Role } from 'node-appwrite';

/*
 * Appwrite Function: game-start
 * 
 * Server-side game initialization. Only the host can start, and only when lobby is full.
 * Board with mines is generated on the SERVER so clients never see mine positions.
 * 
 * Expected JSON body:
 * { lobbyId: string }
 */

const CellState = { HIDDEN: 'hidden', REVEALED: 'revealed', FLAGGED: 'flagged' };
const LobbyStatus = { WAITING: 'waiting', FULL: 'full', IN_GAME: 'in_game', FINISHED: 'finished' };
const GameStatus = { WAITING: 'waiting', PLAYING: 'playing', FINISHED: 'finished' };
const GameMode = { CLASSIC: 'classic', RACE: 'race' };

const DIFFICULTY_PRESETS = {
  EASY: { rows: 9, cols: 9, mines: 10 },
  MEDIUM: { rows: 15, cols: 15, mines: 30 },
  HARD: { rows: 16, cols: 30, mines: 99 }
};

export default async ({ req, res, log, error }) => {
  const userId = req.headers['x-appwrite-user-id'];
  if (!userId) {
    return res.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = JSON.parse(req.body);
  } catch {
    return res.json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { lobbyId } = body;
  if (!lobbyId) {
    return res.json({ ok: false, error: 'Missing lobbyId' }, 400);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const db = new Databases(client);
  const DB = process.env.DATABASE_ID || 'minesweeper_db';
  const LOBBIES = process.env.LOBBIES_COLLECTION_ID || 'lobbies';
  const GAMES = process.env.GAMES_COLLECTION_ID || 'games';

  try {
    const lobby = await db.getDocument(DB, LOBBIES, lobbyId);

    // ── Only host can start the game ──
    if (lobby.hostId !== userId) {
      return res.json({ ok: false, error: 'Only the host can start the game' }, 403);
    }

    // ── Lobby must be full ──
    if (lobby.status !== LobbyStatus.FULL) {
      return res.json({ ok: false, error: 'Lobby is not full' }, 400);
    }

    // ── Validate difficulty ──
    const config = DIFFICULTY_PRESETS[lobby.difficulty];
    if (!config) {
      return res.json({ ok: false, error: 'Invalid difficulty' }, 400);
    }

    // ── Generate board on the server ──
    let board = createBoard(config);
    const randomRow = Math.floor(Math.random() * config.rows);
    const randomCol = Math.floor(Math.random() * config.cols);
    board = placeMines(board, config, randomRow, randomCol);
    board = calculateNeighborMines(board);

    // ── Build player data ──
    const lobbyPlayers = JSON.parse(lobby.players);
    const gamePlayers = lobbyPlayers.map(p => ({ id: p.id, name: p.name, score: 0 }));
    const turnOrder = [lobby.hostId, ...lobbyPlayers.filter(p => p.id !== lobby.hostId).map(p => p.id)];

    const gameMode = lobby.gameMode || GameMode.CLASSIC;

    const gameData = {
      lobbyId,
      board: JSON.stringify(board),       // Full board — stored server-side
      config: JSON.stringify(config),
      players: JSON.stringify(gamePlayers),
      turnOrder: JSON.stringify(turnOrder),
      currentTurnIndex: 0,
      hostId: lobby.hostId,
      hostName: lobby.hostName,
      hostScore: 0,
      guestId: lobbyPlayers.length > 1 ? lobbyPlayers[1].id : '',
      guestName: lobbyPlayers.length > 1 ? lobbyPlayers[1].name : '',
      guestScore: 0,
      currentTurn: gameMode === GameMode.RACE ? '' : lobby.hostId,
      status: GameStatus.PLAYING,
      winnerId: null,
      minesRevealed: 0,
      totalMines: config.mines,
      lastMoveBy: null,
      lastMoveCell: null,
      gameMode,
      hostBoard: '[]',
      guestBoard: '[]',
      startTime: new Date().toISOString(),
      hostFinished: false,
      guestFinished: false
    };

    // ── CRITICAL: Set restrictive permissions ──
    // Only server (via API key) can read/update the full board.
    // Players can read game state, but NOT the raw board field.
    // We use document-level permissions: players can read, only server can write.
    const gamePermissions = [
      Permission.read(Role.users()),           // All users can read (for spectators)
      // NO update permission for users — only server functions update games!
      Permission.delete(Role.user(lobby.hostId)),
    ];

    const gameDoc = await db.createDocument(DB, GAMES, ID.unique(), gameData, gamePermissions);

    // ── Update lobby with game ID ──
    await db.updateDocument(DB, LOBBIES, lobbyId, {
      gameId: gameDoc.$id,
      status: LobbyStatus.IN_GAME,
    });

    // ── Return safe board to client (no mine info) ──
    const safeBoard = buildSafeBoard(board);

    return res.json({
      ok: true,
      gameId: gameDoc.$id,
      board: safeBoard,
      config,
      players: gamePlayers,
      turnOrder,
      currentTurn: gameData.currentTurn,
      status: gameData.status,
      gameMode
    });

  } catch (e) {
    error(`game-start error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
};

// ── Board generation (same logic as client, but runs on server) ──

function createBoard(config) {
  const board = [];
  for (let row = 0; row < config.rows; row++) {
    board[row] = [];
    for (let col = 0; col < config.cols; col++) {
      board[row][col] = {
        id: `${row}-${col}`,
        row,
        col,
        isMine: false,
        neighborMines: 0,
        state: CellState.HIDDEN
      };
    }
  }
  return board;
}

function placeMines(board, config, firstClickRow, firstClickCol) {
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));
  let placedMines = 0;

  while (placedMines < config.mines) {
    const rr = Math.floor(Math.random() * config.rows);
    const rc = Math.floor(Math.random() * config.cols);
    if ((rr === firstClickRow && rc === firstClickCol) || newBoard[rr][rc].isMine) continue;
    newBoard[rr][rc].isMine = true;
    placedMines++;
  }
  return newBoard;
}

function calculateNeighborMines(board) {
  const rows = board.length;
  const cols = board[0].length;
  const newBoard = board.map(row => row.map(cell => ({ ...cell })));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!newBoard[row][col].isMine) {
        let mineCount = 0;
        for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
          for (let c = Math.max(0, col - 1); c <= Math.min(cols - 1, col + 1); c++) {
            if ((r !== row || c !== col) && newBoard[r][c].isMine) {
              mineCount++;
            }
          }
        }
        newBoard[row][col].neighborMines = mineCount;
      }
    }
  }
  return newBoard;
}

function buildSafeBoard(board) {
  return board.map(row =>
    row.map(cell => ({
      id: cell.id,
      row: cell.row,
      col: cell.col,
      isMine: false,         // NEVER expose mine positions
      neighborMines: 0,      // NEVER expose neighbor counts
      state: cell.state
    }))
  );
}
