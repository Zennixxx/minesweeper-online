import React from 'react';
import { GameStatus, DifficultyLevel } from '../types';

interface GameStatusProps {
  status: GameStatus;
  mineCount: number;
  flagCount: number;
  timeElapsed: number;
  onNewGame: () => void;
  onDifficultyChange: (difficulty: DifficultyLevel) => void;
  currentDifficulty: DifficultyLevel;
}

export const GameStatusPanel: React.FC<GameStatusProps> = ({
  status,
  mineCount,
  flagCount,
  timeElapsed,
  onNewGame,
  onDifficultyChange,
  currentDifficulty
}) => {
  const getStatusEmoji = (): string => {
    switch (status) {
      case GameStatus.READY:
        return '🙂';
      case GameStatus.PLAYING:
        return '😐';
      case GameStatus.WON:
        return '😎';
      case GameStatus.LOST:
        return '😵';
      default:
        return '🙂';
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const remainingMines = mineCount - flagCount;

  return (
    <div className="game-status">
      <div className="game-header">
        <div className="game-info">
          <div className="info-item">
            <span className="label">Міни:</span>
            <span className="value">{remainingMines}</span>
          </div>
          
          <button 
            className="new-game-button"
            onClick={onNewGame}
            title="Нова гра"
          >
            {getStatusEmoji()}
          </button>
          
          <div className="info-item">
            <span className="label">Час:</span>
            <span className="value">{formatTime(timeElapsed)}</span>
          </div>
        </div>
        
        <div className="difficulty-selector">
          <label>Складність:</label>
          <select 
            value={currentDifficulty}
            onChange={(e) => onDifficultyChange(e.target.value as DifficultyLevel)}
          >
            <option value="EASY">Легко (9x9, 10 мін)</option>
            <option value="MEDIUM">Середньо (16x16, 40 мін)</option>
            <option value="HARD">Складно (16x30, 99 мін)</option>
          </select>
        </div>
      </div>
      
      {status === GameStatus.WON && (
        <div className="game-message victory">
          🎉 Вітаємо! Ви виграли! 🎉
        </div>
      )}
      
      {status === GameStatus.LOST && (
        <div className="game-message defeat">
          💥 Гра закінчена! Спробуйте ще раз! 💥
        </div>
      )}
    </div>
  );
};