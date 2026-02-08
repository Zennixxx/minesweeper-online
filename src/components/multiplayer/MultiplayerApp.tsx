import React, { useState, useCallback, useEffect } from 'react';
import { PlayerNameModal } from './PlayerNameModal';
import { LobbyList } from './LobbyList';
import { CreateLobby } from './CreateLobby';
import { LobbyRoom } from './LobbyRoom';
import { MultiplayerGame } from './MultiplayerGame';
import { RaceGame } from './RaceGame';
import { Lobby, MultiplayerGameState, MultiplayerGameStatus, GameMode } from '../../multiplayerTypes';
import { getGame } from '../../multiplayerService';
import { saveGameSession, getGameSession, clearGameSession, getPlayerName } from '../../lib/appwrite';

type GameScreen = 'name' | 'lobby-list' | 'create-lobby' | 'lobby-room' | 'game' | 'spectate';

interface MultiplayerAppProps {
  onGameStateChange?: (inGame: boolean) => void;
}

export const MultiplayerApp: React.FC<MultiplayerAppProps> = ({ onGameStateChange }) => {
  const [screen, setScreen] = useState<GameScreen>('name');
  const [playerName, setPlayerName] = useState<string>('');
  const [currentLobby, setCurrentLobby] = useState<Lobby | null>(null);
  const [currentGame, setCurrentGame] = useState<MultiplayerGameState | null>(null);
  const [showEditName, setShowEditName] = useState(false);
  const [isRecovering, setIsRecovering] = useState(true);

  // Notify parent about game state changes
  useEffect(() => {
    const inGame = screen === 'game' || screen === 'spectate';
    onGameStateChange?.(inGame);
  }, [screen, onGameStateChange]);

  // Check for saved game session on mount
  useEffect(() => {
    const recoverSession = async () => {
      const session = getGameSession();
      if (session) {
        try {
          const game = await getGame(session.gameId);
          if (game.status !== MultiplayerGameStatus.FINISHED) {
            setCurrentGame(game);
            setScreen(session.isSpectator ? 'spectate' : 'game');
            const savedName = getPlayerName();
            setPlayerName(savedName);
          } else {
            clearGameSession();
          }
        } catch {
          clearGameSession();
        }
      }
      setIsRecovering(false);
    };

    recoverSession();
  }, []);

  const handleNameSet = useCallback((name: string) => {
    setPlayerName(name);
    setScreen('lobby-list');
  }, []);

  const handleNameChange = useCallback((name: string) => {
    setPlayerName(name);
    setShowEditName(false);
  }, []);

  const handleCreateLobby = useCallback(() => {
    setScreen('create-lobby');
  }, []);

  const handleLobbyCreated = useCallback((lobby: Lobby) => {
    setCurrentLobby(lobby);
    setScreen('lobby-room');
  }, []);

  const handleJoinLobby = useCallback((lobby: Lobby) => {
    setCurrentLobby(lobby);
    setScreen('lobby-room');
  }, []);

  const handleLeaveLobby = useCallback(() => {
    setCurrentLobby(null);
    setScreen('lobby-list');
  }, []);

  const handleGameStart = useCallback((game: MultiplayerGameState) => {
    setCurrentGame(game);
    setScreen('game');
    saveGameSession(game.$id!, game.lobbyId, false);
  }, []);

  const handleSpectate = useCallback((game: MultiplayerGameState) => {
    setCurrentGame(game);
    setScreen('spectate');
    saveGameSession(game.$id!, game.lobbyId, true);
  }, []);

  const handleGameEnd = useCallback(() => {
    setCurrentGame(null);
    setCurrentLobby(null);
    setScreen('lobby-list');
    clearGameSession();
  }, []);

  const handleBackToList = useCallback(() => {
    setScreen('lobby-list');
  }, []);

  if (isRecovering) {
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
      {screen === 'name' && (
        <PlayerNameModal onNameSet={handleNameSet} />
      )}

      {showEditName && (
        <PlayerNameModal 
          onNameSet={handleNameChange} 
          isEdit={true}
          onClose={() => setShowEditName(false)}
        />
      )}

      {screen === 'lobby-list' && (
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
      )}

      {screen === 'create-lobby' && (
        <CreateLobby 
          onLobbyCreated={handleLobbyCreated}
          onCancel={handleBackToList}
        />
      )}

      {screen === 'lobby-room' && currentLobby && (
        <LobbyRoom 
          lobby={currentLobby}
          onGameStart={handleGameStart}
          onLeave={handleLeaveLobby}
        />
      )}

      {screen === 'game' && currentGame && (
        currentGame.gameMode === GameMode.RACE ? (
          <RaceGame 
            game={currentGame}
            onGameEnd={handleGameEnd}
          />
        ) : (
          <MultiplayerGame 
            game={currentGame}
            onGameEnd={handleGameEnd}
          />
        )
      )}

      {screen === 'spectate' && currentGame && (
        currentGame.gameMode === GameMode.RACE ? (
          <RaceGame 
            game={currentGame}
            onGameEnd={handleGameEnd}
            isSpectator={true}
          />
        ) : (
          <MultiplayerGame 
            game={currentGame}
            onGameEnd={handleGameEnd}
            isSpectator={true}
          />
        )
      )}
    </div>
  );
};
