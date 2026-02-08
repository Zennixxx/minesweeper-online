import { Client, Databases, Query } from 'node-appwrite';



const LobbyStatus = { WAITING: 'waiting', FULL: 'full', IN_GAME: 'in_game', FINISHED: 'finished' };
const GameStatus = { WAITING: 'waiting', PLAYING: 'playing', FINISHED: 'finished' };

const STALE_LOBBY_MS = 2 * 60 * 60 * 1000;  // 2 hours
const STALE_GAME_MS = 4 * 60 * 60 * 1000;   // 4 hours

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const db = new Databases(client);
  const DB = process.env.DATABASE_ID || 'minesweeper_db';
  const LOBBIES = process.env.LOBBIES_COLLECTION_ID || 'lobbies';
  const GAMES = process.env.GAMES_COLLECTION_ID || 'games';

  const now = Date.now();
  let deletedLobbies = 0;
  let finishedGames = 0;

  try {
    // ── Clean up stale lobbies ──
    const staleLobbies = await db.listDocuments(DB, LOBBIES, [
      Query.equal('status', [LobbyStatus.WAITING, LobbyStatus.FULL]),
      Query.limit(100)
    ]);

    for (const lobby of staleLobbies.documents) {
      const createdAt = new Date(lobby.createdAt).getTime();
      if (now - createdAt > STALE_LOBBY_MS) {
        try {
          await db.deleteDocument(DB, LOBBIES, lobby.$id);
          deletedLobbies++;
        } catch { /* skip */ }
      }
    }

    // ── Clean up stale games ──
    const activeGames = await db.listDocuments(DB, GAMES, [
      Query.equal('status', [GameStatus.PLAYING]),
      Query.limit(100)
    ]);

    for (const game of activeGames.documents) {
      const startTime = new Date(game.startTime || game.$createdAt).getTime();
      if (now - startTime > STALE_GAME_MS) {
        try {
          await db.updateDocument(DB, GAMES, game.$id, {
            status: GameStatus.FINISHED,
            winnerId: 'timeout'
          });
          finishedGames++;

          // Also clean up the corresponding lobby
          try {
            await db.deleteDocument(DB, LOBBIES, game.lobbyId);
          } catch { /* already deleted */ }
        } catch { /* skip */ }
      }
    }

    // ── Clean up lobbies for finished games ──
    const inGameLobbies = await db.listDocuments(DB, LOBBIES, [
      Query.equal('status', [LobbyStatus.IN_GAME]),
      Query.limit(100)
    ]);

    for (const lobby of inGameLobbies.documents) {
      if (!lobby.gameId) {
        try {
          await db.deleteDocument(DB, LOBBIES, lobby.$id);
          deletedLobbies++;
        } catch { /* skip */ }
        continue;
      }

      try {
        const game = await db.getDocument(DB, GAMES, lobby.gameId);
        if (game.status === GameStatus.FINISHED) {
          try {
            await db.deleteDocument(DB, LOBBIES, lobby.$id);
            deletedLobbies++;
          } catch { /* skip */ }
        }
      } catch {
        // Game not found — delete orphan lobby
        try {
          await db.deleteDocument(DB, LOBBIES, lobby.$id);
          deletedLobbies++;
        } catch { /* skip */ }
      }
    }

    log(`Cleanup complete: ${deletedLobbies} lobbies deleted, ${finishedGames} games force-finished`);
    return res.json({ ok: true, deletedLobbies, finishedGames });

  } catch (e) {
    error(`cleanup-stale error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
};
