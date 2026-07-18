import * as React from "react";
import { backend } from "./api/backend";
import { setAuthToken } from "./api/http";
import type { PublicUser } from "./api/types";

const TOKEN_KEY = "relay.token";

interface AuthContextValue {
  user: PublicUser | null;
  status: "loading" | "authed" | "unauthed";
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    name: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
  /** Push a fresh PublicUser into context (e.g. after a profile update). */
  updateUser: (next: PublicUser) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<PublicUser | null>(null);
  const [status, setStatus] = React.useState<AuthContextValue["status"]>(
    "loading",
  );

  const apply = React.useCallback((token: string, nextUser: PublicUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setUser(nextUser);
    setStatus("authed");
  }, []);

  const logout = React.useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
    setStatus("unauthed");
  }, []);

  // Restore a stored session on load; drop it if the token is no longer valid.
  React.useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setStatus("unauthed");
      return;
    }
    setAuthToken(token);
    backend.auth
      .me()
      .then((me) => {
        setUser(me);
        setStatus("authed");
      })
      .catch(() => logout());
  }, [logout]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const { accessToken, user: nextUser } = await backend.auth.login({
        email,
        password,
      });
      apply(accessToken, nextUser);
    },
    [apply],
  );

  const register = React.useCallback(
    async (email: string, name: string, password: string) => {
      const { accessToken, user: nextUser } = await backend.auth.register({
        email,
        name,
        password,
      });
      apply(accessToken, nextUser);
    },
    [apply],
  );

  const updateUser = React.useCallback((next: PublicUser) => setUser(next), []);

  return (
    <AuthContext.Provider
      value={{ user, status, login, register, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
