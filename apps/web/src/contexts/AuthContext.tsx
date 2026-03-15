import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, AuthState } from "../types";
import { groundHttpBase } from "../lib/runtime-url";

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const apiBase = groundHttpBase();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem("auth_token"),
    isAuthenticated: false,
    isLoading: true,
  });
  const [error, setError] = useState<string | null>(null);

  // Initialize: validate token and fetch user
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setState(s => ({ ...s, isLoading: false }));
        return;
      }

      try {
        // Real implementation would fetch user profile here
        // const response = await fetch(`${apiBase}/api/auth/me`, {
        //   headers: { Authorization: `Bearer ${token}` }
        // });
        // if (!response.ok) throw new Error("Invalid token");
        // const user = await response.json();
        
        // Mocking for now but structure is correct
        const mockUser: User = { username: "operator_01", role: "admin" };
        setState({
          token,
          user: mockUser,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (err) {
        localStorage.removeItem("auth_token");
        setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
      }
    };

    void initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    setError(null);
    try {
      // Real login request
      // const response = await fetch(`${apiBase}/api/auth/login`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ username, password }),
      // });
      // if (!response.ok) throw new Error("Authentication failed");
      // const { token, user } = await response.json();

      // Mock success for now
      if (username === "admin" && password === "admin") {
        const token = "mock_jwt_token_" + Date.now();
        const user: User = { username, role: "admin" };
        
        localStorage.setItem("auth_token", token);
        setState({
          token,
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        throw new Error("Invalid credentials. Try admin/admin.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      throw err;
    }
  };

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
