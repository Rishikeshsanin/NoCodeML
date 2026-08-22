import type { EDAResponse } from "@/types/experiment";
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

const errorFromResponse = async (response: Response) => {
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

  if (response.status === 410 || code === "SESSION_EXPIRED") removeStoredSessionToken();
  return new WorkspaceApiError(message, response.status, code);
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
  throw await errorFromResponse(response);
};

const parseDownloadName = (response: Response, fallback: string) => {
  const disposition = response.headers.get("content-disposition") || "";
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8.replace(/^"|"$/g, "")); } catch { /* fall through */ }
  }
  const basic = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return basic || fallback;
};

const download = async (path: string, fallbackFilename: string) => {
  const token = requireSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "X-NoCodeML-Session": token },
  });
  if (!response.ok) throw await errorFromResponse(response);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = parseDownloadName(response, fallbackFilename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return anchor.download;
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

export interface WorkspacePlotRequest {
  plot_type: "histogram" | "scatter" | "box" | "correlation" | "bar";
  x_column: string;
  y_column?: string | null;
  group_by?: string | null;
}

export interface WorkspacePlotResponse {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
  is_sampled: boolean;
  total_rows: number;
  displayed_rows: number;
  plot_type: string;
}

export interface WorkspaceTrainingModel {
  model_type: string;
  hyperparameters?: Record<string, unknown>;
  enable_optimization?: boolean;
}

export interface WorkspaceTrainingRequest {
  dataset_id: string;
  target_column: string;
  task_type: "classification" | "regression";
  selected_features?: string[] | null;
  models: WorkspaceTrainingModel[];
  test_size?: number;
  random_state?: number;
  cv_folds?: number;
  scaling?: boolean;
}

export interface WorkspaceTrainingRun {
  id: string;
  dataset_id: string;
  dataset_name: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: {
    current: number;
    total: number;
    percent: number;
    current_model?: string | null;
    message: string;
  };
  config: Record<string, unknown>;
  results: Array<Record<string, unknown>>;
  best_model?: Record<string, unknown> | null;
  error?: { code?: string; message?: string } | null;
  created_at: number;
  updated_at?: number;
  started_at?: number;
  completed_at?: number;
  temporary: true;
}

export interface WorkspacePrediction {
  id: string;
  run_id: string;
  dataset_id?: string;
  dataset_name: string;
  model_type?: string;
  download_filename: string;
  download_url: string;
  total_predictions: number;
  created_at: number;
  temporary: true;
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

  delete: (datasetId: string) => request<void>(`/api/v1/workspace/datasets/${datasetId}`, { method: "DELETE" }),
};

export const workspaceEDAAPI = {
  summary: (datasetId: string) => request<EDAResponse>(`/api/v1/workspace/datasets/${datasetId}/eda`),
  plot: (datasetId: string, payload: WorkspacePlotRequest) =>
    request<WorkspacePlotResponse>(`/api/v1/workspace/datasets/${datasetId}/plot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  downloadSummary: (datasetId: string) => download(`/api/v1/workspace/datasets/${datasetId}/export/summary`, "nocodeml_eda-summary.json"),
  downloadStatistics: (datasetId: string) => download(`/api/v1/workspace/datasets/${datasetId}/export/statistics`, "nocodeml_statistics.csv"),
  downloadMissingValues: (datasetId: string) => download(`/api/v1/workspace/datasets/${datasetId}/export/missing-values`, "nocodeml_missing-values.csv"),
  downloadCorrelations: (datasetId: string) => download(`/api/v1/workspace/datasets/${datasetId}/export/correlations`, "nocodeml_correlations.csv"),
};

export const workspaceTrainingAPI = {
  start: (payload: WorkspaceTrainingRequest) =>
    request<WorkspaceTrainingRun>("/api/v1/workspace/training/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  get: (runId: string) => request<WorkspaceTrainingRun>(`/api/v1/workspace/training/runs/${runId}`),
  list: async () => {
    const response = await request<{ runs: WorkspaceTrainingRun[]; total: number }>("/api/v1/workspace/training/runs");
    return response.runs;
  },
  downloadSummary: (runId: string) => download(`/api/v1/workspace/training/runs/${runId}/export/summary`, "nocodeml_training-summary.json"),
  downloadComparison: (runId: string) => download(`/api/v1/workspace/training/runs/${runId}/export/model-comparison`, "nocodeml_model-comparison.csv"),
  downloadFeatureImportance: (runId: string) => download(`/api/v1/workspace/training/runs/${runId}/export/feature-importance`, "nocodeml_feature-importance.csv"),
  downloadBestModel: (runId: string) => download(`/api/v1/workspace/training/runs/${runId}/export/best-model`, "nocodeml_best-model.joblib"),
  predict: (runId: string, features: Record<string, unknown>) =>
    request<{
      prediction: unknown;
      probabilities?: Record<string, number> | null;
      confidence?: number | null;
      model_type?: string;
      run_id: string;
      temporary: true;
    }>(`/api/v1/workspace/training/runs/${runId}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    }),
  predictBatch: (runId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<WorkspacePrediction>(`/api/v1/workspace/training/runs/${runId}/predict/batch`, {
      method: "POST",
      body: form,
    });
  },
};

export const workspacePredictionAPI = {
  list: async () => {
    const response = await request<{ predictions: WorkspacePrediction[]; total: number }>("/api/v1/workspace/predictions");
    return response.predictions;
  },
  download: (prediction: WorkspacePrediction) => download(prediction.download_url, prediction.download_filename),
};

export const workspaceExportAPI = {
  downloadSession: () => download("/api/v1/workspace/export/session", "nocodeml_session.zip"),
};
