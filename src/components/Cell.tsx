import React from 'react';
import { Cell as CellType, CellState } from '../types';

interface CellProps {
  cell: CellType;
  onLeftClick: (row: number, col: number) => void;
  onRightClick: (row: number, col: number) => void;
  gameEnded: boolean;
}

export const Cell: React.FC<CellProps> = ({ cell, onLeftClick, onRightClick, gameEnded }) => {
  const handleClick = () => {
    if (gameEnded || cell.state === CellState.FLAGGED) {
      return;
    }
    if (cell.state === CellState.HIDDEN) {
      onLeftClick(cell.row, cell.col);
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (gameEnded || cell.state === CellState.REVEALED) {
      return;
    }
    
    onRightClick(cell.row, cell.col);
  };

  const getCellContent = (): string => {
    if (cell.state === CellState.FLAGGED) {
      return '🚩';
    }
    
    if (cell.state === CellState.REVEALED) {
      if (cell.isMine) {
        return '💣';
      }
      
      if (cell.neighborMines > 0) {
        return cell.neighborMines.toString();
      }
    }
    
    return '';
  };

  const getCellClassName = (): string => {
    let className = 'cell';
    
    if (cell.state === CellState.REVEALED) {
      className += ' revealed';
      
      if (cell.isMine) {
        className += ' mine';
      } else if (cell.neighborMines > 0) {
        className += ` number-${cell.neighborMines}`;
      }
    } else if (cell.state === CellState.FLAGGED) {
      className += ' flagged';
    } else {
      className += ' hidden';
    }
    
    return className;
  };

  return (
    <button
      className={getCellClassName()}
      onClick={handleClick}
      onContextMenu={handleRightClick}
      disabled={gameEnded && cell.state !== CellState.REVEALED}
    >
      {getCellContent()}
    </button>
  );
};