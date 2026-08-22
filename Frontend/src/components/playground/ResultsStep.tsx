import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  Sparkles,
} from "lucide-react";

import RunModelAnalysis, { type ModelResult } from "@/components/playground/RunModelAnalysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import apiService from "@/services/apiService";

interface ResultsStepProps {
  experimentId: string;
  onBack: () => void;
}

interface BestModel {
  model_type: string;
  display_name: string;
  metric: string;
  value: number;
}

interface ResultsSummary {
  total_models?: number;
  successful?: number;
  failed?: number;
  best_model?: BestModel;
}

interface RunListItem {
  id: string;
  run_number: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  results_summary?: ResultsSummary | null;
  error_message?: string | null;
  created_at: string;
}

interface RunDetails {
  id: string;
  run_number: number;
  status: RunListItem["status"];
  config_snapshot?: Record<string, unknown>;
  results: {
    task_type?: "classification" | "regression";
    models?: ModelResult[];
    best_model?: BestModel;
    summary?: ResultsSummary;
    training_config?: Record<string, unknown>;
    dataset_info?: Record<string, unknown> | null;
  };
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  created_at: string;
}

interface RunsResponse {
  runs?: RunListItem[];
  total_pages?: number;
}

const messageFromError = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

const statusBadge = (status: RunListItem["status"]) => {
  if (status === "completed") return <Badge className="bg-success/15 text-success hover:bg-success/20">Completed</Badge>;
  if (status === "running") return <Badge className="bg-primary-blue/15 text-primary-blue hover:bg-primary-blue/20">Running</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
};

const ResultsStep = ({ experimentId, onBack }: ResultsStepProps) => {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = (await apiService.training.listRuns(experimentId, page, 10)) as RunsResponse;
      setRuns(response.runs ?? []);
      setTotalPages(Math.max(1, response.total_pages ?? 1));
    } catch (fetchError: unknown) {
      setError(messageFromError(fetchError, "Failed to load training runs."));
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [experimentId, page]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  const openRun = async (runId: string) => {
    try {
      setDetailsLoading(runId);
      setError(null);
      const detail = (await apiService.training.getRunDetails(runId)) as RunDetails;
      if (!detail?.results) throw new Error("This run does not contain results yet.");
      setSelectedRun(detail);
    } catch (detailError: unknown) {
      setError(messageFromError(detailError, "Failed to load run details."));
    } finally {
      setDetailsLoading(null);
    }
  };

  const downloadRunReport = (run: RunDetails) => {
    const models = run.results.models ?? [];
    const sanitizedModels = models.map((model) => ({
      model_type: model.model_type,
      display_name: model.display_name,
      metrics: model.metrics,
      feature_importance: model.feature_importance,
      confusion_matrix: model.confusion_matrix,
      hyperparameters: model.hyperparameters,
      hyperparameter_tuning: model.hyperparameter_tuning,
      error: model.error,
    }));

    const report = {
      report_format: "nocodeml-run-report-v3",
      exported_at: new Date().toISOString(),
      experiment_id: experimentId,
      run: {
        id: run.id,
        run_number: run.run_number,
        status: run.status,
        created_at: run.created_at,
        started_at: run.started_at,
        completed_at: run.completed_at,
        duration_seconds: run.duration_seconds,
        error_message: run.error_message,
        config_snapshot: run.config_snapshot ?? {},
        results: {
          task_type: run.results.task_type,
          best_model: run.results.best_model,
          summary: run.results.summary,
          training_config: run.results.training_config,
          dataset_info: run.results.dataset_info,
          models: sanitizedModels,
        },
      },
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nocodeml-run-${run.run_number}-report.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (selectedRun) {
    const taskType = selectedRun.results.task_type ?? ((selectedRun.config_snapshot?.taskType as "classification" | "regression" | undefined) ?? "classification");
    const models = selectedRun.results.models ?? [];
    const summary = selectedRun.results.summary;

    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => setSelectedRun(null)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> All runs
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold">Run #{selectedRun.run_number}</h2>
              {statusBadge(selectedRun.status)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(selectedRun.created_at).toLocaleString()} · {formatDuration(selectedRun.duration_seconds)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {selectedRun.results.best_model && (
              <div className="rounded-2xl border border-warning/25 bg-warning/[0.06] px-4 py-3 sm:text-right">
                <div className="text-xs text-muted-foreground">Best candidate</div>
                <div className="font-semibold text-warning">{selectedRun.results.best_model.display_name}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedRun.results.best_model.metric}: {selectedRun.results.best_model.value.toFixed(4)}
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadRunReport(selectedRun)}>
              <Download className="h-4 w-4" /> Export run report
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border/60 bg-card/45 p-3 sm:p-4"><div className="text-xs text-muted-foreground">Models</div><div className="mt-1 text-xl font-bold sm:text-2xl">{summary?.total_models ?? models.length}</div></div>
          <div className="rounded-2xl border border-border/60 bg-card/45 p-3 sm:p-4"><div className="text-xs text-muted-foreground">Successful</div><div className="mt-1 text-xl font-bold text-success sm:text-2xl">{summary?.successful ?? models.filter((model) => !model.error).length}</div></div>
          <div className="rounded-2xl border border-border/60 bg-card/45 p-3 sm:p-4"><div className="text-xs text-muted-foreground">Failed</div><div className="mt-1 text-xl font-bold text-destructive sm:text-2xl">{summary?.failed ?? models.filter((model) => model.error).length}</div></div>
        </div>

        {selectedRun.error_message && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{selectedRun.error_message}</div>
        )}

        {models.length ? (
          models.map((model) => (
            <RunModelAnalysis
              key={model.model_type}
              model={model}
              taskType={taskType}
              isBest={selectedRun.results.best_model?.model_type === model.model_type}
            />
          ))
        ) : (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No model results are available for this run.</CardContent></Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Training runs</h2>
          <p className="mt-1 text-sm text-muted-foreground">Compare runs without losing the configuration that produced them. Open any run to export its reproducibility report.</p>
        </div>
        <Button variant="outline" onClick={onBack}>Back to training</Button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{error}</div>
          <Button size="sm" variant="outline" onClick={() => void fetchRuns()}>Retry</Button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : runs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Sparkles className="mx-auto mb-3 h-6 w-6 text-primary" />
            <div className="font-medium">No training runs yet</div>
            <p className="mt-1 text-sm text-muted-foreground">Complete model configuration and start a run to see comparisons here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run.id} className="border-border/60 bg-card/45 transition-colors hover:border-primary/25">
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary">#{run.run_number}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{new Date(run.created_at).toLocaleString()}</span>{statusBadge(run.status)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Duration {formatDuration(run.duration_seconds)}{run.results_summary?.best_model ? ` · Best: ${run.results_summary.best_model.display_name}` : ""}</div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void openRun(run.id)} disabled={detailsLoading === run.id}>
                  {detailsLoading === run.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                  View results
                </Button>
              </CardContent>
            </Card>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="icon" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button size="icon" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultsStep;
