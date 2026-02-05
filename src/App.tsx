import { useState } from 'react';
import { Minesweeper } from './components/Minesweeper';
import { MultiplayerApp } from './components/multiplayer';
import './index.css';
import './multiplayer.css';

type GameMode = 'menu' | 'single' | 'multiplayer';

function App() {
  const [gameMode, setGameMode] = useState<GameMode>('menu');

  if (gameMode === 'menu') {
    return (
      <div className="App">
        <div className="main-menu">
          <h1 className="game-title">💣 Сапер</h1>
          <p className="menu-subtitle">Оберіть режим гри</p>
          
          <div className="menu-buttons">
            <button 
              className="menu-btn menu-btn-single"
              onClick={() => setGameMode('single')}
            >
              <span className="menu-btn-icon">🎮</span>
              <span className="menu-btn-text">Одиночна гра</span>
              <span className="menu-btn-desc">Класичний сапер</span>
            </button>
            
            <button 
              className="menu-btn menu-btn-multi"
              onClick={() => setGameMode('multiplayer')}
            >
              <span className="menu-btn-icon">👥</span>
              <span className="menu-btn-text">Онлайн на двох</span>
              <span className="menu-btn-desc">Змагайтесь з друзями!</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameMode === 'single') {
    return (
      <div className="App">
        <button 
          className="back-btn"
          onClick={() => setGameMode('menu')}
        >
          ← Назад до меню
        </button>
        <Minesweeper />
      </div>
    );
  }

  return (
    <div className="App">
      <button 
        className="back-btn"
        onClick={() => setGameMode('menu')}
      >
        ← Назад до меню
      </button>
      <MultiplayerApp />
    </div>
  );
}

export default App;