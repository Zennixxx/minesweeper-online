import React, { useState, useEffect, useCallback } from 'react';
import { MultiplayerGameState, MultiplayerGameStatus, deserializeBoard, deserializeConfig, deserializeSpectators } from '../../multiplayerTypes';
import { getGame, makeRaceMove, leaveGame, leaveAsSpectator } from '../../multiplayerService';
import { getOrCreatePlayerId, client, DATABASE_ID, GAMES_COLLECTION_ID } from '../../lib/appwrite';
import { Cell, CellState } from '../../types';
import { GameBoard } from '../GameBoard';
import { LightningIcon, StopwatchIcon, EyeIcon, CrownIcon, GamepadIcon, CheckCircleIcon, TargetIcon, TrophyIcon, HandshakeIcon, SadFaceIcon, DoorIcon } from '../../icons';

interface RaceGameProps {
  game: MultiplayerGameState;
  onGameEnd: () => void;
  isSpectator?: boolean;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const RaceGame: React.FC<RaceGameProps> = ({ game: initialGame, onGameEnd, isSpectator = false }) => {
  const [game, setGame] = useState<MultiplayerGameState>(initialGame);
  const [localFlags, setLocalFlags] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const playerId = getOrCreatePlayerId();

  const isHost = playerId === game.hostId;
  const config = deserializeConfig(game.config);
  const spectatorCount = deserializeSpectators(game.spectators).length;

  // Build player's board from master board + revealed cells
  const buildPlayerBoard = useCallback((gameState: MultiplayerGameState, forHost: boolean): Cell[][] => {
    const masterBoard = deserializeBoard(gameState.board);
    const revealedStr = forHost ? (gameState.hostBoard || '[]') : (gameState.guestBoard || '[]');
    let revealedSet: Set<string>;
    try {
      revealedSet = new Set<string>(JSON.parse(revealedStr));
    } catch {
      revealedSet = new Set<string>();
    }

    return masterBoard.map(row =>
      row.map(cell => {
        const key = `${cell.row}-${cell.col}`;
        if (revealedSet.has(key)) {
          return { ...cell, state: CellState.REVEALED };
        }
        return { ...cell, state: CellState.HIDDEN };
      })
    );
  }, []);

  const myBoard = buildPlayerBoard(game, isHost);

  // Timer
  useEffect(() => {
    if (game.status !== MultiplayerGameStatus.PLAYING || !game.startTime) return;
    const startTime = new Date(game.startTime).getTime();
    const update = () => setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [game.startTime, game.status]);

  const fetchGame = useCallback(async () => {
    try {
      const updatedGame = await getGame(game.$id!);
      setGame(updatedGame);

      if (!isSpectator && updatedGame.status === MultiplayerGameStatus.FINISHED &&
          updatedGame.winnerId !== playerId && updatedGame.winnerId !== 'draw') {
        // Check if opponent left
        const opFinished = isHost ? updatedGame.guestFinished : updatedGame.hostFinished;
        const myFinished = isHost ? updatedGame.hostFinished : updatedGame.guestFinished;
        if (!opFinished && !myFinished) {
          setOpponentLeft(true);
        }
      }
    } catch (err: any) {
      if (err.code === 404) {
        setOpponentLeft(true);
      } else {
        setError(err.message || 'Помилка оновлення гри');
      }
    }
  }, [game.$id, playerId, isHost, isSpectator]);

  // Subscribe to game updates
  useEffect(() => {
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAMES_COLLECTION_ID}.documents.${game.$id}`,
      () => { fetchGame(); }
    );
    return () => { unsubscribe(); };
  }, [game.$id, fetchGame]);

  const handleLeaveGame = async () => {
    try {
      if (isSpectator) {
        await leaveAsSpectator(game.$id!);
      } else if (game.status === MultiplayerGameStatus.PLAYING) {
        await leaveGame(game.$id!);
      }
      onGameEnd();
    } catch {
      onGameEnd();
    }
  };

  const handleCellClick = async (row: number, col: number) => {
    if (isSpectator || game.status !== MultiplayerGameStatus.PLAYING) return;

    const cell = myBoard[row][col];
    if (cell.state === CellState.REVEALED) return;

    // If cell has local flag, remove it first
    const key = `${row}-${col}`;
    if (localFlags.has(key)) {
      setLocalFlags(prev => {
        const newFlags = new Set(prev);
        newFlags.delete(key);
        return newFlags;
      });
      return;
    }

    try {
      setError(null);
      const updatedGame = await makeRaceMove(game.$id!, row, col);
      setGame(updatedGame);
    } catch (err: any) {
      if (err.message !== 'Ця клітинка вже відкрита') {
        setError(err.message || 'Помилка ходу');
      }
    }
  };

  const handleCellRightClick = (row: number, col: number) => {
    if (isSpectator || game.status !== MultiplayerGameStatus.PLAYING) return;

    const cell = myBoard[row][col];
    if (cell.state === CellState.REVEALED) return;

    const key = `${row}-${col}`;
    setLocalFlags(prev => {
      const newFlags = new Set(prev);
      if (newFlags.has(key)) {
        newFlags.delete(key);
      } else {
        newFlags.add(key);
      }
      return newFlags;
    });
  };

  // Apply local flags to board
  const boardWithFlags = myBoard.map(row =>
    row.map(cell => {
      const key = `${cell.row}-${cell.col}`;
      if (localFlags.has(key) && cell.state === CellState.HIDDEN) {
        return { ...cell, state: CellState.FLAGGED };
      }
      return cell;
    })
  );

  // Calculate progress for a player
  const getProgress = (gameState: MultiplayerGameState, forHost: boolean) => {
    const masterBoard = deserializeBoard(gameState.board);
    const revealedStr = forHost ? (gameState.hostBoard || '[]') : (gameState.guestBoard || '[]');
    let revealedSet: Set<string>;
    try {
      revealedSet = new Set<string>(JSON.parse(revealedStr));
    } catch {
      revealedSet = new Set<string>();
    }

    let totalSafe = 0;
    let revealedSafe = 0;
    for (const row of masterBoard) {
      for (const cell of row) {
        if (!cell.isMine) {
          totalSafe++;
          if (revealedSet.has(`${cell.row}-${cell.col}`)) {
            revealedSafe++;
          }
        }
      }
    }

    return totalSafe > 0 ? Math.round((revealedSafe / totalSafe) * 100) : 0;
  };

  const getWinnerMessage = () => {
    if (game.status !== MultiplayerGameStatus.FINISHED) return null;

    if (game.winnerId === 'draw') {
      return <><HandshakeIcon size={18} /> Нічия!</>;
    } else if (isSpectator) {
      const winnerName = game.winnerId === game.hostId ? game.hostName : game.guestName;
      return <><TrophyIcon size={18} /> Переможець: {winnerName}</>;
    } else if (game.winnerId === playerId) {
      return <><TrophyIcon size={18} /> Ви перемогли!</>;
    } else {
      return <><SadFaceIcon size={18} /> Ви програли!</>;
    }
  };

  return (
    <div className="multiplayer-game-container race-game">
      <div className="game-header-mp">
        <h2><LightningIcon size={20} /> Сапер - Змагання на швидкість</h2>
        <div className="race-timer"><StopwatchIcon size={16} /> {formatTime(elapsedTime)}</div>
        {isSpectator && (
          <div className="spectator-badge"><EyeIcon size={14} /> Ви спостерігаєте за грою</div>
        )}
        {spectatorCount > 0 && (
          <div className="spectator-count"><EyeIcon size={14} /> Глядачів: {spectatorCount}</div>
        )}
      </div>

      <div className="race-scoreboard">
        <div className={`race-player-card ${isHost ? 'me' : ''} ${game.hostFinished ? 'finished' : ''}`}>
          <div className="race-player-name">
            <CrownIcon size={16} /> {game.hostName}
            {game.hostId === playerId && <span className="me-badge">(Ви)</span>}
            {game.hostFinished && <span className="finished-badge"><CheckCircleIcon size={16} /></span>}
          </div>
          <div className="race-player-score">Очки: <strong>{game.hostScore}</strong></div>
          <div className="race-progress-bar">
            <div
              className="race-progress-fill host"
              style={{ width: `${getProgress(game, true)}%` }}
            />
          </div>
          <div className="race-progress-text">{getProgress(game, true)}%</div>
        </div>

        <div className="race-vs">VS</div>

        <div className={`race-player-card ${!isHost ? 'me' : ''} ${game.guestFinished ? 'finished' : ''}`}>
          <div className="race-player-name">
            <GamepadIcon size={16} /> {game.guestName}
            {game.guestId === playerId && <span className="me-badge">(Ви)</span>}
            {game.guestFinished && <span className="finished-badge"><CheckCircleIcon size={16} /></span>}
          </div>
          <div className="race-player-score">Очки: <strong>{game.guestScore}</strong></div>
          <div className="race-progress-bar">
            <div
              className="race-progress-fill guest"
              style={{ width: `${getProgress(game, false)}%` }}
            />
          </div>
          <div className="race-progress-text">{getProgress(game, false)}%</div>
        </div>
      </div>

      {game.status === MultiplayerGameStatus.PLAYING && !isSpectator && (
        <div className="race-hint">
          <TargetIcon size={14} /> Натискайте на клітинки якомога швидше! Хто першим розмінує поле - той переможе!
        </div>
      )}

      {isSpectator && game.status === MultiplayerGameStatus.PLAYING && (
        <div className="turn-message spectator">
          <LightningIcon size={14} /> Гравці змагаються на швидкість!
        </div>
      )}

      {opponentLeft && (
        <div className="game-over-message victory">
          <TrophyIcon size={18} /> Суперник вийшов з гри! Ви перемогли!
        </div>
      )}

      {game.status === MultiplayerGameStatus.FINISHED && !opponentLeft && (
        <div className={`game-over-message ${isSpectator ? 'spectator-end' : game.winnerId === playerId ? 'victory' : game.winnerId === 'draw' ? 'draw' : 'defeat'}`}>
          {getWinnerMessage()}
          <div className="final-scores">
            <StopwatchIcon size={14} /> Час: {formatTime(elapsedTime)} | {game.hostName}: {game.hostScore} — {game.guestName}: {game.guestScore}
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className={`game-board-wrapper ${isSpectator ? 'spectator-mode' : ''}`}>
        <GameBoard
          board={boardWithFlags}
          onCellLeftClick={handleCellClick}
          onCellRightClick={handleCellRightClick}
          gameEnded={game.status === MultiplayerGameStatus.FINISHED}
        />
      </div>

      <div className="game-info-bar">
        <div className="info-item">
          <span className="label">Мін на полі:</span>
          <span className="value">{config.mines}</span>
        </div>
        <div className="info-item">
          <span className="label">Складність:</span>
          <span className="value">{config.rows}x{config.cols}</span>
        </div>
      </div>

      <div className="game-actions">
        <button className="btn btn-danger" onClick={handleLeaveGame}>
          {isSpectator ? <><DoorIcon size={14} /> Покинути перегляд</> : <><DoorIcon size={14} /> Вийти з гри</>}
        </button>
      </div>
    </div>
  );
};
