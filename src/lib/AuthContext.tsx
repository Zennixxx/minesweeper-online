import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Models } from 'appwrite';
import { account, OAuthProvider, setPlayerId } from './appwrite';
import { getPlayerName, setPlayerName as savePlayerName } from './appwrite';

interface AuthState {
  user: Models.User<Models.Preferences> | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  playerName: string;
  playerId: string;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  updatePlayerName: (name: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// Sync auth user data: player ID kept in memory only, name in localStorage
const syncUserData = (user: Models.User<Models.Preferences>) => {
  setPlayerId(user.$id);

  // Set name from Google if user hasn't set a custom nickname yet
  const currentName = localStorage.getItem('minesweeper_player_name');
  if (!currentName || currentName === 'Гравець') {
    if (user.name) {
      localStorage.setItem('minesweeper_player_name', user.name);
    }
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Models.User<Models.Preferences> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playerName, setPlayerNameState] = useState<string>(getPlayerName());

  // On mount: check for OAuth token in URL, then check existing session
  useEffect(() => {
    const init = async () => {
      // After Google OAuth redirect, Appwrite appends ?userId=...&secret=... to the URL
      const params = new URLSearchParams(window.location.search);
      const userId = params.get('userId');
      const secret = params.get('secret');

      if (userId && secret) {
        try {
          // Exchange the token for a session (stored as httpOnly cookie on our domain)
          await account.createSession(userId, secret);
        } catch (e) {
          console.error('Failed to create session from OAuth token:', e);
        }
        // Clean query params from URL without reload
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);
      }

      // Now check if we have an active session
      try {
        const currentUser = await account.get();
        setUser(currentUser);
        syncUserData(currentUser);
        setPlayerNameState(getPlayerName());
      } catch {
        // No active session — user must log in
        setUser(null);
      }
      setIsLoading(false);
    };
    init();
  }, []);

  const loginWithGoogle = useCallback(() => {
    const redirectUrl = window.location.origin + window.location.pathname;
    // createOAuth2Token redirects to Google, then back with ?userId=...&secret=... in URL
    account.createOAuth2Token(OAuthProvider.Google, redirectUrl, redirectUrl);
  }, []);

  const logout = useCallback(async () => {
    try {
      await account.deleteSession('current');
    } catch {
      // ignore
    }
    setUser(null);
    setPlayerId('');
    localStorage.removeItem('minesweeper_player_name');
    setPlayerNameState('Гравець');
  }, []);

  const updatePlayerName = useCallback((name: string) => {
    savePlayerName(name);
    setPlayerNameState(name);
  }, []);

  const playerId = user?.$id || '';

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      playerName,
      playerId,
      loginWithGoogle,
      logout,
      updatePlayerName,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
