"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  userEmail: string | null;
};

type AuthContextValue = AuthState & {
  login: (state: AuthState) => void;
  logout: () => void;
  refreshAccessToken: () => Promise<string | null>;
};

const STORAGE_KEY = "calendar-auth";
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AuthState;
      setAccessToken(parsed.accessToken);
      setRefreshToken(parsed.refreshToken);
      setUserEmail(parsed.userEmail);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const persist = useCallback((state: AuthState | null) => {
    if (typeof window === "undefined") return;
    if (!state) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, []);

  const login = useCallback(
    (state: AuthState) => {
      setAccessToken(state.accessToken);
      setRefreshToken(state.refreshToken);
      setUserEmail(state.userEmail);
      persist(state);
    },
    [persist],
  );

  const logout = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    setUserEmail(null);
    persist(null);
  }, [persist]);

  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken) {
      return null;
    }
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshRequest = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) {
          return null;
        }
        const data = await response.json();
        const nextState: AuthState = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          userEmail,
        };
        setAccessToken(nextState.accessToken);
        setRefreshToken(nextState.refreshToken);
        setUserEmail(nextState.userEmail);
        persist(nextState);
        return nextState.accessToken;
      } catch {
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = refreshRequest;
    return refreshRequest;
  }, [refreshToken, persist, userEmail]);

  const value = useMemo(
    () => ({
      accessToken,
      refreshToken,
      userEmail,
      login,
      logout,
      refreshAccessToken,
    }),
    [accessToken, refreshToken, userEmail, login, logout, refreshAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

