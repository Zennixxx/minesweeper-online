import React, { useState } from 'react';
import { DifficultyLevel } from '../../types';
import { createLobby } from '../../multiplayerService';
import { Lobby } from '../../multiplayerTypes';

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      const lobby = await createLobby(name.trim(), usePassword ? password : '', difficulty, maxPlayers);
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
        <h2>➕ Створити нове лобі</h2>
        
        <form onSubmit={handleSubmit}>
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
            >
              <option value={2}>👥 2 гравці</option>
              <option value={3}>👥 3 гравці</option>
              <option value={4}>👥 4 гравці</option>
              <option value={5}>👥 5 гравців</option>
              <option value={6}>👥 6 гравців</option>
            </select>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
              />
              <span>🔒 Захистити паролем</span>
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
              <option value="EASY" disabled={maxPlayers > 2}>
                🟢 Легко (9x9, 10 мін) {maxPlayers > 2 ? '— недоступно для 3+ гравців' : ''}
              </option>
              <option value="MEDIUM">🟡 Середньо (16x16, 40 мін)</option>
              <option value="HARD">🔴 Складно (16x30, 99 мін)</option>
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
