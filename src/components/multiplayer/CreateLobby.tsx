import React, { useState } from 'react';
import { DifficultyLevel, DIFFICULTY_PRESETS } from '../../types';
import { createLobby } from '../../multiplayerServiceSecure';
import { Lobby, GameMode, GAME_MODE_LABELS, GAME_MODE_DESCRIPTIONS } from '../../multiplayerTypes';
import { PlusIcon, LockIcon } from '../../icons';

const DIFFICULTY_TEXT: Record<DifficultyLevel, string> = {
  EASY: '●',
  MEDIUM: '●',
  HARD: '●'
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  EASY: 'Легко',
  MEDIUM: 'Середньо',
  HARD: 'Складно'
};

interface CreateLobbyProps {
  onLobbyCreated: (lobby: Lobby) => void;
  onCancel: () => void;
}

export const CreateLobby: React.FC<CreateLobbyProps> = ({ onLobbyCreated, onCancel }) => {
  const [name, setName] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('EASY');
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.CLASSIC);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // When game mode changes to RACE, lock to 2 players
  const handleGameModeChange = (mode: GameMode) => {
    setGameMode(mode);
    if (mode === GameMode.RACE) {
      setMaxPlayers(2);
    }
  };

  // When maxPlayers > 2, enforce minimum MEDIUM difficulty
  const handleMaxPlayersChange = (newMax: number) => {
    setMaxPlayers(newMax);
    if (newMax > 2 && difficulty === 'EASY') {
      setDifficulty('MEDIUM');
    }
  };

  const handleDifficultyChange = (newDifficulty: DifficultyLevel) => {
    // Don't allow EASY if more than 2 players
    if (maxPlayers > 2 && newDifficulty === 'EASY') {
      return;
    }
    setDifficulty(newDifficulty);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Введіть назву лобі');
      return;
    }

    if (usePassword) {
      if (!password) {
        setError('Введіть пароль');
        return;
      }

      if (password !== confirmPassword) {
        setError('Паролі не співпадають');
        return;
      }

      if (password.length < 4) {
        setError('Пароль має бути не менше 4 символів');
        return;
      }
    }

    try {
      setLoading(true);
      const lobby = await createLobby(name.trim(), usePassword ? password : '', difficulty, maxPlayers, gameMode);
      onLobbyCreated(lobby);
    } catch (err: any) {
      setError(err.message || 'Помилка створення лобі');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-lobby-container">
      <div className="create-lobby-card">
        <h2><PlusIcon size={18} /> Створити нове лобі</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Режим гри</label>
            <div className="game-mode-selector">
              {(Object.values(GameMode) as GameMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`game-mode-btn ${gameMode === mode ? 'active' : ''}`}
                  onClick={() => handleGameModeChange(mode)}
                >
                  <div className="game-mode-label">{GAME_MODE_LABELS[mode]}</div>
                  <div className="game-mode-desc">{GAME_MODE_DESCRIPTIONS[mode]}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="lobby-name">Назва лобі</label>
            <input
              id="lobby-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введіть назву лобі"
              maxLength={30}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="lobby-players">Кількість гравців</label>
            <select
              id="lobby-players"
              value={maxPlayers}
              onChange={(e) => handleMaxPlayersChange(Number(e.target.value))}
              disabled={gameMode === GameMode.RACE}
            >
              <option value={2}>2 гравці</option>
              <option value={3} disabled={gameMode === GameMode.RACE}>3 гравці</option>
              <option value={4} disabled={gameMode === GameMode.RACE}>4 гравці</option>
              <option value={5} disabled={gameMode === GameMode.RACE}>5 гравців</option>
              <option value={6} disabled={gameMode === GameMode.RACE}>6 гравців</option>
            </select>
            {gameMode === GameMode.RACE && (
              <span className="form-hint">Режим «На швидкість» доступний тільки для 2 гравців</span>
            )}
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
              />
              <span><LockIcon size={14} /> Захистити паролем</span>
            </label>
          </div>

          {usePassword && (
            <>
              <div className="form-group">
                <label htmlFor="lobby-password">Пароль</label>
                <input
                  id="lobby-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введіть пароль"
                />
              </div>

              <div className="form-group">
                <label htmlFor="lobby-confirm-password">Підтвердіть пароль</label>
                <input
                  id="lobby-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Підтвердіть пароль"
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="lobby-difficulty">Складність</label>
            <select
              id="lobby-difficulty"
              value={difficulty}
              onChange={(e) => handleDifficultyChange(e.target.value as DifficultyLevel)}
            >
              {(Object.keys(DIFFICULTY_PRESETS) as DifficultyLevel[]).map((key) => {
                const preset = DIFFICULTY_PRESETS[key];
                const isDisabled = maxPlayers > 2 && key === 'EASY';
                return (
                  <option key={key} value={key} disabled={isDisabled}>
                    {DIFFICULTY_TEXT[key]} {DIFFICULTY_LABELS[key]} ({preset.rows}x{preset.cols}, {preset.mines} мін)
                    {isDisabled ? ' — недоступно для 3+ гравців' : ''}
                  </option>
                );
              })}
            </select>
            {maxPlayers > 2 && (
              <span className="form-hint">Для 3+ гравців мінімальна складність — Середньо</span>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              Скасувати
            </button>
            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Створення...' : 'Створити лобі'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
