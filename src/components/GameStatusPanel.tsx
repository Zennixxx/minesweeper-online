import React from 'react';
import { GameStatus, DifficultyLevel, DIFFICULTY_PRESETS } from '../types';
import { PartyIcon, ExplosionIcon } from '../icons';

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  EASY: 'Легко',
  MEDIUM: 'Середньо',
  HARD: 'Складно'
};

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
  const getStatusIcon = (): string => {
    switch (status) {
      case GameStatus.READY:
        return '😀';
      case GameStatus.PLAYING:
        return '😐';
      case GameStatus.WON:
        return '😎';
      case GameStatus.LOST:
        return '😵';
      default:
        return '😀';
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
            {getStatusIcon()}
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
            {(Object.keys(DIFFICULTY_PRESETS) as DifficultyLevel[]).map((key) => {
              const preset = DIFFICULTY_PRESETS[key];
              return (
                <option key={key} value={key}>
                  {DIFFICULTY_LABELS[key]} ({preset.rows}x{preset.cols}, {preset.mines} мін)
                </option>
              );
            })}
          </select>
        </div>
      </div>
      
      {status === GameStatus.WON && (
        <div className="game-message victory">
          <PartyIcon size={18} /> Вітаємо! Ви виграли! <PartyIcon size={18} />
        </div>
      )}
      
      {status === GameStatus.LOST && (
        <div className="game-message defeat">
          <ExplosionIcon size={18} /> Гра закінчена! Спробуйте ще раз!
        </div>
      )}
    </div>
  );
};