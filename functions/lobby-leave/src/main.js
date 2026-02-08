import { Client, Databases, Query } from 'node-appwrite';

/*
 * Appwrite Function: lobby-leave
 * 
 * Server-side validated lobby leave. Host leaving deletes the lobby.
 * 
 * Expected JSON body:
 * { lobbyId: string }
 */

const LobbyStatus = { WAITING: 'waiting', FULL: 'full', IN_GAME: 'in_game', FINISHED: 'finished' };

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

  try {
    const lobby = await db.getDocument(DB, LOBBIES, lobbyId);

    // ── Validate player is in the lobby ──
    const players = JSON.parse(lobby.players || '[]');
    const isHost = lobby.hostId === userId;
    const isPlayer = players.some(p => p.id === userId);

    if (!isHost && !isPlayer) {
      return res.json({ ok: false, error: 'You are not in this lobby' }, 403);
    }

    if (isHost) {
      // ── Host leaves: delete lobby ──
      await db.deleteDocument(DB, LOBBIES, lobbyId);
      return res.json({ ok: true, action: 'deleted' });
    } else {
      // ── Non-host leaves: remove from players ──
      const filteredPlayers = players.filter(p => p.id !== userId);

      const updateData = {
        players: JSON.stringify(filteredPlayers),
        status: LobbyStatus.WAITING
      };

      // Backwards compatibility
      if (lobby.guestId === userId) {
        updateData.guestId = null;
        updateData.guestName = null;
      }

      await db.updateDocument(DB, LOBBIES, lobbyId, updateData);
      return res.json({ ok: true, action: 'left' });
    }

  } catch (e) {
    error(`lobby-leave error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
};
