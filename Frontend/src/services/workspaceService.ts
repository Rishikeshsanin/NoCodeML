import {
  API_BASE_URL,
  TemporarySessionError,
  getStoredSessionToken,
  removeStoredSessionToken,
} from "@/services/sessionService";

export class WorkspaceApiError extends Error {
  statusCode?: number;
  code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = "WorkspaceApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const requireSession = () => {
  const token = getStoredSessionToken();
  if (!token) {
    throw new TemporarySessionError("Your temporary workspace is still starting. Please try again.", 428, "SESSION_REQUIRED");
  }
  return token;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = requireSession();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-NoCodeML-Session", token);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  let payload: { detail?: string | { code?: string; message?: string } } | undefined;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  const detail = payload?.detail;
  const code = typeof detail === "object" ? detail?.code : undefined;
  const message = typeof detail === "string"
    ? detail
    : detail?.message || "NoCodeML couldn't complete that workspace action.";

  if (response.status === 410 || code === "SESSION_EXPIRED") {
    removeStoredSessionToken();
  }

  throw new WorkspaceApiError(message, response.status, code);
};

export interface WorkspaceDataset {
  id: string;
  name: string;
  description?: string | null;
  original_filename: string;
  file_size_bytes: number;
  row_count: number;
  column_count: number;
  column_info: unknown;
  created_at: number | string;
  temporary: true;
}

export interface WorkspaceDatasetPreview {
  columns: string[];
  data: unknown[][];
  row_count: number;
  preview_rows: number;
}

export const workspaceDatasetAPI = {
  upload: async (file: File, name?: string, description?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    if (description) form.append("description", description);
    const response = await request<{ dataset: WorkspaceDataset }>("/api/v1/workspace/datasets", {
      method: "POST",
      body: form,
    });
    return response.dataset;
  },

  list: async () => {
    const response = await request<{ datasets: WorkspaceDataset[]; total: number }>("/api/v1/workspace/datasets");
    return response.datasets;
  },

  get: async (datasetId: string) => {
    const response = await request<{ dataset: WorkspaceDataset }>(`/api/v1/workspace/datasets/${datasetId}`);
    return response.dataset;
  },

  preview: (datasetId: string, rows = 10) =>
    request<WorkspaceDatasetPreview>(`/api/v1/workspace/datasets/${datasetId}/preview?rows=${rows}`),

  update: async (datasetId: string, data: { name: string; description?: string | null }) => {
    const response = await request<{ dataset: WorkspaceDataset }>(`/api/v1/workspace/datasets/${datasetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return response.dataset;
  },

  delete: (datasetId: string) =>
    request<void>(`/api/v1/workspace/datasets/${datasetId}`, { method: "DELETE" }),
};
