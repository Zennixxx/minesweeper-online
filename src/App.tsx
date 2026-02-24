import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Minesweeper } from './components/Minesweeper';
import { MultiplayerApp } from './components/multiplayer';
import { getGameSession } from './lib/appwrite';
import { BombIcon, GamepadIcon, UsersIcon, SwordsIcon } from './icons';
import './index.css';
import './multiplayer.css';

const DiepGame = lazy(() => import('./components/diep/DiepGame'));

// Redirects player back to active game if they land on the main menu
function SessionRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/') {
      const session = getGameSession();
      if (session) {
        const path = session.isSpectator
          ? `/multiplayer/spectate/${session.gameId}`
          : `/multiplayer/game/${session.gameId}`;
        navigate(path, { replace: true });
      }
    }
  }, [location.pathname, navigate]);

  return null;
}

function MainMenu() {
  const navigate = useNavigate();

  return (
    <div className="main-menu">
      <h1 className="game-title"><BombIcon size={28} /> Сапер</h1>
      <p className="menu-subtitle">Оберіть режим гри</p>

      <div className="menu-buttons">
        <button
          className="menu-btn menu-btn-single"
          onClick={() => navigate('/single')}
        >
          <span className="menu-btn-icon"><GamepadIcon size={24} /></span>
          <span className="menu-btn-text">Одиночна гра</span>
          <span className="menu-btn-desc">Класичний сапер</span>
        </button>

        <button
          className="menu-btn menu-btn-multi"
          onClick={() => navigate('/multiplayer')}
        >
          <span className="menu-btn-icon"><UsersIcon size={24} /></span>
          <span className="menu-btn-text">Онлайн на двох</span>
          <span className="menu-btn-desc">Змагайтесь з друзями!</span>
        </button>

        <button
          className="menu-btn menu-btn-arena"
          onClick={() => navigate('/arena')}
        >
          <span className="menu-btn-icon"><SwordsIcon size={24} /></span>
          <span className="menu-btn-text">Онлайн арена</span>
          <span className="menu-btn-desc">Бій у стилі diep.io!</span>
        </button>
      </div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const isInGame = location.pathname.includes('/multiplayer/game/') ||
    location.pathname.includes('/multiplayer/spectate/');

  return (
    <div className="App">
      <SessionRedirect />
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/single" element={
          <>
            <button
              className="back-btn"
              onClick={() => navigate('/')}
            >
              ← Назад до меню
            </button>
            <Minesweeper />
          </>
        } />
        <Route path="/arena" element={
          <Suspense fallback={<div style={{color:'#fff',textAlign:'center',marginTop:'40vh'}}>Завантаження...</div>}>
            <DiepGame />
          </Suspense>
        } />
        <Route path="/multiplayer/*" element={
          <>
            {!isInGame && (
              <button
                className="back-btn"
                onClick={() => navigate('/')}
              >
                ← Назад до меню
              </button>
            )}
            <MultiplayerApp />
          </>
        } />
      </Routes>
    </div>
  );
}

export default App;