const SESSION_STORAGE_KEY = "nocodeml_temporary_session";

const rawApiUrl = import.meta.env.VITE_API_URL;
const API_BASE_URL = rawApiUrl && /^https?:\/\//i.test(rawApiUrl.trim())
  ? rawApiUrl.trim().replace(/\/$/, "")
  : "http://localhost:8000";

export interface TemporarySession {
  session_token: string;
  expires_at: number;
  ttl_seconds: number;
  close_grace_seconds?: number;
  temporary: boolean;
  privacy?: string;
  status?: string;
}

export class TemporarySessionError extends Error {
  statusCode?: number;
  code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = "TemporarySessionError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  let payload: { detail?: { code?: string; message?: string } | string } | undefined;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  const detail = payload?.detail;
  const message = typeof detail === "string"
    ? detail
    : detail?.message || "The temporary NoCodeML workspace is unavailable.";
  const code = typeof detail === "object" ? detail?.code : undefined;
  throw new TemporarySessionError(message, response.status, code);
};

export const getStoredSessionToken = () => sessionStorage.getItem(SESSION_STORAGE_KEY);

export const storeSessionToken = (token: string) => {
  sessionStorage.setItem(SESSION_STORAGE_KEY, token);
};

export const removeStoredSessionToken = () => {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
};

export const createTemporarySession = async (): Promise<TemporarySession> => {
  const response = await fetch(`${API_BASE_URL}/api/v1/session`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  return parseResponse<TemporarySession>(response);
};

export const getTemporarySession = async (token: string): Promise<TemporarySession> => {
  const response = await fetch(`${API_BASE_URL}/api/v1/session`, {
    headers: {
      Accept: "application/json",
      "X-NoCodeML-Session": token,
    },
  });
  return parseResponse<TemporarySession>(response);
};

export const heartbeatTemporarySession = async (token: string): Promise<TemporarySession> => {
  const response = await fetch(`${API_BASE_URL}/api/v1/session/heartbeat`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-NoCodeML-Session": token,
    },
  });
  return parseResponse<TemporarySession>(response);
};

export const clearTemporarySession = async (token: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/v1/session`, {
    method: "DELETE",
    headers: { "X-NoCodeML-Session": token },
  });
  await parseResponse<void>(response);
};

export const markTemporarySessionClosing = (token: string) => {
  const body = JSON.stringify({ session_token: token });
  const blob = new Blob([body], { type: "application/json" });
  return navigator.sendBeacon(`${API_BASE_URL}/api/v1/session/end`, blob);
};

export { API_BASE_URL, SESSION_STORAGE_KEY };
