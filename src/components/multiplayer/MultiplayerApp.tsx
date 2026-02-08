import React, { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { PlayerNameModal } from './PlayerNameModal';
import { LobbyList } from './LobbyList';
import { CreateLobby } from './CreateLobby';
import { LobbyRoom } from './LobbyRoom';
import { MultiplayerGame } from './MultiplayerGame';
import { RaceGame } from './RaceGame';
import { Lobby, MultiplayerGameState, MultiplayerGameStatus, GameMode } from '../../multiplayerTypes';
import { getGame, getLobby } from '../../multiplayerService';
import { saveGameSession, clearGameSession } from '../../lib/appwrite';
import { useAuth } from '../../lib/AuthContext';

// Route wrapper: loads game by ID from URL and renders the correct game component
const GameRoute: React.FC<{ isSpectator?: boolean }> = ({ isSpectator = false }) => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<MultiplayerGameState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadGame = async () => {
      if (!gameId) {
        navigate('/multiplayer', { replace: true });
        return;
      }
      try {
        const g = await getGame(gameId);
        if (g.status === MultiplayerGameStatus.FINISHED) {
          clearGameSession();
          navigate('/multiplayer', { replace: true });
        } else {
          setGame(g);
          saveGameSession(gameId, g.lobbyId, isSpectator);
        }
      } catch {
        clearGameSession();
        navigate('/multiplayer', { replace: true });
      }
      setLoading(false);
    };
    loadGame();
  }, [gameId, isSpectator, navigate]);

  const handleGameEnd = useCallback(() => {
    clearGameSession();
    navigate('/multiplayer', { replace: true });
  }, [navigate]);

  if (loading) {
    return (
      <div className="multiplayer-app">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Завантаження гри...</p>
        </div>
      </div>
    );
  }

  if (!game) return null;

  if (game.gameMode === GameMode.RACE) {
    return <RaceGame game={game} onGameEnd={handleGameEnd} isSpectator={isSpectator} />;
  }
  return <MultiplayerGame game={game} onGameEnd={handleGameEnd} isSpectator={isSpectator} />;
};

// Route wrapper: loads lobby by ID from URL
const LobbyRoute: React.FC = () => {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLobby = async () => {
      if (!lobbyId) {
        navigate('/multiplayer', { replace: true });
        return;
      }
      try {
        const l = await getLobby(lobbyId);
        setLobby(l);
      } catch {
        navigate('/multiplayer', { replace: true });
      }
      setLoading(false);
    };
    loadLobby();
  }, [lobbyId, navigate]);

  const handleGameStart = useCallback((game: MultiplayerGameState) => {
    saveGameSession(game.$id!, game.lobbyId, false);
    navigate(`/multiplayer/game/${game.$id}`, { replace: true });
  }, [navigate]);

  const handleLeave = useCallback(() => {
    navigate('/multiplayer', { replace: true });
  }, [navigate]);

  if (loading) {
    return (
      <div className="multiplayer-app">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Завантаження лобі...</p>
        </div>
      </div>
    );
  }

  if (!lobby) return null;

  return <LobbyRoom lobby={lobby} onGameStart={handleGameStart} onLeave={handleLeave} />;
};

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export const MultiplayerApp: React.FC = () => {
  const { playerName, isLoading: isAuthLoading, isAuthenticated, user, logout, loginWithGoogle, updatePlayerName } = useAuth();
  const [showEditName, setShowEditName] = useState(false);
  const navigate = useNavigate();

  const handleNameChange = useCallback((name: string) => {
    updatePlayerName(name);
    setShowEditName(false);
  }, [updatePlayerName]);

  const handleCreateLobby = useCallback(() => {
    navigate('/multiplayer/create');
  }, [navigate]);

  const handleLobbyCreated = useCallback((lobby: Lobby) => {
    navigate(`/multiplayer/lobby/${lobby.$id}`, { replace: true });
  }, [navigate]);

  const handleJoinLobby = useCallback((lobby: Lobby) => {
    navigate(`/multiplayer/lobby/${lobby.$id}`);
  }, [navigate]);

  const handleSpectate = useCallback((game: MultiplayerGameState) => {
    saveGameSession(game.$id!, game.lobbyId, true);
    navigate(`/multiplayer/spectate/${game.$id}`);
  }, [navigate]);

  const handleBackToList = useCallback(() => {
    navigate('/multiplayer');
  }, [navigate]);

  if (isAuthLoading) {
    return (
      <div className="multiplayer-app">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Завантаження...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="multiplayer-app">
        <div className="login-screen">
          <h1 className="game-title">💣 Сапер Онлайн</h1>
          <p className="login-subtitle">Увійдіть, щоб грати з друзями</p>
          <button
            type="button"
            className="btn-google"
            onClick={loginWithGoogle}
          >
            <GoogleIcon />
            Увійти через Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="multiplayer-app">
      {showEditName && (
        <PlayerNameModal
          onNameSet={handleNameChange}
          onClose={() => setShowEditName(false)}
        />
      )}

      <Routes>
        <Route path="/" element={
            <>
              <div className="app-header">
                <h1 className="game-title">💣 Сапер Онлайн</h1>
                <div className="welcome-section">
                  <p className="welcome-message">
                    Привіт, {playerName}! 👋
                    <span className="auth-badge" title={`Google: ${user?.email}`}>🔒</span>
                  </p>
                  <div className="welcome-actions">
                    <button
                      className="btn-edit-name"
                      onClick={() => setShowEditName(true)}
                      title="Змінити нік"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-edit-name btn-logout-small"
                      onClick={logout}
                      title="Вийти з акаунту"
                    >
                      🚪
                    </button>
                  </div>
                </div>
              </div>
              <LobbyList
                onJoinLobby={handleJoinLobby}
                onCreateLobby={handleCreateLobby}
                onSpectate={handleSpectate}
              />
            </>
        } />

        <Route path="/create" element={
          <CreateLobby
            onLobbyCreated={handleLobbyCreated}
            onCancel={handleBackToList}
          />
        } />

        <Route path="/lobby/:lobbyId" element={<LobbyRoute />} />
        <Route path="/game/:gameId" element={<GameRoute />} />
        <Route path="/spectate/:gameId" element={<GameRoute isSpectator />} />
      </Routes>
    </div>
  );
};
