import { Client, Databases, Users } from 'node-appwrite';
import * as crypto from 'crypto';

/*
 * Appwrite Function: lobby-join
 * 
 * Server-side validated lobby join with password check and player limit enforcement.
 * 
 * Expected JSON body:
 * { lobbyId: string, password?: string }
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

  const { lobbyId, password } = body;
  if (!lobbyId) {
    return res.json({ ok: false, error: 'Missing lobbyId' }, 400);
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const db = new Databases(client);
  const users = new Users(client);
  const DB = process.env.DATABASE_ID || 'minesweeper_db';
  const LOBBIES = process.env.LOBBIES_COLLECTION_ID || 'lobbies';

  try {
    const lobby = await db.getDocument(DB, LOBBIES, lobbyId);

    // ── Verify password ──
    if (lobby.password && lobby.password.length > 0) {
      const salt = lobby.passwordSalt || '';
      const inputHash = crypto.createHash('sha256').update((password || '') + salt).digest('hex');
      if (inputHash !== lobby.password) {
        return res.json({ ok: false, error: 'Incorrect password' }, 403);
      }
    }

    // ── Parse current players ──
    const players = JSON.parse(lobby.players || '[]');
    const maxPlayers = lobby.maxPlayers || 2;

    // ── Already in this lobby? ──
    if (players.some(p => p.id === userId)) {
      return res.json({ ok: false, error: 'You are already in this lobby' }, 400);
    }

    // ── Lobby full? ──
    if (players.length >= maxPlayers) {
      return res.json({ ok: false, error: 'Lobby is full' }, 400);
    }

    // ── Lobby status check ──
    if (lobby.status !== LobbyStatus.WAITING) {
      return res.json({ ok: false, error: 'Lobby is not accepting players' }, 400);
    }

    // ── Check if player is in another lobby ──
    const { Query } = await import('node-appwrite');
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

    // ── Get server-verified player name ──
    let playerName = 'Гравець';
    try {
      const user = await users.get(userId);
      playerName = user.name || 'Гравець';
    } catch { /* fallback */ }

    // ── Add player ──
    players.push({ id: userId, name: playerName });
    const newStatus = players.length >= maxPlayers ? LobbyStatus.FULL : LobbyStatus.WAITING;

    const updateData = {
      players: JSON.stringify(players),
      status: newStatus
    };

    // Backwards compatibility
    if (maxPlayers === 2 && players.length === 2) {
      updateData.guestId = userId;
      updateData.guestName = playerName;
    }

    await db.updateDocument(DB, LOBBIES, lobbyId, updateData);

    return res.json({
      ok: true,
      lobby: {
        $id: lobby.$id,
        name: lobby.name,
        hostId: lobby.hostId,
        hostName: lobby.hostName,
        maxPlayers,
        players: JSON.stringify(players),
        status: newStatus,
        difficulty: lobby.difficulty,
        gameMode: lobby.gameMode,
        createdAt: lobby.createdAt,
        gameId: lobby.gameId,
        hasPassword: !!lobby.password
      }
    });

  } catch (e) {
    error(`lobby-join error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
};
