import React, { useState, useCallback } from 'react';
import { PlayerNameModal } from './PlayerNameModal';
import { LobbyList } from './LobbyList';
import { CreateLobby } from './CreateLobby';
import { LobbyRoom } from './LobbyRoom';
import { MultiplayerGame } from './MultiplayerGame';
import { Lobby, MultiplayerGameState } from '../../multiplayerTypes';

type GameScreen = 'name' | 'lobby-list' | 'create-lobby' | 'lobby-room' | 'game' | 'spectate';

export const MultiplayerApp: React.FC = () => {
  const [screen, setScreen] = useState<GameScreen>('name');
  const [playerName, setPlayerName] = useState<string>('');
  const [currentLobby, setCurrentLobby] = useState<Lobby | null>(null);
  const [currentGame, setCurrentGame] = useState<MultiplayerGameState | null>(null);
  const [showEditName, setShowEditName] = useState(false);

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
  }, []);

  const handleSpectate = useCallback((game: MultiplayerGameState) => {
    setCurrentGame(game);
    setScreen('spectate');
  }, []);

  const handleGameEnd = useCallback(() => {
    setCurrentGame(null);
    setCurrentLobby(null);
    setScreen('lobby-list');
  }, []);

  const handleBackToList = useCallback(() => {
    setScreen('lobby-list');
  }, []);

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
        <MultiplayerGame 
          game={currentGame}
          onGameEnd={handleGameEnd}
        />
      )}

      {screen === 'spectate' && currentGame && (
        <MultiplayerGame 
          game={currentGame}
          onGameEnd={handleGameEnd}
          isSpectator={true}
        />
      )}
    </div>
  );
};
