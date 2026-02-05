import React, { useState, useEffect, useCallback } from 'react';
import { Lobby, LobbyStatus, MultiplayerGameState } from '../../multiplayerTypes';
import { getLobby, leaveLobby, startGame, getGame } from '../../multiplayerService';
import { getOrCreatePlayerId, client, DATABASE_ID, LOBBIES_COLLECTION_ID } from '../../lib/appwrite';

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
    switch (difficulty) {
      case 'EASY': return '🟢 Легко (9x9, 10 мін)';
      case 'MEDIUM': return '🟡 Середньо (16x16, 40 мін)';
      case 'HARD': return '🔴 Складно (16x30, 99 мін)';
      default: return difficulty;
    }
  };

  return (
    <div className="lobby-room-container">
      <div className="lobby-room-card">
        <div className="lobby-room-header">
          <h2>🎮 {lobby.name}</h2>
          <span className="difficulty-badge">{getDifficultyLabel(lobby.difficulty)}</span>
        </div>

        <div className="players-section">
          <h3>Гравці</h3>
          <div className="players-grid">
            <div className={`player-card ${isHost ? 'you' : ''}`}>
              <div className="player-icon">👑</div>
              <div className="player-name">
                {lobby.hostName}
                {isHost && <span className="you-badge">(Ви)</span>}
              </div>
              <div className="player-role">Хост</div>
            </div>

            <div className={`player-card ${!isHost && lobby.guestId === playerId ? 'you' : ''} ${!lobby.guestId ? 'empty' : ''}`}>
              <div className="player-icon">{lobby.guestId ? '🎮' : '❓'}</div>
              <div className="player-name">
                {lobby.guestName || 'Очікування гравця...'}
                {!isHost && lobby.guestId === playerId && <span className="you-badge">(Ви)</span>}
              </div>
              <div className="player-role">Гість</div>
            </div>
          </div>
        </div>

        {!lobby.guestId && (
          <div className="waiting-message">
            <div className="spinner"></div>
            <p>Очікуємо другого гравця...</p>
            <p className="hint">Поділіться назвою лобі та паролем з другом!</p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <div className="lobby-room-actions">
          <button 
            className="btn btn-danger"
            onClick={handleLeaveLobby}
            disabled={loading}
          >
            {isHost ? '🗑️ Видалити лобі' : '🚪 Вийти'}
          </button>

          {isHost && lobby.guestId && (
            <button 
              className="btn btn-success btn-start"
              onClick={handleStartGame}
              disabled={loading}
            >
              {loading ? '⏳ Запуск...' : '🚀 Почати гру!'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
