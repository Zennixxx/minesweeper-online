import React, { useState, useEffect, useCallback } from 'react';
import { 
  Cell, 
  CellState, 
  GameStatus, 
  GameConfig,
  DifficultyLevel,
  DIFFICULTY_PRESETS 
} from '../types';
import {
  createBoard,
  placeMines,
  calculateNeighborMines,
  revealCells,
  getGameStatus,
  countFlags,
  revealAllMines
} from '../gameUtils';
import { GameBoard } from './GameBoard';
import { GameStatusPanel } from './GameStatusPanel';
import { BombIcon } from '../icons';

export const Minesweeper: React.FC = () => {
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('EASY');
  const [config, setConfig] = useState<GameConfig>(DIFFICULTY_PRESETS.EASY);
  const [board, setBoard] = useState<Cell[][]>([]);
  const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.READY);
  const [gameStarted, setGameStarted] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [timerInterval, setTimerInterval] = useState<number | null>(null);

  // Initialize new game
  const initializeGame = useCallback(() => {
    const newBoard = createBoard(config);
    setBoard(newBoard);
    setGameStatus(GameStatus.READY);
    setGameStarted(false);
    setTimeElapsed(0);
  }, [config]);

  // Start timer
  const startTimer = useCallback(() => {
    const interval = window.setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);
    
    setTimerInterval(interval);
  }, []);

  // Stop timer
  const stopTimer = useCallback(() => {
    setTimerInterval(prev => {
      if (prev) {
        clearInterval(prev);
      }
      return null;
    });
  }, []);

  // Handle left click on cell
  const handleCellLeftClick = useCallback((row: number, col: number) => {
    if (gameStatus === GameStatus.WON || gameStatus === GameStatus.LOST) {
      return;
    }

    // First click - place mines and start game
    if (!gameStarted) {
      let newBoard = createBoard(config);
      newBoard = placeMines(newBoard, config, row, col);
      newBoard = calculateNeighborMines(newBoard);
      
      // Reveal the clicked cell
      if (newBoard[row][col].state === CellState.HIDDEN) {
        newBoard = revealCells(newBoard, row, col);
      }
      
      setBoard(newBoard);
      setGameStarted(true);
      setGameStatus(GameStatus.PLAYING);
      startTimer();
    } else {
      // Subsequent clicks - just reveal cells
      setBoard(prevBoard => {
        if (prevBoard[row][col].state === CellState.HIDDEN) {
          return revealCells(prevBoard, row, col);
        }
        return prevBoard;
      });
    }
  }, [gameStatus, gameStarted, config, startTimer]);

  // Handle right click on cell (flag/unflag)
  const handleCellRightClick = useCallback((row: number, col: number) => {
    console.log('Right click:', row, col, 'Status:', gameStatus);
    
    if (gameStatus === GameStatus.WON || gameStatus === GameStatus.LOST) {
      return;
    }

    setBoard(prevBoard => {
      console.log('Setting board, prev state:', prevBoard[row][col].state);
      
      const newBoard = prevBoard.map(boardRow => 
        boardRow.map(cell => ({ ...cell }))
      );
      const cell = newBoard[row][col];

      if (cell.state === CellState.HIDDEN) {
        cell.state = CellState.FLAGGED;
        console.log('Set to FLAGGED');
      } else if (cell.state === CellState.FLAGGED) {
        cell.state = CellState.HIDDEN;
        console.log('Set to HIDDEN');
      }

      return newBoard;
    });
  }, [gameStatus]);

  // Handle difficulty change
  const handleDifficultyChange = useCallback((newDifficulty: DifficultyLevel) => {
    setDifficulty(newDifficulty);
    setConfig(DIFFICULTY_PRESETS[newDifficulty]);
  }, []);

  // Handle new game
  const handleNewGame = useCallback(() => {
    stopTimer();
    initializeGame();
  }, [initializeGame, stopTimer]);

  // Update game status based on board changes
  useEffect(() => {
    if (gameStarted) {
      const newStatus = getGameStatus(board, gameStarted);
      
      if (newStatus !== gameStatus) {
        setGameStatus(newStatus);
        
        if (newStatus === GameStatus.WON || newStatus === GameStatus.LOST) {
          stopTimer();
          
          if (newStatus === GameStatus.LOST) {
            // Reveal all mines when game is lost
            setBoard(prevBoard => revealAllMines(prevBoard));
          }
        }
      }
    }
  }, [board, gameStarted, gameStatus, stopTimer]);

  // Initialize game when config changes
  useEffect(() => {
    stopTimer();
    const newBoard = createBoard(config);
    setBoard(newBoard);
    setGameStatus(GameStatus.READY);
    setGameStarted(false);
    setTimeElapsed(0);
  }, [config, stopTimer]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [timerInterval]);

  const flagCount = countFlags(board);
  const gameEnded = gameStatus === GameStatus.WON || gameStatus === GameStatus.LOST;

  return (
    <div className="minesweeper">
      <h1 className="game-title"><BombIcon size={28} /> Сапер</h1>
      
      <GameStatusPanel
        status={gameStatus}
        mineCount={config.mines}
        flagCount={flagCount}
        timeElapsed={timeElapsed}
        onNewGame={handleNewGame}
        onDifficultyChange={handleDifficultyChange}
        currentDifficulty={difficulty}
      />
      
      <GameBoard
        board={board}
        onCellLeftClick={handleCellLeftClick}
        onCellRightClick={handleCellRightClick}
        gameEnded={gameEnded}
      />
    </div>
  );
};