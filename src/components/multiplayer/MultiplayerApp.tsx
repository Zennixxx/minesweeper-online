import React, { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { PlayerNameModal } from './PlayerNameModal';
import { LobbyList } from './LobbyList';
import { CreateLobby } from './CreateLobby';
import { LobbyRoom } from './LobbyRoom';
import { MultiplayerGame } from './MultiplayerGame';
import { RaceGame } from './RaceGame';
import { Lobby, MultiplayerGameState, MultiplayerGameStatus, GameMode } from '../../multiplayerTypes';
import { getGame, getLobby } from '../../multiplayerService';
import { saveGameSession, clearGameSession, getPlayerName } from '../../lib/appwrite';

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

export const MultiplayerApp: React.FC = () => {
  const [playerName, setPlayerName] = useState<string>('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [showEditName, setShowEditName] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Check if player has a name set
  useEffect(() => {
    const savedName = getPlayerName();
    if (savedName && savedName !== 'Гравець') {
      setPlayerName(savedName);
      setIsCheckingName(false);
    } else {
      // Don't block game/spectate routes with name modal
      const isGameRoute = location.pathname.includes('/game/') || location.pathname.includes('/spectate/');
      if (isGameRoute) {
        setPlayerName(savedName || 'Гравець');
        setIsCheckingName(false);
      } else {
        setShowNameModal(true);
        setIsCheckingName(false);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameSet = useCallback((name: string) => {
    setPlayerName(name);
    setShowNameModal(false);
  }, []);

  const handleNameChange = useCallback((name: string) => {
    setPlayerName(name);
    setShowEditName(false);
  }, []);

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

  if (isCheckingName) {
    return (
      <div className="multiplayer-app">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Завантаження...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="multiplayer-app">
      {showNameModal && (
        <PlayerNameModal onNameSet={handleNameSet} />
      )}

      {showEditName && (
        <PlayerNameModal
          onNameSet={handleNameChange}
          isEdit={true}
          onClose={() => setShowEditName(false)}
        />
      )}

      <Routes>
        <Route path="/" element={
          !showNameModal ? (
            <>
              <div className="app-header">
                <h1 className="game-title">💣 Сапер Онлайн</h1>
                <div className="welcome-section">
                  <p className="welcome-message">Привіт, {playerName}! 👋</p>
                  <button
                    className="btn-edit-name"
                    onClick={() => setShowEditName(true)}
                    title="Змінити нік"
                  >
                    ✏️
                  </button>
                </div>
              </div>
              <LobbyList
                onJoinLobby={handleJoinLobby}
                onCreateLobby={handleCreateLobby}
                onSpectate={handleSpectate}
              />
            </>
          ) : null
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
