import { Client, Databases, ID, Query, Permission, Role } from 'node-appwrite';
import * as crypto from 'crypto';

/*
 * Appwrite Function: lobby-create
 * 
 * Server-side lobby creation with input validation and password hashing.
 * 
 * Expected JSON body:
 * { name: string, password?: string, difficulty: string, maxPlayers: number, gameMode: string }
 */

const LobbyStatus = { WAITING: 'waiting', FULL: 'full', IN_GAME: 'in_game', FINISHED: 'finished' };
const VALID_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const VALID_GAME_MODES = ['classic', 'race'];

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

  const { name, password, difficulty, maxPlayers, gameMode } = body;

  // ── Input validation ──
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

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const db = new Databases(client);
  const DB = process.env.DATABASE_ID || 'minesweeper_db';
  const LOBBIES = process.env.LOBBIES_COLLECTION_ID || 'lobbies';

  try {
    // ── Check if player is already in an active lobby ──
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
      } catch { /* skip malformed */ }
    }

    // ── Get user name from Appwrite (NOT from client) ──
    // Use Users API to get the server-verified user name
    const { Users } = await import('node-appwrite');
    const users = new Users(client);
    let playerName = 'Гравець';
    try {
      const user = await users.get(userId);
      playerName = user.name || 'Гравець';
    } catch {
      // fallback
    }

    // ── Hash password if provided (SHA-256 with salt) ──
    let passwordHash = '';
    let passwordSalt = '';
    if (password && password.trim().length > 0) {
      passwordSalt = crypto.randomBytes(16).toString('hex');
      passwordHash = crypto.createHash('sha256').update(password + passwordSalt).digest('hex');
    }

    const players = [{ id: userId, name: playerName }];

    const lobbyData = {
      name: name.trim().substring(0, 50),
      password: passwordHash,           // Store HASH, not plain text
      passwordSalt,                     // Store salt for verification
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

    // ── Restrictive permissions ──
    const lobbyDoc = await db.createDocument(DB, LOBBIES, ID.unique(), lobbyData, [
      Permission.read(Role.users()),          // All users can see lobbies
      // NO update/delete for users — only server functions modify lobbies
      Permission.delete(Role.user(userId)),   // Host can emergency-delete
    ]);

    // Return lobby info (WITHOUT password hash)
    return res.json({
      ok: true,
      lobby: {
        $id: lobbyDoc.$id,
        name: lobbyDoc.name,
        hostId: lobbyDoc.hostId,
        hostName: lobbyDoc.hostName,
        maxPlayers: lobbyDoc.maxPlayers,
        players: lobbyDoc.players,
        status: lobbyDoc.status,
        difficulty: lobbyDoc.difficulty,
        gameMode: lobbyDoc.gameMode,
        createdAt: lobbyDoc.createdAt,
        gameId: lobbyDoc.gameId,
        hasPassword: !!passwordHash
      }
    });

  } catch (e) {
    error(`lobby-create error: ${e.message}`);
    return res.json({ ok: false, error: e.message }, 500);
  }
};
