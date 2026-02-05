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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('EASY');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Введіть назву лобі');
      return;
    }

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

    try {
      setLoading(true);
      const lobby = await createLobby(name.trim(), password, difficulty);
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

          <div className="form-group">
            <label htmlFor="lobby-difficulty">Складність</label>
            <select
              id="lobby-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
            >
              <option value="EASY">🟢 Легко (9x9, 10 мін)</option>
              <option value="MEDIUM">🟡 Середньо (16x16, 40 мін)</option>
              <option value="HARD">🔴 Складно (16x30, 99 мін)</option>
            </select>
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
