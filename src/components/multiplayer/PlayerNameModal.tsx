import React, { useState, useEffect } from 'react';
import { getPlayerName, setPlayerName as savePlayerName } from '../../lib/appwrite';

interface PlayerNameModalProps {
  onNameSet: (name: string) => void;
  isEdit?: boolean;
  onClose?: () => void;
}

export const PlayerNameModal: React.FC<PlayerNameModalProps> = ({ onNameSet, isEdit = false, onClose }) => {
  const [name, setName] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const savedName = getPlayerName();
    if (isEdit) {
      setName(savedName || '');
      setIsVisible(true);
    } else if (savedName && savedName !== 'Гравець') {
      onNameSet(savedName);
    } else {
      setIsVisible(true);
    }
  }, [onNameSet, isEdit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      savePlayerName(name.trim());
      onNameSet(name.trim());
      setIsVisible(false);
      if (onClose) onClose();
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) onClose();
  };

  if (!isVisible) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>{isEdit ? '✏️ Змінити нік' : '👋 Ласкаво просимо!'}</h2>
        <p>{isEdit ? 'Введіть новий нік:' : 'Введіть ваше ім\'я для гри:'}</p>
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
            {isEdit && (
              <button type="button" className="btn-cancel" onClick={handleClose}>
                Скасувати
              </button>
            )}
            <button type="submit" disabled={!name.trim()}>
              {isEdit ? 'Зберегти' : 'Почати'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
