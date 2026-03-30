"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type User = { username: string; avatar: string };

type AuthContextType = {
  user: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const USERS: Record<string, { password: string; avatar: string }> = {
  alex: { password: "alex123", avatar: "🦊" },
  sam: { password: "sam123", avatar: "🐼" },
  mia: { password: "mia123", avatar: "🦄" },
  leo: { password: "leo123", avatar: "🦁" },
  zoe: { password: "zoe123", avatar: "🐱" },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("kidplay-user");
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const login = (username: string, password: string): boolean => {
    const key = username.toLowerCase();
    const found = USERS[key];
    if (found && found.password === password) {
      const u = { username: key, avatar: found.avatar };
      setUser(u);
      localStorage.setItem("kidplay-user", JSON.stringify(u));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("kidplay-user");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
