import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  initGame, updateGame, renderGame,
  getAvailablePoints, upgradeStat,
  addNetworkPlayer, removeNetworkPlayer, updateNetworkPlayerState,
  GameState,
} from './gameEngine';
import {
  STAT_NAMES, STAT_LABELS, STAT_MAX,
  TankStats,
} from './diepTypes';
import {
  joinArena, leaveArena, syncPlayerState,
  subscribeToArena, getExistingPlayers, reportDeath,
} from './arenaService';
import './diep.css';

// ===== Name Input Screen =====
function NameScreen({ onPlay, defaultName }: { onPlay: (name: string) => void; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onPlay(name.trim() || 'Гравець');
  };

  return (
    <div className="diep-name-screen">
      <form className="diep-name-card" onSubmit={handleSubmit}>
        <h2>⚔️ Арена</h2>
        <p>Онлайн-гра у стилі diep.io</p>
        <input
          ref={inputRef}
          className="diep-name-input"
          type="text"
          placeholder="Ваше ім'я..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
        />
        <button type="submit" className="diep-play-btn">
          Грати!
        </button>
        <div className="diep-controls-hint">
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> — рух &nbsp;|&nbsp;
          <kbd>ЛКМ</kbd> — стрілянина &nbsp;|&nbsp;
          <kbd>E</kbd> — авто-стрілянина
        </div>
      </form>
    </div>
  );
}

// ===== Upgrade Panel =====
function UpgradePanel({
  stats, points, onUpgrade,
}: {
  stats: TankStats;
  points: number;
  onUpgrade: (stat: keyof TankStats) => void;
}) {
  if (points <= 0 && Object.values(stats).every(v => v === 0)) return null;

  return (
    <div className={`diep-upgrades ${points > 0 ? 'has-points' : ''}`}>
      {points > 0 && (
        <div className="diep-upgrade-points">
          Очки: {points}
        </div>
      )}
      {STAT_NAMES.map(stat => (
        <div key={stat} className="diep-upgrade-row">
          <button
            className={`diep-upgrade-btn ${stats[stat] >= STAT_MAX ? 'maxed' : ''}`}
            onClick={() => onUpgrade(stat)}
            title={STAT_LABELS[stat]}
          >
            +
          </button>
          <span className="diep-upgrade-label">{STAT_LABELS[stat]}</span>
          <div className="diep-upgrade-bar">
            {Array.from({ length: STAT_MAX }, (_, i) => (
              <div
                key={i}
                className={`diep-upgrade-pip ${i < stats[stat] ? 'filled' : ''}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== Main Game Component =====
export default function DiepGame() {
  const navigate = useNavigate();
  const auth = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameState | null>(null);
  const animFrameRef = useRef<number>(0);
  const [started, setStarted] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  // Throttled UI update
  const uiTimerRef = useRef<number>(0);

  const handlePlay = useCallback(async (name: string) => {
    setConnecting(true);
    setConnectError(null);

    try {
      // Auto-authenticate if needed
      if (!auth.isAuthenticated) {
        await auth.loginAsGuest(name);
      }

      // Join arena room
      const result = await joinArena(name);

      // Initialize local game
      const state = initGame(name);
      state.player.x = result.x;
      state.player.y = result.y;
      state.player.color = result.color;
      state.camera.x = result.x;
      state.camera.y = result.y;
      state.myDocId = result.docId;
      state.roomId = result.roomId;

      // Callback for when player dies from a network player
      state.onNetworkDeath = (killerDocId: string, score: number) => {
        reportDeath(killerDocId, score);
      };

      gameRef.current = state;

      // Load players already in the room
      const existing = await getExistingPlayers(result.roomId);
      for (const p of existing) {
        addNetworkPlayer(state, p);
      }

      // Subscribe to arena Realtime updates
      subscribeToArena(result.roomId, {
        onPlayerJoin: (player) => {
          const s = gameRef.current;
          if (s) addNetworkPlayer(s, player);
        },
        onPlayerUpdate: (player) => {
          const s = gameRef.current;
          if (s) updateNetworkPlayerState(s, player);
        },
        onPlayerLeave: (docId) => {
          const s = gameRef.current;
          if (s) removeNetworkPlayer(s, docId);
        },
      });

      setStarted(true);
    } catch (e: any) {
      console.error('Failed to join arena:', e);
      setConnectError(e.message || 'Не вдалося підключитися');
    } finally {
      setConnecting(false);
    }
  }, [auth]);

  // Game loop
  useEffect(() => {
    if (!started || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    let running = true;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Input handlers
    const onKeyDown = (e: KeyboardEvent) => {
      const state = gameRef.current;
      if (!state) return;
      const key = e.key.toLowerCase();
      state.keys.add(key);

      if (key === 'e') {
        state.autoFire = !state.autoFire;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const state = gameRef.current;
      if (!state) return;
      state.keys.delete(e.key.toLowerCase());
    };

    const onMouseMove = (e: MouseEvent) => {
      const state = gameRef.current;
      if (!state) return;
      // Mouse position relative to canvas center
      state.mouse.x = e.clientX - canvas.width / 2;
      state.mouse.y = e.clientY - canvas.height / 2;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        const state = gameRef.current;
        if (state) state.mouseDown = true;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        const state = gameRef.current;
        if (state) state.mouseDown = false;
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);

    // Game loop at ~60fps
    let lastTime = performance.now();
    const targetDt = 1000 / 60;

    const loop = (time: number) => {
      if (!running) return;

      const elapsed = time - lastTime;
      if (elapsed >= targetDt) {
        lastTime = time - (elapsed % targetDt);

        const state = gameRef.current;
        if (state) {
          updateGame(state);
          renderGame(ctx, state, canvas.width, canvas.height);

          // Sync player state to Appwrite (throttled internally)
          syncPlayerState({
            x: state.player.x,
            y: state.player.y,
            angle: state.player.angle,
            hp: state.player.hp,
            maxHp: state.player.maxHp,
            score: state.player.score,
            level: state.player.level,
            stats: state.player.stats,
            alive: state.player.alive,
            isShooting: state.mouseDown || state.autoFire,
          });

          // Update React UI every ~250ms
          uiTimerRef.current++;
          if (uiTimerRef.current % 15 === 0) {
            forceUpdate(v => v + 1);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [started]);

  const handleUpgrade = useCallback((stat: keyof TankStats) => {
    const state = gameRef.current;
    if (state) {
      upgradeStat(state.player, stat);
      forceUpdate(v => v + 1);
    }
  }, []);

  const handleBack = useCallback(async () => {
    await leaveArena();
    gameRef.current = null;
    navigate('/');
  }, [navigate]);

  if (!started) {
    if (connectError) {
      return (
        <>
          <button className="back-btn" onClick={() => navigate('/')}>← Назад до меню</button>
          <div className="diep-name-screen">
            <div className="diep-name-card">
              <h2>❌ Помилка</h2>
              <p style={{ color: '#f44', marginTop: 10 }}>{connectError}</p>
              <button
                className="diep-play-btn"
                style={{ marginTop: 20 }}
                onClick={() => setConnectError(null)}
              >
                Спробувати ще
              </button>
            </div>
          </div>
        </>
      );
    }
    if (connecting) {
      return (
        <>
          <button className="back-btn" onClick={() => navigate('/')}>← Назад до меню</button>
          <div className="diep-name-screen">
            <div className="diep-name-card">
              <h2>⏳ Підключення...</h2>
              <p>Пошук арени</p>
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        <button className="back-btn" onClick={() => navigate('/')}>← Назад до меню</button>
        <NameScreen onPlay={handlePlay} defaultName={auth.playerName || ''} />
      </>
    );
  }

  const state = gameRef.current;
  const points = state ? getAvailablePoints(state.player) : 0;
  const playerStats = state?.player.stats;
  const autoFire = state?.autoFire ?? false;
  const score = state?.player.score ?? 0;
  const onlinePlayers = state?.networkPlayers.length ?? 0;

  return (
    <div className="diep-container">
      <canvas ref={canvasRef} className="diep-canvas" />

      {/* Back button */}
      <button className="diep-back-btn" onClick={handleBack}>
        ✕ Вийти
      </button>

      {/* Score + online count */}
      <div className="diep-score">
        Рахунок: <span className="diep-score-value">{score}</span>
        <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: 3 }}>
          Гравців онлайн: {onlinePlayers}
        </div>
      </div>

      {/* Auto-fire indicator */}
      <div className={`diep-autofire ${autoFire ? 'active' : ''}`}>
        Авто-стрілянина: {autoFire ? 'ON' : 'OFF'} [E]
      </div>

      {/* Upgrades */}
      {playerStats && (
        <UpgradePanel
          stats={playerStats}
          points={points}
          onUpgrade={handleUpgrade}
        />
      )}
    </div>
  );
}
