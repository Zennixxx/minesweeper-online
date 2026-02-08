import { Client, Databases } from 'node-appwrite';

/*
 * Appwrite Function: game-make-race-move
 * 
 * Server-side validated move for race (simultaneous) mode.
 * 
 * Expected JSON body:
 * { gameId: string, row: number, col: number }
 */

const CellState = { HIDDEN: 'hidden', REVEALED: 'revealed', FLAGGED: 'flagged' };
const GameStatus = { WAITING: 'waiting', PLAYING: 'playing', FINISHED: 'finished' };

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

  const { gameId, row, col } = body;
  if (!gameId || row == null || col == null) {
    return res.json({ ok: false, error: 'Missing gameId, row, or col' }, 400);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const db = new Databases(client);
  const DB = process.env.DATABASE_ID || 'minesweeper_db';
  const GAMES = process.env.GAMES_COLLECTION_ID || 'games';
  const LOBBIES = process.env.LOBBIES_COLLECTION_ID || 'lobbies';

  try {
    const game = await db.getDocument(DB, GAMES, gameId);

    // ── Validate game state ──
    if (game.status !== GameStatus.PLAYING) {
      return res.json({ ok: false, error: 'Game is not in playing state' }, 400);
    }

    if (game.gameMode !== 'race') {
      return res.json({ ok: false, error: 'Use game-make-move for classic mode' }, 400);
    }

    // ── Validate player is in the game ──
    const gamePlayers = JSON.parse(game.players);
    const isPlayer = gamePlayers.some(p => p.id === userId);
    if (!isPlayer) {
      return res.json({ ok: false, error: 'You are not a player in this game' }, 403);
    }

    // ── Parse board and validate coordinates ──
    const masterBoard = JSON.parse(game.board);
    const boardRows = masterBoard.length;
    const boardCols = masterBoard[0].length;

    if (row < 0 || row >= boardRows || col < 0 || col >= boardCols) {
      return res.json({ ok: false, error: 'Invalid coordinates' }, 400);
    }

    // ── Determine which player board to use ──
    const isHost = userId === game.hostId;
    const revealedStr = isHost ? (game.hostBoard || '[]') : (game.guestBoard || '[]');
    const revealed = new Set(JSON.parse(revealedStr));
    const key = `${row}-${col}`;

    if (revealed.has(key)) {
      return res.json({ ok: false, error: 'Cell already revealed' }, 400);
    }

    // ── Check if this player already finished ──
    if (isHost && game.hostFinished) {
      return res.json({ ok: false, error: 'You already finished' }, 400);
    }
    if (!isHost && game.guestFinished) {
      return res.json({ ok: false, error: 'You already finished' }, 400);
    }

    // ── Process move ──
    const cell = masterBoard[row][col];
    let currentScore = isHost ? game.hostScore : game.guestScore;

    if (cell.isMine) {
      revealed.add(key);
      currentScore = Math.max(0, currentScore - 3);
    } else {
      revealed.add(key);
      currentScore += cell.neighborMines === 0 ? 1 : cell.neighborMines;

      // Cascade for empty cells
      if (cell.neighborMines === 0) {
        const cascaded = raceRevealEmptyCells(masterBoard, revealed, row, col);
        for (const [cr, cc] of cascaded) {
          const cCell = masterBoard[cr][cc];
          currentScore += cCell.neighborMines === 0 ? 1 : cCell.neighborMines;
        }
      }
    }

    // ── Check if player finished all safe cells ──
    let totalSafe = 0;
    let revealedSafe = 0;
    for (let r = 0; r < boardRows; r++) {
      for (let c = 0; c < boardCols; c++) {
        if (!masterBoard[r][c].isMine) {
          totalSafe++;
          if (revealed.has(`${r}-${c}`)) {
            revealedSafe++;
          }
        }
      }
    }
    const finished = revealedSafe >= totalSafe;

    // ── Build update ──
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

    await db.updateDocument(DB, GAMES, gameId, updateData);

    if (finished) {
      try {
        await db.deleteDocument(DB, LOBBIES, game.lobbyId);
      } catch { /* already deleted */ }
    }

    // ── Build safe board for this player (only their revealed cells visible) ──
    const safeBoard = buildSafeBoardForRace(masterBoard, revealed, finished || updateData.status === GameStatus.FINISHED);

    return res.json({
      ok: true,
      board: safeBoard,
      revealed: Array.from(revealed),
      score: currentScore,
      finished,
      status: updateData.status || game.status,
      winnerId: updateData.winnerId || game.winnerId,
      lastMoveBy: userId,
      lastMoveCell: key
    });

  } catch (e) {
    error(`game-make-race-move error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
};

// ── Helpers ──

function raceRevealEmptyCells(masterBoard, revealed, startRow, startCol) {
  const rows = masterBoard.length;
  const cols = masterBoard[0].length;
  const newRevealed = [];
  const queue = [[startRow, startCol]];
  const visited = new Set([`${startRow}-${startCol}`]);

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const cell = masterBoard[r][c];

    if (cell.neighborMines === 0 && !cell.isMine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          const nkey = `${nr}-${nc}`;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited.has(nkey)) {
            visited.add(nkey);
            const neighbor = masterBoard[nr][nc];
            if (!neighbor.isMine && !revealed.has(nkey)) {
              revealed.add(nkey);
              newRevealed.push([nr, nc]);
              if (neighbor.neighborMines === 0) {
                queue.push([nr, nc]);
              }
            }
          }
        }
      }
    }
  }
  return newRevealed;
}

function buildSafeBoardForRace(masterBoard, revealed, gameOver) {
  return masterBoard.map((row, r) =>
    row.map((cell, c) => {
      const key = `${r}-${c}`;
      if (gameOver || revealed.has(key)) {
        return cell;
      }
      return {
        id: cell.id,
        row: cell.row,
        col: cell.col,
        isMine: false,
        neighborMines: 0,
        state: 'hidden'
      };
    })
  );
}
