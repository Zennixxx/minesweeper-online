import React, { useState } from 'react';
import { setPlayerName as savePlayerName } from '../../lib/appwrite';
import { useAuth } from '../../lib/AuthContext';

interface PlayerNameModalProps {
  onNameSet: (name: string) => void;
  onClose?: () => void;
}

export const PlayerNameModal: React.FC<PlayerNameModalProps> = ({ onNameSet, onClose }) => {
  const { playerName, updatePlayerName } = useAuth();
  const [name, setName] = useState(playerName || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      savePlayerName(name.trim());
      updatePlayerName(name.trim());
      onNameSet(name.trim());
      if (onClose) onClose();
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>✏️ Змінити нік</h2>
        <p>Введіть новий нік:</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваше ім'я"
            maxLength={20}
            autoFocus
          />
          <div className="modal-buttons">
            <button type="button" className="btn-cancel" onClick={handleClose}>
              Скасувати
            </button>
            <button type="submit" disabled={!name.trim()}>
              Зберегти
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
