import React from 'react';
import { Cell as CellType } from '../types';
import { Cell } from './Cell';

interface GameBoardProps {
  board: CellType[][];
  onCellLeftClick: (row: number, col: number) => void;
  onCellRightClick: (row: number, col: number) => void;
  gameEnded: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  board,
  onCellLeftClick,
  onCellRightClick,
  gameEnded
}) => {
  const rows = board.length;
  const cols = board[0]?.length || 0;

  return (
    <div 
      className="game-board"
      style={{
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`
      }}
    >
      {board.map((row) =>
        row.map((cell) => (
          <Cell
            key={cell.id}
            cell={cell}
            onLeftClick={onCellLeftClick}
            onRightClick={onCellRightClick}
            gameEnded={gameEnded}
          />
        ))
      )}
    </div>
  );
};