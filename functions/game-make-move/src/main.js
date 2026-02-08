import { Client, Databases, Users } from 'node-appwrite';

/*
 * Appwrite Function: game-make-move
 * 
 * Server-side validated move for classic (turn-based) mode.
 * 
 * Expected JSON body:
 * { gameId: string, row: number, col: number }
 * 
 * Environment variables:
 * - APPWRITE_FUNCTION_API_ENDPOINT
 * - APPWRITE_FUNCTION_PROJECT_ID
 * - APPWRITE_API_KEY
 * - DATABASE_ID
 * - GAMES_COLLECTION_ID
 * - LOBBIES_COLLECTION_ID
 */

const CellState = { HIDDEN: 'hidden', REVEALED: 'revealed', FLAGGED: 'flagged' };
const GameStatus = { WAITING: 'waiting', PLAYING: 'playing', FINISHED: 'finished' };

export default async ({ req, res, log, error }) => {
  // ── Auth check ──
  const userId = req.headers['x-appwrite-user-id'];
  if (!userId) {
    return res.json({ ok: false, error: 'Unauthorized' }, 401);
  }

  // ── Parse body ──
  let body;
  try {
    body = JSON.parse(req.body);
  } catch {
    return res.json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { gameId, row, col } = body;
  if (!gameId || row == null || col == null) {
    return res.json({ ok: false, error: 'Missing gameId, row, or col' }, 400);
  }

  // ── Init SDK with API key (server-side, bypasses permissions) ──
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const db = new Databases(client);
  const DB = process.env.DATABASE_ID || 'minesweeper_db';
  const GAMES = process.env.GAMES_COLLECTION_ID || 'games';
  const LOBBIES = process.env.LOBBIES_COLLECTION_ID || 'lobbies';

  try {
    // ── Fetch game ──
    const game = await db.getDocument(DB, GAMES, gameId);

    // ── Validate game state ──
    if (game.status !== GameStatus.PLAYING) {
      return res.json({ ok: false, error: 'Game is not in playing state' }, 400);
    }

    if (game.gameMode === 'race') {
      return res.json({ ok: false, error: 'Use game-make-race-move for race mode' }, 400);
    }

    // ── Validate it's this player's turn ──
    if (game.currentTurn !== userId) {
      return res.json({ ok: false, error: 'Not your turn' }, 403);
    }

    // ── Validate player is in the game ──
    const gamePlayers = JSON.parse(game.players);
    const currentPlayerIndex = gamePlayers.findIndex(p => p.id === userId);
    if (currentPlayerIndex < 0) {
      return res.json({ ok: false, error: 'You are not a player in this game' }, 403);
    }

    // ── Parse board and validate coordinates ──
    const board = JSON.parse(game.board);
    const rows = board.length;
    const cols = board[0].length;

    if (row < 0 || row >= rows || col < 0 || col >= cols) {
      return res.json({ ok: false, error: 'Invalid coordinates' }, 400);
    }

    const cell = board[row][col];

    if (cell.state === CellState.REVEALED) {
      return res.json({ ok: false, error: 'Cell is already revealed' }, 400);
    }

    // ── Process move ──
    cell.state = CellState.REVEALED;

    const turnOrder = JSON.parse(game.turnOrder || '[]');
    let currentTurnIndex = game.currentTurnIndex || 0;
    let newMinesRevealed = game.minesRevealed;
    let nextTurn = game.currentTurn;
    let nextTurnIndex = currentTurnIndex;

    if (cell.isMine) {
      // Hit a mine — lose 3 points, move to next player
      newMinesRevealed++;
      gamePlayers[currentPlayerIndex].score = Math.max(0, gamePlayers[currentPlayerIndex].score - 3);

      if (turnOrder.length > 0) {
        nextTurnIndex = (currentTurnIndex + 1) % turnOrder.length;
        nextTurn = turnOrder[nextTurnIndex];
      } else {
        nextTurn = userId === game.hostId ? game.guestId : game.hostId;
      }
    } else {
      // Safe cell — add points
      const points = cell.neighborMines === 0 ? 1 : cell.neighborMines;
      gamePlayers[currentPlayerIndex].score += points;

      // Cascade empty cells
      if (cell.neighborMines === 0) {
        const revealed = revealEmptyCells(board, row, col);
        const additionalPoints = revealed.reduce((sum, [r, c]) => {
          const rc = board[r][c];
          return sum + (rc.neighborMines === 0 ? 1 : rc.neighborMines);
        }, 0);
        gamePlayers[currentPlayerIndex].score += additionalPoints;
      }

      // Player keeps turn after safe move
      nextTurn = userId;
    }

    // ── Check game over ──
    const gameOver = checkGameOver(board);
    let status = game.status;
    let winnerId = null;

    if (gameOver) {
      status = GameStatus.FINISHED;
      const maxScore = Math.max(...gamePlayers.map(p => p.score));
      const winners = gamePlayers.filter(p => p.score === maxScore);
      winnerId = winners.length === 1 ? winners[0].id : 'draw';
    }

    // ── Build safe board for response (hide mines from unrevealed cells) ──
    const safeBoard = buildSafeBoard(board, gameOver);

    // ── Backwards-compat scores ──
    const hostScore = gamePlayers.find(p => p.id === game.hostId)?.score || 0;
    const guestScore = gamePlayers.find(p => p.id === game.guestId)?.score || 0;

    // ── Update document (with server API key — full access) ──
    await db.updateDocument(DB, GAMES, gameId, {
      board: JSON.stringify(board),               // Full board stored on server
      players: JSON.stringify(gamePlayers),
      currentTurnIndex: nextTurnIndex,
      hostScore,
      guestScore,
      currentTurn: nextTurn,
      status,
      winnerId,
      minesRevealed: newMinesRevealed,
      lastMoveBy: userId,
      lastMoveCell: `${row}-${col}`
    });

    // ── If game finished, clean up lobby ──
    if (gameOver) {
      try {
        await db.deleteDocument(DB, LOBBIES, game.lobbyId);
      } catch { /* already deleted */ }
    }

    return res.json({
      ok: true,
      board: safeBoard,
      players: gamePlayers,
      currentTurn: nextTurn,
      currentTurnIndex: nextTurnIndex,
      status,
      winnerId,
      minesRevealed: newMinesRevealed,
      lastMoveBy: userId,
      lastMoveCell: `${row}-${col}`,
      hostScore,
      guestScore
    });

  } catch (e) {
    error(`game-make-move error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
};

// ── Helpers ──

function revealEmptyCells(board, startRow, startCol) {
  const rows = board.length;
  const cols = board[0].length;
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
}

function checkGameOver(board) {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.isMine && cell.state !== CellState.REVEALED) return false;
    }
  }
  return true;
}

/**
 * Build a "safe" board that hides mine positions in unrevealed cells.
 * Only send isMine=true for revealed cells (or when game is over).
 */
function buildSafeBoard(board, gameOver) {
  return board.map(row =>
    row.map(cell => {
      if (gameOver || cell.state === CellState.REVEALED) {
        return cell; // full info
      }
      // Hide sensitive info from unrevealed cells
      return {
        id: cell.id,
        row: cell.row,
        col: cell.col,
        isMine: false,          // always false for hidden cells
        neighborMines: 0,       // hide number too
        state: cell.state
      };
    })
  );
}
