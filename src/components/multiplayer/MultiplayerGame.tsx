import React, { useState, useEffect, useCallback } from 'react';
import { MultiplayerGameState, MultiplayerGameStatus, deserializeBoard, deserializeConfig, deserializeGamePlayers, deserializeSpectators } from '../../multiplayerTypes';
import { getGame, makeMove, leaveGame, leaveAsSpectator } from '../../multiplayerService';
import { getOrCreatePlayerId, client, DATABASE_ID, GAMES_COLLECTION_ID } from '../../lib/appwrite';
import { Cell, CellState } from '../../types';
import { GameBoard } from '../GameBoard';

interface MultiplayerGameProps {
  game: MultiplayerGameState;
  onGameEnd: () => void;
  isSpectator?: boolean;
}

export const MultiplayerGame: React.FC<MultiplayerGameProps> = ({ game: initialGame, onGameEnd, isSpectator = false }) => {
  const [game, setGame] = useState<MultiplayerGameState>(initialGame);
  const [board, setBoard] = useState<Cell[][]>(() => deserializeBoard(initialGame.board));
  const [localFlags, setLocalFlags] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const playerId = getOrCreatePlayerId();
  
  const isMyTurn = !isSpectator && game.currentTurn === playerId;
  const config = deserializeConfig(game.config);
  const spectatorCount = deserializeSpectators(game.spectators).length;

  const fetchGame = useCallback(async () => {
    try {
      const updatedGame = await getGame(game.$id!);
      setGame(updatedGame);
      setBoard(deserializeBoard(updatedGame.board));
      
      // Check if opponent left (game finished and we're the winner but not by points)
      // Only check for non-spectators
      if (!isSpectator && updatedGame.status === MultiplayerGameStatus.FINISHED && 
          updatedGame.winnerId === playerId &&
          updatedGame.hostScore === game.hostScore && 
          updatedGame.guestScore === game.guestScore) {
        setOpponentLeft(true);
      }
    } catch (err: any) {
      // Game might have been deleted - opponent left
      if (err.code === 404) {
        setOpponentLeft(true);
      } else {
        setError(err.message || 'Помилка оновлення гри');
      }
    }
  }, [game.$id, game.hostScore, game.guestScore, playerId, isSpectator]);

  useEffect(() => {
    // Subscribe to game updates
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${GAMES_COLLECTION_ID}.documents.${game.$id}`,
      () => {
        fetchGame();
      }
    );

    return () => {
      unsubscribe();
    };
  }, [game.$id, fetchGame]);

  // Handle leaving game (forfeit)
  const handleLeaveGame = async () => {
    try {
      if (isSpectator) {
        await leaveAsSpectator(game.$id!);
      } else if (game.status === MultiplayerGameStatus.PLAYING) {
        await leaveGame(game.$id!);
      }
      onGameEnd();
    } catch (err: any) {
      onGameEnd();
    }
  };

  const handleCellClick = async (row: number, col: number) => {
    if (isSpectator) {
      return; // Spectators can't make moves
    }

    if (!isMyTurn) {
      setError('Зараз не ваш хід!');
      setTimeout(() => setError(null), 2000);
      return;
    }

    if (game.status !== MultiplayerGameStatus.PLAYING) {
      return;
    }

    const cell = board[row][col];
    if (cell.state === CellState.REVEALED) {
      return;
    }

    // If cell has local flag, remove it first (don't make move)
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
      const updatedGame = await makeMove(game.$id!, row, col);
      setGame(updatedGame);
      setBoard(deserializeBoard(updatedGame.board));
    } catch (err: any) {
      setError(err.message || 'Помилка ходу');
    }
  };

  const handleCellRightClick = (row: number, col: number) => {
    if (isSpectator || game.status !== MultiplayerGameStatus.PLAYING) {
      return;
    }

    const cell = board[row][col];
    if (cell.state === CellState.REVEALED) {
      return;
    }

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

  // Apply local flags to board for display
  const boardWithFlags = board.map(row => 
    row.map(cell => {
      const key = `${cell.row}-${cell.col}`;
      if (localFlags.has(key) && cell.state === CellState.HIDDEN) {
        return { ...cell, state: CellState.FLAGGED };
      }
      return cell;
    })
  );

  const getWinnerMessage = () => {
    if (game.status !== MultiplayerGameStatus.FINISHED) return null;
    
    const gamePlayers = deserializeGamePlayers(game.players);
    
    if (game.winnerId === 'draw') {
      return '🤝 Нічия!';
    } else if (isSpectator) {
      const winner = gamePlayers.find(p => p.id === game.winnerId);
      return `🏆 Переможець: ${winner?.name || 'Невідомий'}`;
    } else if (game.winnerId === playerId) {
      return '🏆 Ви перемогли!';
    } else {
      return '😔 Ви програли!';
    }
  };

  // Get players from game state
  const gamePlayers = deserializeGamePlayers(game.players);
  
  // Find current player name for turn messages
  const currentPlayerName = gamePlayers.find(p => p.id === game.currentTurn)?.name || game.hostName;

  return (
    <div className="multiplayer-game-container">
      <div className="game-header-mp">
        <h2>💣 Сапер - {isSpectator ? 'Режим глядача' : 'Онлайн битва'}</h2>
        {isSpectator && (
          <div className="spectator-badge">👁️ Ви спостерігаєте за грою</div>
        )}
        {spectatorCount > 0 && (
          <div className="spectator-count">👁️ Глядачів: {spectatorCount}</div>
        )}
      </div>

      <div className="players-score-panel multi-player">
        {gamePlayers.map((player, index) => (
          <React.Fragment key={player.id}>
            {index > 0 && <div className="vs-badge">VS</div>}
            <div className={`player-score-card ${game.currentTurn === player.id ? 'active' : ''} ${player.id === playerId ? 'me' : ''}`}>
              <div className="player-avatar">{index === 0 ? '👑' : '🎮'}</div>
              <div className="player-details">
                <div className="player-name-score">
                  {player.name}
                  {player.id === playerId && <span className="me-badge">(Ви)</span>}
                </div>
                <div className="score">Очки: <strong>{player.score}</strong></div>
              </div>
              {game.currentTurn === player.id && game.status === MultiplayerGameStatus.PLAYING && (
                <div className="turn-indicator">🎯 Хід</div>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>

      {game.status === MultiplayerGameStatus.PLAYING && (
        <div className={`turn-message ${isSpectator ? 'spectator' : isMyTurn ? 'your-turn' : 'opponent-turn'}`}>
          {isSpectator 
            ? `🎯 Зараз ходить: ${currentPlayerName}`
            : isMyTurn 
              ? '🎯 Ваш хід! Оберіть клітинку' 
              : `⏳ Хід гравця ${currentPlayerName}...`}
        </div>
      )}

      {opponentLeft && (
        <div className="game-over-message victory">
          🏆 Суперник вийшов з гри! Ви перемогли!
          <div className="final-scores">
            Перемога за відсутністю суперника
          </div>
        </div>
      )}

      {game.status === MultiplayerGameStatus.FINISHED && !opponentLeft && (
        <div className={`game-over-message ${isSpectator ? 'spectator-end' : game.winnerId === playerId ? 'victory' : game.winnerId === 'draw' ? 'draw' : 'defeat'}`}>
          {getWinnerMessage()}
          <div className="final-scores">
            Фінальний рахунок: {gamePlayers.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ' — '}
                {p.name}: {p.score}
              </span>
            ))}
          </div>
          {isSpectator && (
            <div className="spectator-end-hint">
              Гра завершена. Натисніть кнопку нижче, щоб повернутися.
            </div>
          )}
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className={`game-board-wrapper ${isSpectator ? 'spectator-mode' : !isMyTurn ? 'disabled' : ''}`}>
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
          <span className="value">{config.mines - game.minesRevealed}</span>
        </div>
        <div className="info-item">
          <span className="label">Складність:</span>
          <span className="value">{config.rows}x{config.cols}</span>
        </div>
      </div>

      <div className="game-actions">
        <button className="btn btn-danger" onClick={handleLeaveGame}>
          {isSpectator ? '🚪 Покинути перегляд' : '🚪 Вийти з гри'}
        </button>
      </div>
    </div>
  );
};
