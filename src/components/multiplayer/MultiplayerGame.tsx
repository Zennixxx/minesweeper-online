import React, { useState, useEffect, useCallback } from 'react';
import { MultiplayerGameState, MultiplayerGameStatus, deserializeBoard, deserializeConfig } from '../../multiplayerTypes';
import { getGame, makeMove, leaveGame } from '../../multiplayerService';
import { getOrCreatePlayerId, client, DATABASE_ID, GAMES_COLLECTION_ID } from '../../lib/appwrite';
import { Cell, CellState } from '../../types';
import { GameBoard } from '../GameBoard';

interface MultiplayerGameProps {
  game: MultiplayerGameState;
  onGameEnd: () => void;
}

export const MultiplayerGame: React.FC<MultiplayerGameProps> = ({ game: initialGame, onGameEnd }) => {
  const [game, setGame] = useState<MultiplayerGameState>(initialGame);
  const [board, setBoard] = useState<Cell[][]>(() => deserializeBoard(initialGame.board));
  const [error, setError] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const playerId = getOrCreatePlayerId();
  
  const isMyTurn = game.currentTurn === playerId;
  const config = deserializeConfig(game.config);

  const fetchGame = useCallback(async () => {
    try {
      const updatedGame = await getGame(game.$id!);
      setGame(updatedGame);
      setBoard(deserializeBoard(updatedGame.board));
      
      // Check if opponent left (game finished and we're the winner but not by points)
      if (updatedGame.status === MultiplayerGameStatus.FINISHED && 
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
  }, [game.$id, game.hostScore, game.guestScore, playerId]);

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
      if (game.status === MultiplayerGameStatus.PLAYING) {
        await leaveGame(game.$id!);
      }
      onGameEnd();
    } catch (err: any) {
      onGameEnd();
    }
  };

  const handleCellClick = async (row: number, col: number) => {
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

    try {
      setError(null);
      const updatedGame = await makeMove(game.$id!, row, col);
      setGame(updatedGame);
      setBoard(deserializeBoard(updatedGame.board));
    } catch (err: any) {
      setError(err.message || 'Помилка ходу');
    }
  };

  const handleCellRightClick = () => {
    // В мультиплеєрі прапорці вимкнено, щоб не ускладнювати гру
  };

  const getWinnerMessage = () => {
    if (game.status !== MultiplayerGameStatus.FINISHED) return null;
    
    if (game.winnerId === 'draw') {
      return '🤝 Нічия!';
    } else if (game.winnerId === playerId) {
      return '🏆 Ви перемогли!';
    } else {
      return '😔 Ви програли!';
    }
  };

  const getPlayerInfo = (isHostPlayer: boolean) => {
    const name = isHostPlayer ? game.hostName : game.guestName;
    const score = isHostPlayer ? game.hostScore : game.guestScore;
    const id = isHostPlayer ? game.hostId : game.guestId;
    const isCurrent = game.currentTurn === id;
    const isMe = id === playerId;
    
    return { name, score, isCurrent, isMe };
  };

  const hostInfo = getPlayerInfo(true);
  const guestInfo = getPlayerInfo(false);

  return (
    <div className="multiplayer-game-container">
      <div className="game-header-mp">
        <h2>💣 Сапер - Онлайн битва</h2>
      </div>

      <div className="players-score-panel">
        <div className={`player-score-card ${hostInfo.isCurrent ? 'active' : ''} ${hostInfo.isMe ? 'me' : ''}`}>
          <div className="player-avatar">👑</div>
          <div className="player-details">
            <div className="player-name-score">
              {hostInfo.name}
              {hostInfo.isMe && <span className="me-badge">(Ви)</span>}
            </div>
            <div className="score">Очки: <strong>{hostInfo.score}</strong></div>
          </div>
          {hostInfo.isCurrent && game.status === MultiplayerGameStatus.PLAYING && (
            <div className="turn-indicator">🎯 Хід</div>
          )}
        </div>

        <div className="vs-badge">VS</div>

        <div className={`player-score-card ${guestInfo.isCurrent ? 'active' : ''} ${guestInfo.isMe ? 'me' : ''}`}>
          <div className="player-avatar">🎮</div>
          <div className="player-details">
            <div className="player-name-score">
              {guestInfo.name}
              {guestInfo.isMe && <span className="me-badge">(Ви)</span>}
            </div>
            <div className="score">Очки: <strong>{guestInfo.score}</strong></div>
          </div>
          {guestInfo.isCurrent && game.status === MultiplayerGameStatus.PLAYING && (
            <div className="turn-indicator">🎯 Хід</div>
          )}
        </div>
      </div>

      {game.status === MultiplayerGameStatus.PLAYING && (
        <div className={`turn-message ${isMyTurn ? 'your-turn' : 'opponent-turn'}`}>
          {isMyTurn ? '🎯 Ваш хід! Оберіть клітинку' : '⏳ Хід суперника...'}
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
        <div className={`game-over-message ${game.winnerId === playerId ? 'victory' : game.winnerId === 'draw' ? 'draw' : 'defeat'}`}>
          {getWinnerMessage()}
          <div className="final-scores">
            Фінальний рахунок: {game.hostName} {game.hostScore} — {game.guestScore} {game.guestName}
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className={`game-board-wrapper ${!isMyTurn ? 'disabled' : ''}`}>
        <GameBoard
          board={board}
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
          🚪 Вийти з гри
        </button>
      </div>
    </div>
  );
};
