import React, { useState, useEffect, useCallback } from 'react';
import { Lobby, LobbyStatus, MultiplayerGameState, MultiplayerGameStatus, deserializeLobbyPlayers, GameMode, GAME_MODE_LABELS } from '../../multiplayerTypes';
import { getLobbies, joinLobby, deleteLobby, getGame, joinAsSpectator } from '../../multiplayerService';
import { getOrCreatePlayerId } from '../../lib/appwrite';
import { client, DATABASE_ID, LOBBIES_COLLECTION_ID } from '../../lib/appwrite';
import { HourglassIcon, CheckCircleIcon, GamepadIcon, EasyDot, MediumDot, HardDot, RefreshIcon, PlusIcon, DesertIcon, LockIcon, UnlockIcon, TrashIcon, InboxIcon, DoorIcon, EyeIcon } from '../../icons';

interface LobbyListProps {
  onJoinLobby: (lobby: Lobby) => void;
  onCreateLobby: () => void;
  onSpectate?: (game: MultiplayerGameState) => void;
  onRefresh?: () => void;
}

export const LobbyList: React.FC<LobbyListProps> = ({ onJoinLobby, onCreateLobby, onSpectate }) => {
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningLobbyId, setJoiningLobbyId] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const playerId = getOrCreatePlayerId();

  const fetchLobbies = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getLobbies();
      setLobbies(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження лобі');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLobbies();

    // Subscribe to realtime updates
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${LOBBIES_COLLECTION_ID}.documents`,
      () => {
        fetchLobbies();
      }
    );

    return () => {
      unsubscribe();
    };
  }, [fetchLobbies]);

  const handleJoinClick = async (lobby: Lobby) => {
    // If no password, join directly
    if (!lobby.password) {
      try {
        setPasswordError(null);
        const updatedLobby = await joinLobby(lobby.$id!, '');
        onJoinLobby(updatedLobby);
      } catch (err: any) {
        setError(err.message || 'Помилка приєднання');
      }
    } else {
      // Show password prompt
      setJoiningLobbyId(lobby.$id!);
      setPasswordInput('');
      setPasswordError(null);
    }
  };

  const handleSpectateClick = async (lobby: Lobby) => {
    if (lobby.gameId && onSpectate) {
      try {
        const game = await getGame(lobby.gameId);
        // Check if game is still in progress
        if (game.status === MultiplayerGameStatus.FINISHED) {
          setError('Гра вже завершена');
          fetchLobbies(); // Refresh to update status
          return;
        }
        // Join as spectator to track spectator count
        const updatedGame = await joinAsSpectator(lobby.gameId);
        onSpectate(updatedGame);
      } catch (err: any) {
        setError(err.message || 'Помилка підключення до гри');
      }
    }
  };

  const handleJoinSubmit = async (lobby: Lobby) => {
    try {
      setPasswordError(null);
      const updatedLobby = await joinLobby(lobby.$id!, passwordInput);
      setJoiningLobbyId(null);
      onJoinLobby(updatedLobby);
    } catch (err: any) {
      setPasswordError(err.message || 'Помилка приєднання');
    }
  };

  const handleDeleteLobby = async (lobbyId: string) => {
    try {
      await deleteLobby(lobbyId);
      fetchLobbies();
    } catch (err: any) {
      setError(err.message || 'Помилка видалення лобі');
    }
  };

  const getStatusBadge = (status: LobbyStatus) => {
    switch (status) {
      case LobbyStatus.WAITING:
        return <span className="badge badge-waiting"><HourglassIcon size={12} /> Очікує</span>;
      case LobbyStatus.FULL:
        return <span className="badge badge-full"><CheckCircleIcon size={12} /> Готове</span>;
      case LobbyStatus.IN_GAME:
        return <span className="badge badge-playing"><GamepadIcon size={12} /> Грає</span>;
      default:
        return null;
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'EASY': return <><EasyDot /> Легко</>;
      case 'MEDIUM': return <><MediumDot /> Середньо</>;
      case 'HARD': return <><HardDot /> Складно</>;
      default: return difficulty;
    }
  };

  return (
    <div className="lobby-list-container">
      <div className="lobby-header">
        <h2><GamepadIcon size={20} /> Ігрові лобі</h2>
        <div className="lobby-actions">
          <button className="btn btn-refresh" onClick={fetchLobbies}>
            <RefreshIcon size={14} /> Оновити
          </button>
          <button className="btn btn-create" onClick={onCreateLobby}>
            <PlusIcon size={14} /> Створити лобі
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Завантаження...</div>
      ) : lobbies.length === 0 ? (
        <div className="empty-list">
          <p><DesertIcon size={20} /> Немає активних лобі</p>
          <p>Створіть нове лобі, щоб почати гру!</p>
        </div>
      ) : (
        <div className="lobby-grid">
          {lobbies.map((lobby) => (
            <div key={lobby.$id} className="lobby-card">
              <div className="lobby-card-header">
                <h3>{lobby.name}</h3>
                {getStatusBadge(lobby.status)}
              </div>
              
              <div className="lobby-card-info">
                <div className="info-row">
                  <span className="label">Хост:</span>
                  <span className="value">{lobby.hostName}</span>
                </div>
                <div className="info-row">
                  <span className="label">Гравці:</span>
                  <span className="value">
                    {deserializeLobbyPlayers(lobby.players).length}/{lobby.maxPlayers || 2}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Складність:</span>
                  <span className="value">{getDifficultyLabel(lobby.difficulty)}</span>
                </div>
                <div className="info-row">
                  <span className="label">Режим:</span>
                  <span className="value">{GAME_MODE_LABELS[(lobby.gameMode || 'classic') as GameMode] || 'Класичний'}</span>
                </div>
                <div className="info-row">
                  <span className="label">{lobby.password ? <LockIcon size={14} /> : <UnlockIcon size={14} />}</span>
                  <span className="value">{lobby.password ? 'Захищено паролем' : 'Відкрите лобі'}</span>
                </div>
              </div>

              {lobby.hostId === playerId ? (
                <div className="lobby-card-actions">
                  <button 
                    className="btn btn-danger"
                    onClick={() => handleDeleteLobby(lobby.$id!)}
                  >
                    <TrashIcon size={14} /> Видалити
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={() => onJoinLobby(lobby)}
                  >
                    <InboxIcon size={14} /> Увійти
                  </button>
                </div>
              ) : joiningLobbyId === lobby.$id ? (
                <div className="password-form">
                  <input
                    type="password"
                    placeholder="Введіть пароль"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    autoFocus
                  />
                  {passwordError && (
                    <div className="password-error">{passwordError}</div>
                  )}
                  <div className="password-actions">
                    <button 
                      className="btn btn-secondary"
                      onClick={() => setJoiningLobbyId(null)}
                    >
                      Скасувати
                    </button>
                    <button 
                      className="btn btn-primary"
                      onClick={() => handleJoinSubmit(lobby)}
                      disabled={!passwordInput}
                    >
                      Приєднатися
                    </button>
                  </div>
                </div>
              ) : (
                <div className="lobby-card-actions">
                  {lobby.status === LobbyStatus.WAITING && (
                    <button 
                      className="btn btn-primary"
                      onClick={() => handleJoinClick(lobby)}
                    >
                      <DoorIcon size={14} /> Приєднатися
                    </button>
                  )}
                  {lobby.status === LobbyStatus.IN_GAME && onSpectate && (
                    <button 
                      className="btn btn-spectate"
                      onClick={() => handleSpectateClick(lobby)}
                    >
                      <EyeIcon size={14} /> Спостерігати
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
