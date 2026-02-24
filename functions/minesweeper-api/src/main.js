import { Client, Databases, ID, Query, Permission, Role, Users } from 'node-appwrite';
import * as crypto from 'crypto';

// ════════════════════════════════════════════════════════════════
//  Minesweeper Online — Unified Appwrite Function (SECURE)
//
//  SECURITY: Real board with mines is stored in a PRIVATE collection
//  (game_boards) that clients cannot read. The public `games` collection
//  only ever contains a sanitized "safe board" (mines hidden).
//
//  Routes by req.path:
//    POST /lobby/create
//    POST /lobby/join
//    POST /lobby/leave
//    POST /game/start
//    POST /game/move
//    POST /game/race-move
//    POST /game/leave
//    POST /game/spectator-join
//    POST /game/spectator-leave
//    POST /cleanup          (also triggered by CRON schedule)
// ════════════════════════════════════════════════════════════════

const CellState = { HIDDEN: 'hidden', REVEALED: 'revealed', FLAGGED: 'flagged' };
const LobbyStatus = { WAITING: 'waiting', FULL: 'full', IN_GAME: 'in_game', FINISHED: 'finished' };
const GameStatus = { WAITING: 'waiting', PLAYING: 'playing', FINISHED: 'finished' };
const GameMode = { CLASSIC: 'classic', RACE: 'race' };

const DIFFICULTY_PRESETS = {
  EASY: { rows: 9, cols: 9, mines: 10 },
  MEDIUM: { rows: 15, cols: 15, mines: 30 },
  HARD: { rows: 16, cols: 30, mines: 99 }
};

const VALID_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const VALID_GAME_MODES = ['classic', 'race'];

// ── Shared init ──
function initAppwrite() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  return {
    client,
    db: new Databases(client),
    users: new Users(client),
    DB: process.env.DATABASE_ID || 'minesweeper_db',
    LOBBIES: process.env.LOBBIES_COLLECTION_ID || 'lobbies',
    GAMES: process.env.GAMES_COLLECTION_ID || 'games',
    // Private collection — NO user read/write permissions!
    GAME_BOARDS: process.env.GAME_BOARDS_COLLECTION_ID || 'game_boards',
  };
}

function parseBody(req) {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return null;
  }
}

// ══════════════════════════════════════
//  MAIN ROUTER
// ══════════════════════════════════════
export default async (context) => {
  const { req, res, log, error } = context;
  const path = (req.path || '/').replace(/\/+$/, '') || '/';

  log(`[ROUTER] ${req.method} ${path}`);
  log(`[ROUTER] userId: ${req.headers['x-appwrite-user-id'] || 'none'}`);

  // Cleanup can be triggered by CRON (no auth needed)
  if (path === '/cleanup') {
    return handleCleanup(context);
  }

  // All other routes require authentication
  const userId = req.headers['x-appwrite-user-id'];
  if (!userId) {
    log(`[AUTH] Unauthorized — no x-appwrite-user-id header`);
    return res.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const body = parseBody(req);
  if (body === null) {
    log(`[PARSE] Invalid JSON body`);
    return res.json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  log(`[ROUTE] → ${path} | user: ${userId}`);

  let result;
  switch (path) {
    case '/lobby/create':
      result = await handleLobbyCreate(context, userId, body);
      break;
    case '/lobby/join':
      result = await handleLobbyJoin(context, userId, body);
      break;
    case '/lobby/leave':
      result = await handleLobbyLeave(context, userId, body);
      break;
    case '/game/start':
      result = await handleGameStart(context, userId, body);
      break;
    case '/game/move':
      result = await handleGameMove(context, userId, body);
      break;
    case '/game/race-move':
      result = await handleGameRaceMove(context, userId, body);
      break;
    case '/game/leave':
      result = await handleGameLeave(context, userId, body);
      break;
    case '/game/spectator-join':
      result = await handleSpectatorJoin(context, userId, body);
      break;
    case '/game/spectator-leave':
      result = await handleSpectatorLeave(context, userId, body);
      break;
    case '/arena/join':
      result = await handleArenaJoin(context, userId, body);
      break;
    case '/arena/leave':
      result = await handleArenaLeave(context, userId, body);
      break;
    case '/arena/death':
      result = await handleArenaDeath(context, userId, body);
      break;
    default:
      log(`[ROUTE] Unknown route: ${path}`);
      result = res.json({ ok: false, error: `Unknown route: ${path}` }, 404);
  }
  return result;
};

// ══════════════════════════════════════
//  LOBBY: CREATE
// ══════════════════════════════════════
async function handleLobbyCreate({ res, log, error: logError }, userId, body) {
  const { name, password, difficulty, maxPlayers, gameMode } = body;
  log(`[lobby/create] user=${userId} name="${name}" difficulty=${difficulty} mode=${gameMode} maxPlayers=${maxPlayers}`);

  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 50) {
    return res.json({ ok: false, error: 'Name must be 1-50 characters' }, 400);
  }
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return res.json({ ok: false, error: 'Invalid difficulty' }, 400);
  }
  const mode = gameMode || 'classic';
  if (!VALID_GAME_MODES.includes(mode)) {
    return res.json({ ok: false, error: 'Invalid game mode' }, 400);
  }
  const maxP = Math.min(Math.max(parseInt(maxPlayers) || 2, 2), 4);

  const { db, users, DB, LOBBIES } = initAppwrite();

  try {
    // Check if player already in a lobby
    const existing = await db.listDocuments(DB, LOBBIES, [
      Query.equal('status', [LobbyStatus.WAITING, LobbyStatus.FULL]),
      Query.limit(100)
    ]);
    for (const doc of existing.documents) {
      if (doc.hostId === userId) {
        return res.json({ ok: false, error: 'You are already in a lobby. Leave it first.' }, 400);
      }
      try {
        const players = JSON.parse(doc.players);
        if (players.some(p => p.id === userId)) {
          return res.json({ ok: false, error: 'You are already in a lobby. Leave it first.' }, 400);
        }
      } catch { /* skip */ }
    }

    // Get server-verified user name
    let playerName = 'Гравець';
    try {
      const user = await users.get(userId);
      playerName = user.name || 'Гравець';
    } catch { /* fallback */ }

    // Hash password
    let passwordHash = '';
    let passwordSalt = '';
    if (password && password.trim().length > 0) {
      passwordSalt = crypto.randomBytes(16).toString('hex');
      passwordHash = crypto.createHash('sha256').update(password + passwordSalt).digest('hex');
    }

    const players = [{ id: userId, name: playerName }];
    const lobbyData = {
      name: name.trim().substring(0, 50),
      password: passwordHash,
      passwordSalt,
      hostId: userId,
      hostName: playerName,
      maxPlayers: maxP,
      players: JSON.stringify(players),
      guestId: null,
      guestName: null,
      status: LobbyStatus.WAITING,
      difficulty,
      gameMode: mode,
      createdAt: new Date().toISOString(),
      gameId: null
    };

    const lobbyDoc = await db.createDocument(DB, LOBBIES, ID.unique(), lobbyData, [
      Permission.read(Role.users()),
      Permission.delete(Role.user(userId)),
    ]);

    log(`[lobby/create] ✅ Created lobby ${lobbyDoc.$id} by ${playerName}`);
    return res.json({
      ok: true,
      lobby: {
        $id: lobbyDoc.$id, name: lobbyDoc.name, hostId: lobbyDoc.hostId,
        hostName: lobbyDoc.hostName, maxPlayers: lobbyDoc.maxPlayers,
        players: lobbyDoc.players, status: lobbyDoc.status,
        difficulty: lobbyDoc.difficulty, gameMode: lobbyDoc.gameMode,
        createdAt: lobbyDoc.createdAt, gameId: lobbyDoc.gameId,
        hasPassword: !!passwordHash
      }
    });
  } catch (e) {
    logError(`lobby-create error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  LOBBY: JOIN
// ══════════════════════════════════════
async function handleLobbyJoin({ res, log, error: logError }, userId, body) {
  const { lobbyId, password } = body;
  log(`[lobby/join] user=${userId} lobbyId=${lobbyId}`);
  if (!lobbyId) return res.json({ ok: false, error: 'Missing lobbyId' }, 400);

  const { db, users, DB, LOBBIES } = initAppwrite();

  try {
    const lobby = await db.getDocument(DB, LOBBIES, lobbyId);

    // Verify password
    if (lobby.password && lobby.password.length > 0) {
      const salt = lobby.passwordSalt || '';
      const inputHash = crypto.createHash('sha256').update((password || '') + salt).digest('hex');
      if (inputHash !== lobby.password) {
        log(`[lobby/join] ❌ Password mismatch`);
        return res.json({ ok: false, error: 'Incorrect password' }, 403);
      }
    }

    const players = JSON.parse(lobby.players || '[]');
    const maxPlayers = lobby.maxPlayers || 2;

    if (players.some(p => p.id === userId)) {
      return res.json({ ok: false, error: 'You are already in this lobby' }, 400);
    }
    if (players.length >= maxPlayers) {
      return res.json({ ok: false, error: 'Lobby is full' }, 400);
    }
    if (lobby.status !== LobbyStatus.WAITING) {
      return res.json({ ok: false, error: 'Lobby is not accepting players' }, 400);
    }

    // Check if player is in another lobby
    const existing = await db.listDocuments(DB, LOBBIES, [
      Query.equal('status', [LobbyStatus.WAITING, LobbyStatus.FULL]),
      Query.limit(100)
    ]);
    for (const doc of existing.documents) {
      if (doc.$id === lobbyId) continue;
      if (doc.hostId === userId) {
        return res.json({ ok: false, error: 'You are already in another lobby' }, 400);
      }
      try {
        const otherPlayers = JSON.parse(doc.players);
        if (otherPlayers.some(p => p.id === userId)) {
          return res.json({ ok: false, error: 'You are already in another lobby' }, 400);
        }
      } catch { /* skip */ }
    }

    let playerName = 'Гравець';
    try {
      const user = await users.get(userId);
      playerName = user.name || 'Гравець';
    } catch { /* fallback */ }

    players.push({ id: userId, name: playerName });
    const newStatus = players.length >= maxPlayers ? LobbyStatus.FULL : LobbyStatus.WAITING;

    const updateData = { players: JSON.stringify(players), status: newStatus };
    if (maxPlayers === 2 && players.length === 2) {
      updateData.guestId = userId;
      updateData.guestName = playerName;
    }

    await db.updateDocument(DB, LOBBIES, lobbyId, updateData);

    log(`[lobby/join] ✅ ${playerName} joined lobby ${lobbyId} (${players.length}/${maxPlayers})`);
    return res.json({
      ok: true,
      lobby: {
        $id: lobby.$id, name: lobby.name, hostId: lobby.hostId,
        hostName: lobby.hostName, maxPlayers,
        players: JSON.stringify(players), status: newStatus,
        difficulty: lobby.difficulty, gameMode: lobby.gameMode,
        createdAt: lobby.createdAt, gameId: lobby.gameId,
        hasPassword: !!lobby.password
      }
    });
  } catch (e) {
    logError(`lobby-join error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  LOBBY: LEAVE
// ══════════════════════════════════════
async function handleLobbyLeave({ res, log, error: logError }, userId, body) {
  const { lobbyId } = body;
  log(`[lobby/leave] user=${userId} lobbyId=${lobbyId}`);
  if (!lobbyId) return res.json({ ok: false, error: 'Missing lobbyId' }, 400);

  const { db, DB, LOBBIES } = initAppwrite();

  try {
    const lobby = await db.getDocument(DB, LOBBIES, lobbyId);
    const players = JSON.parse(lobby.players || '[]');
    const isHost = lobby.hostId === userId;
    const isPlayer = players.some(p => p.id === userId);

    if (!isHost && !isPlayer) {
      return res.json({ ok: false, error: 'You are not in this lobby' }, 403);
    }

    if (isHost) {
      await db.deleteDocument(DB, LOBBIES, lobbyId);
      log(`[lobby/leave] ✅ Host deleted lobby ${lobbyId}`);
      return res.json({ ok: true, action: 'deleted' });
    }

    const filteredPlayers = players.filter(p => p.id !== userId);
    const updateData = { players: JSON.stringify(filteredPlayers), status: LobbyStatus.WAITING };
    if (lobby.guestId === userId) {
      updateData.guestId = null;
      updateData.guestName = null;
    }

    await db.updateDocument(DB, LOBBIES, lobbyId, updateData);
    log(`[lobby/leave] ✅ Player ${userId} left lobby ${lobbyId}`);
    return res.json({ ok: true, action: 'left' });
  } catch (e) {
    logError(`lobby-leave error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  GAME: START
//  Real board → private game_boards collection
//  Safe board → public games collection
// ══════════════════════════════════════
async function handleGameStart({ res, log, error: logError }, userId, body) {
  const { lobbyId } = body;
  log(`[game/start] user=${userId} lobbyId=${lobbyId}`);
  if (!lobbyId) return res.json({ ok: false, error: 'Missing lobbyId' }, 400);

  const { db, DB, LOBBIES, GAMES, GAME_BOARDS } = initAppwrite();

  try {
    const lobby = await db.getDocument(DB, LOBBIES, lobbyId);

    if (lobby.hostId !== userId) {
      return res.json({ ok: false, error: 'Only the host can start the game' }, 403);
    }
    if (lobby.status !== LobbyStatus.FULL) {
      return res.json({ ok: false, error: 'Lobby is not full' }, 400);
    }

    const config = DIFFICULTY_PRESETS[lobby.difficulty];
    if (!config) return res.json({ ok: false, error: 'Invalid difficulty' }, 400);

    // Generate board on server
    let board = createBoard(config);
    const randomRow = Math.floor(Math.random() * config.rows);
    const randomCol = Math.floor(Math.random() * config.cols);
    board = placeMines(board, config, randomRow, randomCol);
    board = calculateNeighborMines(board);

    const lobbyPlayers = JSON.parse(lobby.players);
    const gamePlayers = lobbyPlayers.map(p => ({ id: p.id, name: p.name, score: 0 }));
    const turnOrder = [lobby.hostId, ...lobbyPlayers.filter(p => p.id !== lobby.hostId).map(p => p.id)];
    const gameMode = lobby.gameMode || GameMode.CLASSIC;

    // Safe board for clients — mines hidden
    const safeBoard = buildSafeBoard(board, false);

    const gameData = {
      lobbyId,
      // PUBLIC board field — only sanitized data (no mine positions)
      board: JSON.stringify(safeBoard),
      config: JSON.stringify(config),
      players: JSON.stringify(gamePlayers),
      turnOrder: JSON.stringify(turnOrder),
      currentTurnIndex: 0,
      hostId: lobby.hostId, hostName: lobby.hostName, hostScore: 0,
      guestId: lobbyPlayers.length > 1 ? lobbyPlayers[1].id : '',
      guestName: lobbyPlayers.length > 1 ? lobbyPlayers[1].name : '',
      guestScore: 0,
      currentTurn: gameMode === GameMode.RACE ? '' : lobby.hostId,
      status: GameStatus.PLAYING,
      winnerId: null, minesRevealed: 0, totalMines: config.mines,
      lastMoveBy: null, lastMoveCell: null,
      gameMode,
      hostBoard: '[]', guestBoard: '[]',
      startTime: new Date().toISOString(),
      hostFinished: false, guestFinished: false,
      spectators: '[]'
    };

    const gameDoc = await db.createDocument(DB, GAMES, ID.unique(), gameData, [
      Permission.read(Role.users()),
      Permission.delete(Role.user(lobby.hostId)),
    ]);

    // Store the REAL board in the PRIVATE collection (no user permissions!)
    await db.createDocument(DB, GAME_BOARDS, gameDoc.$id, {
      board: JSON.stringify(board),
    });

    await db.updateDocument(DB, LOBBIES, lobbyId, {
      gameId: gameDoc.$id,
      status: LobbyStatus.IN_GAME,
    });

    log(`[game/start] ✅ Game ${gameDoc.$id} started (mode=${gameMode}, ${config.rows}x${config.cols}, ${config.mines} mines)`);
    return res.json({
      ok: true, gameId: gameDoc.$id,
      board: safeBoard,
      config, players: gamePlayers, turnOrder,
      currentTurn: gameData.currentTurn,
      status: gameData.status, gameMode
    });
  } catch (e) {
    logError(`game-start error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  GAME: MOVE (classic turn-based)
// ══════════════════════════════════════
async function handleGameMove({ res, log, error: logError }, userId, body) {
  const { gameId, row, col } = body;
  log(`[game/move] user=${userId} gameId=${gameId} row=${row} col=${col}`);
  if (!gameId || row == null || col == null) {
    return res.json({ ok: false, error: 'Missing gameId, row, or col' }, 400);
  }

  const { db, DB, GAMES, LOBBIES, GAME_BOARDS } = initAppwrite();

  try {
    const game = await db.getDocument(DB, GAMES, gameId);

    if (game.status !== GameStatus.PLAYING) {
      return res.json({ ok: false, error: 'Game is not in playing state' }, 400);
    }
    if (game.gameMode === 'race') {
      return res.json({ ok: false, error: 'Use /game/race-move for race mode' }, 400);
    }
    if (game.currentTurn !== userId) {
      return res.json({ ok: false, error: 'Not your turn' }, 403);
    }

    const gamePlayers = JSON.parse(game.players);
    const currentPlayerIndex = gamePlayers.findIndex(p => p.id === userId);
    if (currentPlayerIndex < 0) {
      return res.json({ ok: false, error: 'You are not a player in this game' }, 403);
    }

    // Read the REAL board from private collection
    const boardDoc = await db.getDocument(DB, GAME_BOARDS, gameId);
    const board = JSON.parse(boardDoc.board);
    const rows = board.length;
    const cols = board[0].length;

    if (row < 0 || row >= rows || col < 0 || col >= cols) {
      return res.json({ ok: false, error: 'Invalid coordinates' }, 400);
    }

    const cell = board[row][col];
    if (cell.state === CellState.REVEALED) {
      return res.json({ ok: false, error: 'Cell is already revealed' }, 400);
    }

    cell.state = CellState.REVEALED;

    const turnOrder = JSON.parse(game.turnOrder || '[]');
    let currentTurnIndex = game.currentTurnIndex || 0;
    let newMinesRevealed = game.minesRevealed;
    let nextTurn = game.currentTurn;
    let nextTurnIndex = currentTurnIndex;

    if (cell.isMine) {
      newMinesRevealed++;
      gamePlayers[currentPlayerIndex].score = Math.max(0, gamePlayers[currentPlayerIndex].score - 3);
      if (turnOrder.length > 0) {
        nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
        nextTurn = turnOrder[nextTurnIndex];
      } else {
        nextTurn = userId === game.hostId ? game.guestId : game.hostId;
      }
    } else {
      const points = cell.neighborMines === 0 ? 1 : cell.neighborMines;
      gamePlayers[currentPlayerIndex].score += points;
      if (cell.neighborMines === 0) {
        const revealed = revealEmptyCells(board, row, col);
        const addPoints = revealed.reduce((sum, [r, c]) => {
          const rc = board[r][c];
          return sum + (rc.neighborMines === 0 ? 1 : rc.neighborMines);
        }, 0);
        gamePlayers[currentPlayerIndex].score += addPoints;
      }
      nextTurn = userId;
    }

    const gameOver = checkGameOver(board);
    let status = game.status;
    let winnerId = null;

    if (gameOver) {
      status = GameStatus.FINISHED;
      const maxScore = Math.max(...gamePlayers.map(p => p.score));
      const winners = gamePlayers.filter(p => p.score === maxScore);
      winnerId = winners.length === 1 ? winners[0].id : 'draw';
    }

    const hostScore = gamePlayers.find(p => p.id === game.hostId)?.score || 0;
    const guestScore = gamePlayers.find(p => p.id === game.guestId)?.score || 0;

    // Build safe board for clients
    const safeBoard = buildSafeBoard(board, gameOver);

    // Update PRIVATE collection with real board
    await db.updateDocument(DB, GAME_BOARDS, gameId, {
      board: JSON.stringify(board),
    });

    // Update PUBLIC games collection with SAFE board only
    await db.updateDocument(DB, GAMES, gameId, {
      board: JSON.stringify(safeBoard),
      players: JSON.stringify(gamePlayers),
      currentTurnIndex: nextTurnIndex,
      hostScore, guestScore,
      currentTurn: nextTurn, status, winnerId,
      minesRevealed: newMinesRevealed,
      lastMoveBy: userId, lastMoveCell: `${row}-${col}`
    });

    if (gameOver) {
      try { await db.deleteDocument(DB, LOBBIES, game.lobbyId); } catch { /* ok */ }
      // Clean up private board
      try { await db.deleteDocument(DB, GAME_BOARDS, gameId); } catch { /* ok */ }
    }

    log(`[game/move] ✅ cell(${row},${col}) isMine=${cell.isMine} score=${gamePlayers[currentPlayerIndex].score} gameOver=${gameOver}`);
    return res.json({
      ok: true,
      board: safeBoard,
      players: gamePlayers, currentTurn: nextTurn,
      currentTurnIndex: nextTurnIndex,
      status, winnerId, minesRevealed: newMinesRevealed,
      lastMoveBy: userId, lastMoveCell: `${row}-${col}`,
      hostScore, guestScore
    });
  } catch (e) {
    logError(`game-move error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  GAME: RACE MOVE (simultaneous)
// ══════════════════════════════════════
async function handleGameRaceMove({ res, log, error: logError }, userId, body) {
  const { gameId, row, col } = body;
  log(`[game/race-move] user=${userId} gameId=${gameId} row=${row} col=${col}`);
  if (!gameId || row == null || col == null) {
    return res.json({ ok: false, error: 'Missing gameId, row, or col' }, 400);
  }

  const { db, DB, GAMES, LOBBIES, GAME_BOARDS } = initAppwrite();

  try {
    const game = await db.getDocument(DB, GAMES, gameId);

    if (game.status !== GameStatus.PLAYING) {
      return res.json({ ok: false, error: 'Game is not in playing state' }, 400);
    }
    if (game.gameMode !== 'race') {
      return res.json({ ok: false, error: 'Use /game/move for classic mode' }, 400);
    }

    const gamePlayers = JSON.parse(game.players);
    if (!gamePlayers.some(p => p.id === userId)) {
      return res.json({ ok: false, error: 'You are not a player in this game' }, 403);
    }

    // Read the REAL board from private collection
    const boardDoc = await db.getDocument(DB, GAME_BOARDS, gameId);
    const masterBoard = JSON.parse(boardDoc.board);
    const boardRows = masterBoard.length;
    const boardCols = masterBoard[0].length;

    if (row < 0 || row >= boardRows || col < 0 || col >= boardCols) {
      return res.json({ ok: false, error: 'Invalid coordinates' }, 400);
    }

    const isHost = userId === game.hostId;
    const revealedStr = isHost ? (game.hostBoard || '[]') : (game.guestBoard || '[]');
    const revealed = new Set(JSON.parse(revealedStr));
    const key = `${row}-${col}`;

    if (revealed.has(key)) {
      return res.json({ ok: false, error: 'Cell already revealed' }, 400);
    }
    if (isHost && game.hostFinished) {
      return res.json({ ok: false, error: 'You already finished' }, 400);
    }
    if (!isHost && game.guestFinished) {
      return res.json({ ok: false, error: 'You already finished' }, 400);
    }

    const cell = masterBoard[row][col];
    let currentScore = isHost ? game.hostScore : game.guestScore;

    if (cell.isMine) {
      revealed.add(key);
      currentScore = Math.max(0, currentScore - 3);
    } else {
      revealed.add(key);
      currentScore += cell.neighborMines === 0 ? 1 : cell.neighborMines;
      if (cell.neighborMines === 0) {
        const cascaded = raceRevealEmptyCells(masterBoard, revealed, row, col);
        for (const [cr, cc] of cascaded) {
          const cCell = masterBoard[cr][cc];
          currentScore += cCell.neighborMines === 0 ? 1 : cCell.neighborMines;
        }
      }
    }

    let totalSafe = 0, revealedSafe = 0;
    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        if (!masterBoard[r][c].isMine) {
          totalSafe++;
          if (revealed.has(`${r}-${c}`)) revealedSafe++;
        }
      }
    }
    const finished = revealedSafe >= totalSafe;

    const updateData = {};
    const revealedArray = JSON.stringify(Array.from(revealed));

    if (isHost) {
      updateData.hostBoard = revealedArray;
      updateData.hostScore = currentScore;
      if (finished) updateData.hostFinished = true;
    } else {
      updateData.guestBoard = revealedArray;
      updateData.guestScore = currentScore;
      if (finished) updateData.guestFinished = true;
    }

    updateData.lastMoveBy = userId;
    updateData.lastMoveCell = key;

    if (finished && game.status === GameStatus.PLAYING) {
      updateData.status = GameStatus.FINISHED;
      updateData.winnerId = userId;
    }

    // Build safe board for this player
    const safeBoard = buildSafeBoardForRace(masterBoard, revealed, finished || updateData.status === GameStatus.FINISHED);

    // Store safe board in public games collection
    updateData.board = JSON.stringify(safeBoard);

    await db.updateDocument(DB, GAMES, gameId, updateData);

    if (finished) {
      try { await db.deleteDocument(DB, LOBBIES, game.lobbyId); } catch { /* ok */ }
      // Clean up private board when game is over
      if (updateData.status === GameStatus.FINISHED) {
        try { await db.deleteDocument(DB, GAME_BOARDS, gameId); } catch { /* ok */ }
      }
    }

    log(`[game/race-move] ✅ cell(${row},${col}) score=${currentScore} finished=${finished}`);
    return res.json({
      ok: true, board: safeBoard, revealed: Array.from(revealed),
      score: currentScore, finished,
      status: updateData.status || game.status,
      winnerId: updateData.winnerId || game.winnerId,
      lastMoveBy: userId, lastMoveCell: key
    });
  } catch (e) {
    logError(`game-race-move error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  GAME: LEAVE (forfeit)
// ══════════════════════════════════════
async function handleGameLeave({ res, log, error: logError }, userId, body) {
  const { gameId } = body;
  log(`[game/leave] user=${userId} gameId=${gameId}`);
  if (!gameId) return res.json({ ok: false, error: 'Missing gameId' }, 400);

  const { db, DB, GAMES, LOBBIES, GAME_BOARDS } = initAppwrite();

  try {
    const game = await db.getDocument(DB, GAMES, gameId);

    if (game.status !== GameStatus.PLAYING) {
      return res.json({ ok: false, error: 'Game is not in playing state' }, 400);
    }

    const gamePlayers = JSON.parse(game.players);
    if (!gamePlayers.some(p => p.id === userId)) {
      return res.json({ ok: false, error: 'You are not a player in this game' }, 403);
    }

    const otherPlayers = gamePlayers.filter(p => p.id !== userId);
    let winnerId;
    if (otherPlayers.length === 1) {
      winnerId = otherPlayers[0].id;
    } else {
      const maxScore = Math.max(...otherPlayers.map(p => p.score));
      const topPlayers = otherPlayers.filter(p => p.score === maxScore);
      winnerId = topPlayers.length === 1 ? topPlayers[0].id : 'draw';
    }

    await db.updateDocument(DB, GAMES, gameId, { status: GameStatus.FINISHED, winnerId });
    try { await db.deleteDocument(DB, LOBBIES, game.lobbyId); } catch { /* ok */ }
    // Clean up private board
    try { await db.deleteDocument(DB, GAME_BOARDS, gameId); } catch { /* ok */ }

    log(`[game/leave] ✅ Player ${userId} forfeited game ${gameId}, winner=${winnerId}`);
    return res.json({ ok: true, winnerId });
  } catch (e) {
    logError(`game-leave error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  SPECTATOR: JOIN
// ══════════════════════════════════════
async function handleSpectatorJoin({ res, log, error: logError }, userId, body) {
  const { gameId } = body;
  log(`[spectator/join] user=${userId} gameId=${gameId}`);
  if (!gameId) return res.json({ ok: false, error: 'Missing gameId' }, 400);

  const { db, DB, GAMES } = initAppwrite();

  try {
    const game = await db.getDocument(DB, GAMES, gameId);
    const spectators = JSON.parse(game.spectators || '[]');

    if (spectators.includes(userId)) {
      return res.json({ ok: true, message: 'Already spectating' });
    }

    // Prevent players from being spectators in their own game
    const gamePlayers = JSON.parse(game.players);
    if (gamePlayers.some(p => p.id === userId)) {
      return res.json({ ok: false, error: 'You are a player in this game' }, 400);
    }

    spectators.push(userId);
    await db.updateDocument(DB, GAMES, gameId, {
      spectators: JSON.stringify(spectators)
    });

    log(`[spectator/join] ✅ ${userId} is now spectating game ${gameId}`);
    return res.json({ ok: true });
  } catch (e) {
    logError(`spectator-join error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  SPECTATOR: LEAVE
// ══════════════════════════════════════
async function handleSpectatorLeave({ res, log, error: logError }, userId, body) {
  const { gameId } = body;
  log(`[spectator/leave] user=${userId} gameId=${gameId}`);
  if (!gameId) return res.json({ ok: false, error: 'Missing gameId' }, 400);

  const { db, DB, GAMES } = initAppwrite();

  try {
    const game = await db.getDocument(DB, GAMES, gameId);
    const spectators = JSON.parse(game.spectators || '[]');
    const newSpectators = spectators.filter(id => id !== userId);

    if (newSpectators.length !== spectators.length) {
      await db.updateDocument(DB, GAMES, gameId, {
        spectators: JSON.stringify(newSpectators)
      });
    }

    log(`[spectator/leave] ✅ ${userId} stopped spectating game ${gameId}`);
    return res.json({ ok: true });
  } catch (e) {
    logError(`spectator-leave error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  CLEANUP (CRON)
// ══════════════════════════════════════
const STALE_LOBBY_MS = 2 * 60 * 60 * 1000;   // 2 hours
const STALE_GAME_MS = 4 * 60 * 60 * 1000;    // 4 hours

async function handleCleanup({ res, log, error: logError }) {
  const { db, DB, LOBBIES, GAMES, GAME_BOARDS } = initAppwrite();
  const now = Date.now();
  let deletedLobbies = 0, finishedGames = 0;

  try {
    // Stale lobbies
    const staleLobbies = await db.listDocuments(DB, LOBBIES, [
      Query.equal('status', [LobbyStatus.WAITING, LobbyStatus.FULL]),
      Query.limit(100)
    ]);
    for (const lobby of staleLobbies.documents) {
      if (now - new Date(lobby.createdAt).getTime() > STALE_LOBBY_MS) {
        try { await db.deleteDocument(DB, LOBBIES, lobby.$id); deletedLobbies++; } catch { /* skip */ }
      }
    }

    // Stale games
    const activeGames = await db.listDocuments(DB, GAMES, [
      Query.equal('status', [GameStatus.PLAYING]),
      Query.limit(100)
    ]);
    for (const game of activeGames.documents) {
      if (now - new Date(game.startTime || game.$createdAt).getTime() > STALE_GAME_MS) {
        try {
          await db.updateDocument(DB, GAMES, game.$id, { status: GameStatus.FINISHED, winnerId: 'timeout' });
          finishedGames++;
          try { await db.deleteDocument(DB, LOBBIES, game.lobbyId); } catch { /* ok */ }
          // Clean up private board
          try { await db.deleteDocument(DB, GAME_BOARDS, game.$id); } catch { /* ok */ }
        } catch { /* skip */ }
      }
    }

    // Orphan in-game lobbies
    const inGameLobbies = await db.listDocuments(DB, LOBBIES, [
      Query.equal('status', [LobbyStatus.IN_GAME]),
      Query.limit(100)
    ]);
    for (const lobby of inGameLobbies.documents) {
      if (!lobby.gameId) {
        try { await db.deleteDocument(DB, LOBBIES, lobby.$id); deletedLobbies++; } catch { /* skip */ }
        continue;
      }
      try {
        const game = await db.getDocument(DB, GAMES, lobby.gameId);
        if (game.status === GameStatus.FINISHED) {
          try { await db.deleteDocument(DB, LOBBIES, lobby.$id); deletedLobbies++; } catch { /* skip */ }
        }
      } catch {
        try { await db.deleteDocument(DB, LOBBIES, lobby.$id); deletedLobbies++; } catch { /* skip */ }
      }
    }

    // Clean up orphan private boards (game doesn't exist or is finished)
    try {
      const allBoards = await db.listDocuments(DB, GAME_BOARDS, [Query.limit(100)]);
      for (const boardDoc of allBoards.documents) {
        try {
          const game = await db.getDocument(DB, GAMES, boardDoc.$id);
          if (game.status === GameStatus.FINISHED) {
            await db.deleteDocument(DB, GAME_BOARDS, boardDoc.$id);
          }
        } catch {
          // Game doesn't exist — orphan board, delete it
          try { await db.deleteDocument(DB, GAME_BOARDS, boardDoc.$id); } catch { /* skip */ }
        }
      }
    } catch { /* skip if collection doesn't exist yet */ }

    log(`Cleanup: ${deletedLobbies} lobbies deleted, ${finishedGames} games force-finished`);
    return res.json({ ok: true, deletedLobbies, finishedGames });
  } catch (e) {
    logError(`cleanup error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  HELPER: Board generation
// ══════════════════════════════════════
function createBoard(config) {
  const board = [];
  for (let row = 0; row < config.rows; row++) {
    board[row] = [];
    for (let col = 0; col < config.cols; col++) {
      board[row][col] = {
        id: `${row}-${col}`, row, col,
        isMine: false, neighborMines: 0, state: CellState.HIDDEN
      };
    }
  }
  return board;
}

function placeMines(board, config, firstRow, firstCol) {
  const nb = board.map(r => r.map(c => ({ ...c })));
  let placed = 0;
  while (placed < config.mines) {
    const rr = Math.floor(Math.random() * config.rows);
    const rc = Math.floor(Math.random() * config.cols);
    if ((rr === firstRow && rc === firstCol) || nb[rr][rc].isMine) continue;
    nb[rr][rc].isMine = true;
    placed++;
  }
  return nb;
}

function calculateNeighborMines(board) {
  const rows = board.length, cols = board[0].length;
  const nb = board.map(r => r.map(c => ({ ...c })));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!nb[row][col].isMine) {
        let cnt = 0;
        for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
          for (let c = Math.max(0, col - 1); c <= Math.min(cols - 1, col + 1); c++) {
            if ((r !== row || c !== col) && nb[r][c].isMine) cnt++;
          }
        }
        nb[row][col].neighborMines = cnt;
      }
    }
  }
  return nb;
}

// ══════════════════════════════════════
//  HELPER: Reveal empty cells
// ══════════════════════════════════════
function revealEmptyCells(board, startRow, startCol) {
  const rows = board.length, cols = board[0].length;
  const revealed = [];
  const toCheck = [[startRow, startCol]];
  const visited = new Set();

  while (toCheck.length > 0) {
    const [row, col] = toCheck.pop();
    const key = `${row}-${col}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const cell = board[row][col];
    if (cell.state === CellState.REVEALED && (row !== startRow || col !== startCol)) continue;

    if (cell.neighborMines === 0 && !cell.isMine) {
      for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
        for (let c = Math.max(0, col - 1); c <= Math.min(cols - 1, col + 1); c++) {
          if (r !== row || c !== col) {
            const neighbor = board[r][c];
            if (neighbor.state !== CellState.REVEALED && !neighbor.isMine) {
              neighbor.state = CellState.REVEALED;
              revealed.push([r, c]);
              if (neighbor.neighborMines === 0) toCheck.push([r, c]);
            }
          }
        }
      }
    }
  }
  return revealed;
}

function raceRevealEmptyCells(masterBoard, revealed, startRow, startCol) {
  const rows = masterBoard.length, cols = masterBoard[0].length;
  const newRevealed = [];
  const queue = [[startRow, startCol]];
  const visited = new Set([`${startRow}-${startCol}`]);

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    if (masterBoard[r][c].neighborMines === 0 && !masterBoard[r][c].isMine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc, nkey = `${nr}-${nc}`;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited.has(nkey)) {
            visited.add(nkey);
            const neighbor = masterBoard[nr][nc];
            if (!neighbor.isMine && !revealed.has(nkey)) {
              revealed.add(nkey);
              newRevealed.push([nr, nc]);
              if (neighbor.neighborMines === 0) queue.push([nr, nc]);
            }
          }
        }
      }
    }
  }
  return newRevealed;
}

function checkGameOver(board) {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.isMine && cell.state !== CellState.REVEALED) return false;
    }
  }
  return true;
}

// ══════════════════════════════════════
//  HELPER: Safe board (hide mines)
// ══════════════════════════════════════
function buildSafeBoard(board, gameOver) {
  return board.map(row => row.map(cell => {
    if (gameOver || cell.state === CellState.REVEALED) return cell;
    return { id: cell.id, row: cell.row, col: cell.col, isMine: false, neighborMines: 0, state: cell.state };
  }));
}

function buildSafeBoardForRace(masterBoard, revealed, gameOver) {
  return masterBoard.map((row, r) => row.map((cell, c) => {
    if (gameOver || revealed.has(`${r}-${c}`)) return cell;
    return { id: cell.id, row: cell.row, col: cell.col, isMine: false, neighborMines: 0, state: 'hidden' };
  }));
}

// ══════════════════════════════════════
//  ARENA: JOIN — find/create room, create player document
// ══════════════════════════════════════
const ARENA_COLORS = [
  '#f04f54', '#bf7ff0', '#f0a04f', '#4ff07f', '#f0d94f',
  '#ff6b9d', '#4fc4f0', '#f07f4f', '#00b2e1', '#9d4ff0',
  '#f04f8b', '#c8f04f',
];
const ARENA_SIZE_CONST = 4000;

async function handleArenaJoin({ res, log, error: logError }, userId, body) {
  const { name } = body;
  log(`[arena/join] user=${userId} name="${name}"`);

  const { db, users, DB } = initAppwrite();
  const ARENA_ROOMS = process.env.ARENA_ROOMS_COLLECTION_ID || 'arena_rooms';
  const ARENA_PLAYERS = process.env.ARENA_PLAYERS_COLLECTION_ID || 'arena_players';

  try {
    // Check if player is already in a room (reconnect)
    const existing = await db.listDocuments(DB, ARENA_PLAYERS, [
      Query.equal('playerId', userId),
      Query.limit(1)
    ]);

    if (existing.documents.length > 0) {
      const doc = existing.documents[0];
      log(`[arena/join] ✅ Reconnected to room ${doc.roomId}`);
      return res.json({
        ok: true,
        roomId: doc.roomId,
        playerDocId: doc.$id,
        x: doc.x,
        y: doc.y,
        color: doc.color,
        reconnected: true
      });
    }

    // Get verified player name
    let playerName = name || 'Гравець';
    try {
      const user = await users.get(userId);
      if (user.name) playerName = user.name;
    } catch { /* fallback */ }

    // Find a room with space or create new
    let roomId;
    const rooms = await db.listDocuments(DB, ARENA_ROOMS, [
      Query.lessThan('playerCount', 20),
      Query.orderDesc('$createdAt'),
      Query.limit(1)
    ]);

    if (rooms.documents.length > 0) {
      roomId = rooms.documents[0].$id;
      await db.updateDocument(DB, ARENA_ROOMS, roomId, {
        playerCount: rooms.documents[0].playerCount + 1
      });
    } else {
      const room = await db.createDocument(DB, ARENA_ROOMS, ID.unique(), {
        playerCount: 1,
        maxPlayers: 20,
      }, [Permission.read(Role.users())]);
      roomId = room.$id;
    }

    // Random spawn position
    const x = 200 + Math.random() * (ARENA_SIZE_CONST - 400);
    const y = 200 + Math.random() * (ARENA_SIZE_CONST - 400);
    const color = ARENA_COLORS[Math.floor(Math.random() * ARENA_COLORS.length)];

    const defaultStats = JSON.stringify({
      healthRegen: 0, maxHealth: 0, bodyDamage: 0,
      bulletSpeed: 0, bulletPenetration: 0, bulletDamage: 0,
      reload: 0, moveSpeed: 0
    });

    // Create player document — only this user can update it
    const playerDoc = await db.createDocument(DB, ARENA_PLAYERS, ID.unique(), {
      playerId: userId,
      roomId: roomId,
      name: playerName,
      x, y,
      angle: 0,
      hp: 50,
      maxHp: 50,
      score: 0,
      level: 1,
      stats: defaultStats,
      alive: true,
      color,
      isShooting: false,
      lastUpdate: new Date().toISOString()
    }, [
      Permission.read(Role.users()),
      Permission.update(Role.user(userId)),
    ]);

    log(`[arena/join] ✅ ${playerName} joined room ${roomId} (doc=${playerDoc.$id})`);
    return res.json({
      ok: true,
      roomId,
      playerDocId: playerDoc.$id,
      x, y, color
    });
  } catch (e) {
    logError(`arena-join error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  ARENA: LEAVE — delete player document, update room
// ══════════════════════════════════════
async function handleArenaLeave({ res, log, error: logError }, userId, body) {
  const { docId, roomId } = body;
  log(`[arena/leave] user=${userId} docId=${docId} roomId=${roomId}`);

  const { db, DB } = initAppwrite();
  const ARENA_ROOMS = process.env.ARENA_ROOMS_COLLECTION_ID || 'arena_rooms';
  const ARENA_PLAYERS = process.env.ARENA_PLAYERS_COLLECTION_ID || 'arena_players';

  try {
    // Delete player document
    if (docId) {
      try {
        const doc = await db.getDocument(DB, ARENA_PLAYERS, docId);
        if (doc.playerId === userId) {
          await db.deleteDocument(DB, ARENA_PLAYERS, docId);
        }
      } catch { /* already deleted */ }
    } else {
      // Fallback: delete all documents by this player
      const docs = await db.listDocuments(DB, ARENA_PLAYERS, [
        Query.equal('playerId', userId),
        Query.limit(5)
      ]);
      for (const doc of docs.documents) {
        try { await db.deleteDocument(DB, ARENA_PLAYERS, doc.$id); } catch { /* ok */ }
      }
    }

    // Update room player count
    if (roomId) {
      try {
        const room = await db.getDocument(DB, ARENA_ROOMS, roomId);
        const newCount = Math.max(0, (room.playerCount || 1) - 1);
        if (newCount <= 0) {
          await db.deleteDocument(DB, ARENA_ROOMS, roomId);
        } else {
          await db.updateDocument(DB, ARENA_ROOMS, roomId, { playerCount: newCount });
        }
      } catch { /* room already deleted */ }
    }

    log(`[arena/leave] ✅ Player ${userId} left arena`);
    return res.json({ ok: true });
  } catch (e) {
    logError(`arena-leave error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}

// ══════════════════════════════════════
//  ARENA: DEATH — report who killed you, reward them
// ══════════════════════════════════════
async function handleArenaDeath({ res, log, error: logError }, userId, body) {
  const { killerDocId, victimScore } = body;
  log(`[arena/death] victim=${userId} killerDoc=${killerDocId} score=${victimScore}`);

  const { db, DB } = initAppwrite();
  const ARENA_PLAYERS = process.env.ARENA_PLAYERS_COLLECTION_ID || 'arena_players';

  try {
    if (!killerDocId) {
      return res.json({ ok: true, message: 'No killer to reward' });
    }

    // Reward the killer
    const killerDoc = await db.getDocument(DB, ARENA_PLAYERS, killerDocId);
    const reward = Math.floor((victimScore || 0) * 0.3 + 50);

    await db.updateDocument(DB, ARENA_PLAYERS, killerDocId, {
      score: (killerDoc.score || 0) + reward
    });

    log(`[arena/death] ✅ Killer ${killerDoc.name} got +${reward} score`);
    return res.json({ ok: true, reward });
  } catch (e) {
    logError(`arena-death error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
}
