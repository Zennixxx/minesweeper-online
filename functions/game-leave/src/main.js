import { Client, Databases } from 'node-appwrite';

/*
 * Appwrite Function: game-leave
 * 
 * Server-side forfeit. The leaving player loses, opponent wins.
 * 
 * Expected JSON body:
 * { gameId: string }
 */

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

  const { gameId } = body;
  if (!gameId) {
    return res.json({ ok: false, error: 'Missing gameId' }, 400);
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

    // ── Validate game is playing ──
    if (game.status !== GameStatus.PLAYING) {
      return res.json({ ok: false, error: 'Game is not in playing state' }, 400);
    }

    // ── Validate player is in the game ──
    const gamePlayers = JSON.parse(game.players);
    const isPlayer = gamePlayers.some(p => p.id === userId);
    if (!isPlayer) {
      return res.json({ ok: false, error: 'You are not a player in this game' }, 403);
    }

    // ── Determine winner (all others, or specific single opponent) ──
    const otherPlayers = gamePlayers.filter(p => p.id !== userId);
    let winnerId;
    if (otherPlayers.length === 1) {
      winnerId = otherPlayers[0].id;
    } else {
      // Multiple opponents — highest score among remaining wins
      const maxScore = Math.max(...otherPlayers.map(p => p.score));
      const topPlayers = otherPlayers.filter(p => p.score === maxScore);
      winnerId = topPlayers.length === 1 ? topPlayers[0].id : 'draw';
    }

    // ── Update game ──
    await db.updateDocument(DB, GAMES, gameId, {
      status: GameStatus.FINISHED,
      winnerId,
    });

    // ── Clean up lobby ──
    try {
      await db.deleteDocument(DB, LOBBIES, game.lobbyId);
    } catch { /* already deleted */ }

    return res.json({ ok: true, winnerId });

  } catch (e) {
    error(`game-leave error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
};
