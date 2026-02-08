import React, { useState, useEffect, useCallback } from 'react';
import { Lobby, LobbyStatus, MultiplayerGameState, deserializeLobbyPlayers, GameMode, GAME_MODE_LABELS } from '../../multiplayerTypes';
import { getLobby, leaveLobby, startGame, getGame } from '../../multiplayerService';
import { getOrCreatePlayerId, client, DATABASE_ID, LOBBIES_COLLECTION_ID } from '../../lib/appwrite';
import { DIFFICULTY_PRESETS, DifficultyLevel } from '../../types';
import { EasyDot, MediumDot, HardDot, GamepadIcon, CrownIcon, QuestionIcon, TrashIcon, DoorIcon, HourglassIcon, RocketIcon } from '../../icons';

const DIFFICULTY_ICONS: Record<DifficultyLevel, React.ReactNode> = {
  EASY: <EasyDot />,
  MEDIUM: <MediumDot />,
  HARD: <HardDot />
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  EASY: 'Легко',
  MEDIUM: 'Середньо',
  HARD: 'Складно'
};

interface LobbyRoomProps {
  lobby: Lobby;
  onGameStart: (game: MultiplayerGameState) => void;
  onLeave: () => void;
}

export const LobbyRoom: React.FC<LobbyRoomProps> = ({ lobby: initialLobby, onGameStart, onLeave }) => {
  const [lobby, setLobby] = useState<Lobby>(initialLobby);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerId = getOrCreatePlayerId();
  const isHost = lobby.hostId === playerId;

  const fetchLobby = useCallback(async () => {
    try {
      const updatedLobby = await getLobby(lobby.$id!);
      setLobby(updatedLobby);
      
      // If game started, transition to game
      if (updatedLobby.gameId && updatedLobby.status === LobbyStatus.IN_GAME) {
        const game = await getGame(updatedLobby.gameId);
        onGameStart(game);
      }
    } catch (err: any) {
      // Lobby might have been deleted
      if (err.code === 404) {
        onLeave();
      }
    }
  }, [lobby.$id, onGameStart, onLeave]);

  // Initial fetch and subscribe to updates
  useEffect(() => {
    // Fetch immediately to get latest state
    fetchLobby();

    // Subscribe to lobby updates
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${LOBBIES_COLLECTION_ID}.documents.${lobby.$id}`,
      (response) => {
        // Handle different event types
        if (response.events.some(e => e.includes('.delete'))) {
          // Lobby was deleted
          onLeave();
        } else {
          // Lobby was updated
          fetchLobby();
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [lobby.$id, fetchLobby, onLeave]);

  const handleStartGame = async () => {
    try {
      setLoading(true);
      setError(null);
      const game = await startGame(lobby.$id!);
      onGameStart(game);
    } catch (err: any) {
      setError(err.message || 'Помилка запуску гри');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveLobby = async () => {
    try {
      setLoading(true);
      await leaveLobby(lobby.$id!);
      onLeave();
    } catch (err: any) {
      setError(err.message || 'Помилка виходу з лобі');
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    const key = difficulty as DifficultyLevel;
    if (key in DIFFICULTY_PRESETS) {
      const preset = DIFFICULTY_PRESETS[key];
      return <>{DIFFICULTY_ICONS[key]} {DIFFICULTY_LABELS[key]} ({preset.rows}x{preset.cols}, {preset.mines} мін)</>;
    }
    return difficulty;
  };

  const players = deserializeLobbyPlayers(lobby.players);
  const maxPlayers = lobby.maxPlayers || 2;
  const emptySlots = maxPlayers - players.length;

  return (
    <div className="lobby-room-container">
      <div className="lobby-room-card">
        <div className="lobby-room-header">
          <h2><GamepadIcon size={20} /> {lobby.name}</h2>
          <div className="lobby-room-badges">
            <span className="difficulty-badge">{getDifficultyLabel(lobby.difficulty)}</span>
            <span className="mode-badge">{GAME_MODE_LABELS[(lobby.gameMode || 'classic') as GameMode] || 'Класичний'}</span>
          </div>
        </div>

        <div className="players-section">
          <h3>Гравці ({players.length}/{maxPlayers})</h3>
          <div className="players-grid multi-player">
            {players.map((player, index) => (
              <div key={player.id} className={`player-card ${player.id === playerId ? 'you' : ''}`}>
                <div className="player-icon">{index === 0 ? <CrownIcon size={20} /> : <GamepadIcon size={20} />}</div>
                <div className="player-name">
                  {player.name}
                  {player.id === playerId && <span className="you-badge">(Ви)</span>}
                </div>
                <div className="player-role">{index === 0 ? 'Хост' : `Гравець ${index + 1}`}</div>
              </div>
            ))}
            {Array.from({ length: emptySlots }, (_, i) => (
              <div key={`empty-${i}`} className="player-card empty">
                <div className="player-icon"><QuestionIcon size={20} /></div>
                <div className="player-name">Очікування гравця...</div>
                <div className="player-role">Слот {players.length + i + 1}</div>
              </div>
            ))}
          </div>
        </div>

        {emptySlots > 0 && (
          <div className="waiting-message">
            <div className="spinner"></div>
            <p>Очікуємо {emptySlots === 1 ? 'ще одного гравця' : `ще ${emptySlots} гравців`}...</p>
            <p className="hint">
              {lobby.password 
                ? 'Поділіться назвою лобі та паролем з друзями!'
                : 'Поділіться назвою лобі з друзями!'}
            </p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <div className="lobby-room-actions">
          <button 
            className="btn btn-danger"
            onClick={handleLeaveLobby}
            disabled={loading}
          >
            {isHost ? <><TrashIcon size={14} /> Видалити лобі</> : <><DoorIcon size={14} /> Вийти</>}
          </button>

          {isHost && emptySlots === 0 && (
            <button 
              className="btn btn-success btn-start"
              onClick={handleStartGame}
              disabled={loading}
            >
              {loading ? <><HourglassIcon size={14} /> Запуск...</> : <><RocketIcon size={14} /> Почати гру!</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
