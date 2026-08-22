import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  TemporarySessionError,
  clearTemporarySession,
  createTemporarySession,
  getStoredSessionToken,
  getTemporarySession,
  heartbeatTemporarySession,
  markTemporarySessionClosing,
  removeStoredSessionToken,
  storeSessionToken,
} from "@/services/sessionService";

type SessionStatus = "initializing" | "active" | "error";

interface SessionContextValue {
  token: string | null;
  expiresAt: number | null;
  status: SessionStatus;
  error: string | null;
  restartSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);
const HEARTBEAT_MS = 5 * 60 * 1000;

export const SessionProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [status, setStatus] = useState<SessionStatus>("initializing");
  const [error, setError] = useState<string | null>(null);

  const startFreshSession = useCallback(async () => {
    const session = await createTemporarySession();
    storeSessionToken(session.session_token);
    setToken(session.session_token);
    setExpiresAt(session.expires_at);
    setError(null);
    setStatus("active");
    return session.session_token;
  }, []);

  const initialize = useCallback(async () => {
    setStatus("initializing");
    setError(null);
    const storedToken = getStoredSessionToken();

    if (!storedToken) {
      await startFreshSession();
      return;
    }

    try {
      const session = await getTemporarySession(storedToken);
      setToken(storedToken);
      setExpiresAt(session.expires_at);
      setStatus("active");
    } catch (sessionError) {
      if (
        sessionError instanceof TemporarySessionError &&
        (sessionError.statusCode === 410 || sessionError.code === "SESSION_EXPIRED")
      ) {
        removeStoredSessionToken();
        await startFreshSession();
        return;
      }
      throw sessionError;
    }
  }, [startFreshSession]);

  useEffect(() => {
    initialize().catch((sessionError) => {
      setStatus("error");
      setError(sessionError instanceof Error ? sessionError.message : "Unable to start a temporary workspace.");
    });
  }, [initialize]);

  useEffect(() => {
    if (!token) return;

    const heartbeat = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const session = await heartbeatTemporarySession(token);
        setExpiresAt(session.expires_at);
      } catch (sessionError) {
        if (
          sessionError instanceof TemporarySessionError &&
          (sessionError.statusCode === 410 || sessionError.code === "SESSION_EXPIRED")
        ) {
          removeStoredSessionToken();
          setToken(null);
          await startFreshSession();
        }
      }
    };

    const interval = window.setInterval(heartbeat, HEARTBEAT_MS);
    const handleVisible = () => {
      if (document.visibilityState === "visible") void heartbeat();
    };
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [token, startFreshSession]);

  useEffect(() => {
    if (!token) return;

    const handlePageHide = () => {
      markTemporarySessionClosing(token);
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [token]);

  const restartSession = useCallback(async () => {
    const currentToken = getStoredSessionToken();
    removeStoredSessionToken();
    setToken(null);
    setExpiresAt(null);
    setStatus("initializing");
    setError(null);

    if (currentToken) {
      try {
        await clearTemporarySession(currentToken);
      } catch {
        // Explicit restart should still succeed locally if the old session is
        // already gone or the cleanup response is interrupted.
      }
    }

    await startFreshSession();
  }, [startFreshSession]);

  const value = useMemo<SessionContextValue>(
    () => ({ token, expiresAt, status, error, restartSession }),
    [token, expiresAt, status, error, restartSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used within SessionProvider");
  return context;
};
