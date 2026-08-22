import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  Loader2,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import apiService from '@/services/apiService';

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
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  results_summary?: ResultsSummary | null;
  error_message?: string | null;
  created_at: string;
}

interface MetricGroup {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1_score?: number;
  roc_auc?: number;
  r2_score?: number;
  mae?: number;
  rmse?: number;
  mse?: number;
}

interface Metrics extends MetricGroup {
  train?: MetricGroup;
  test?: MetricGroup;
}

interface FeatureImportance {
  features: string[];
  importance: number[];
}

interface ConfusionMatrix {
  matrix: number[][];
  labels: string[];
}

interface AppliedRule {
  parameter: string;
  original_value: unknown;
  value: unknown;
  reason: string;
}

interface HyperparameterTuning {
  enabled?: boolean;
  engine?: string;
  method?: string;
  rules_evaluated?: number;
  rules_applied?: number;
  cv_strategy?: string;
  test_score?: number;
  best_params?: Record<string, unknown>;
  applied_rules?: AppliedRule[];
  dataset_info?: {
    n_samples?: number;
    n_features?: number;
  };
}

interface ModelResult {
  model_type: string;
  display_name: string;
  metrics?: Metrics;
  feature_importance?: FeatureImportance;
  confusion_matrix?: ConfusionMatrix;
  hyperparameter_tuning?: HyperparameterTuning;
  error?: string;
}

interface RunDetails {
  id: string;
  run_number: number;
  status: RunListItem['status'];
  config_snapshot?: Record<string, unknown>;
  results: {
    task_type?: 'classification' | 'regression';
    models?: ModelResult[];
    best_model?: BestModel;
    summary?: ResultsSummary;
  };
  error_message?: string | null;
  created_at: string;
}

interface RunsResponse {
  runs?: RunListItem[];
  total_pages?: number;
}

const messageFromError = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const formatDuration = (seconds?: number | null) => {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

const statusBadge = (status: RunListItem['status']) => {
  if (status === 'completed') return <Badge className="bg-success/15 text-success hover:bg-success/20">Completed</Badge>;
  if (status === 'running') return <Badge className="bg-primary-blue/15 text-primary-blue hover:bg-primary-blue/20">Running</Badge>;
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (status === 'cancelled') return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
};

const metricValue = (metrics: Metrics | undefined, task: 'classification' | 'regression') => {
  if (!metrics) return null;
  if (task === 'classification') return metrics.test?.accuracy ?? metrics.accuracy ?? null;
  return metrics.test?.r2_score ?? metrics.r2_score ?? null;
};

const ModelAnalysis = ({ model, taskType, isBest }: { model: ModelResult; taskType: 'classification' | 'regression'; isBest: boolean }) => {
  const test = model.metrics?.test ?? model.metrics;
  const train = model.metrics?.train;
  const score = metricValue(model.metrics, taskType);

  const featureData = useMemo(
    () =>
      (model.feature_importance?.features ?? []).slice(0, 10).map((feature, index) => ({
        feature: feature.length > 22 ? `${feature.slice(0, 19)}…` : feature,
        importance: model.feature_importance?.importance[index] ?? 0,
      })),
    [model.feature_importance],
  );

  return (
    <Card className="overflow-hidden border-border/70 bg-card/55">
      <CardHeader className="border-b border-border/60 bg-card/50">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{model.display_name || model.model_type}</CardTitle>
              {isBest && (
                <Badge className="bg-warning/15 text-warning hover:bg-warning/20">
                  <Trophy className="mr-1 h-3 w-3" /> Best model
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{model.model_type}</p>
          </div>
          {model.error ? <Badge variant="destructive">Training failed</Badge> : score != null ? <div className="text-right"><div className="text-2xl font-bold">{score.toFixed(4)}</div><div className="text-xs text-muted-foreground">{taskType === 'classification' ? 'test accuracy' : 'test R²'}</div></div> : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-4 sm:p-6">
        {model.error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{model.error}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(taskType === 'classification'
                ? [
                    ['Accuracy', test?.accuracy ?? model.metrics?.accuracy],
                    ['Precision', test?.precision ?? model.metrics?.precision],
                    ['Recall', test?.recall ?? model.metrics?.recall],
                    ['F1 score', test?.f1_score ?? model.metrics?.f1_score],
                  ]
                : [
                    ['R²', test?.r2_score ?? model.metrics?.r2_score],
                    ['MAE', test?.mae ?? model.metrics?.mae],
                    ['RMSE', test?.rmse ?? model.metrics?.rmse],
                    ['MSE', test?.mse ?? model.metrics?.mse],
                  ]
              ).map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-border/60 bg-background/35 p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 text-lg font-semibold">{typeof value === 'number' ? value.toFixed(4) : '—'}</div>
                </div>
              ))}
            </div>

            {train && score != null && (
              <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-success" /> Generalization check
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="text-sm text-muted-foreground">Train score <span className="ml-2 font-semibold text-foreground">{(taskType === 'classification' ? train.accuracy : train.r2_score)?.toFixed(4) ?? '—'}</span></div>
                  <div className="text-sm text-muted-foreground">Test score <span className="ml-2 font-semibold text-foreground">{score.toFixed(4)}</span></div>
                </div>
              </div>
            )}

            {model.hyperparameter_tuning?.enabled && (
              <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Sparkles className="h-4 w-4 text-primary" /></div>
                  <div>
                    <div className="font-semibold">Expert optimization</div>
                    <div className="text-xs text-muted-foreground">{model.hyperparameter_tuning.engine || 'NoCodeML rules engine'} · {model.hyperparameter_tuning.cv_strategy || model.hyperparameter_tuning.method || 'configured strategy'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><div className="text-xs text-muted-foreground">Rules evaluated</div><div className="font-semibold">{model.hyperparameter_tuning.rules_evaluated ?? model.hyperparameter_tuning.applied_rules?.length ?? 0}</div></div>
                  <div><div className="text-xs text-muted-foreground">Rules applied</div><div className="font-semibold">{model.hyperparameter_tuning.rules_applied ?? 0}</div></div>
                  <div><div className="text-xs text-muted-foreground">Samples</div><div className="font-semibold">{model.hyperparameter_tuning.dataset_info?.n_samples?.toLocaleString() ?? '—'}</div></div>
                  <div><div className="text-xs text-muted-foreground">Features</div><div className="font-semibold">{model.hyperparameter_tuning.dataset_info?.n_features ?? '—'}</div></div>
                </div>

                {model.hyperparameter_tuning.applied_rules && model.hyperparameter_tuning.applied_rules.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <Table>
                      <TableHeader><TableRow><TableHead>Parameter</TableHead><TableHead>Before</TableHead><TableHead>After</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {model.hyperparameter_tuning.applied_rules.map((rule, index) => (
                          <TableRow key={`${rule.parameter}-${index}`}>
                            <TableCell className="font-mono text-xs text-primary">{rule.parameter}</TableCell>
                            <TableCell className="text-xs">{String(rule.original_value)}</TableCell>
                            <TableCell className="text-xs font-medium text-success">{String(rule.value)}</TableCell>
                            <TableCell className="min-w-[220px] text-xs text-muted-foreground">{rule.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {model.hyperparameter_tuning.best_params && (
                  <details className="rounded-xl border border-border/60 bg-background/30 p-3">
                    <summary className="cursor-pointer text-sm font-medium">Final hyperparameters</summary>
                    <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(model.hyperparameter_tuning.best_params, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {taskType === 'classification' && model.confusion_matrix && (
                <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-medium"><Info className="h-4 w-4 text-primary-blue" /> Confusion matrix</div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead><tr><th className="p-2" />{model.confusion_matrix.labels.map((label) => <th key={label} className="border border-border/60 p-2 text-muted-foreground">Pred {label}</th>)}</tr></thead>
                      <tbody>
                        {model.confusion_matrix.matrix.map((row, rowIndex) => (
                          <tr key={model.confusion_matrix?.labels[rowIndex] ?? rowIndex}>
                            <th className="border border-border/60 p-2 text-muted-foreground">Actual {model.confusion_matrix?.labels[rowIndex] ?? rowIndex}</th>
                            {row.map((value, columnIndex) => <td key={`${rowIndex}-${columnIndex}`} className={`border border-border/60 p-2 text-center font-semibold ${rowIndex === columnIndex ? 'bg-success/10 text-success' : value ? 'bg-destructive/10 text-destructive' : ''}`}>{value}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {featureData.length > 0 && (
                <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
                  <div className="mb-3 font-medium">Feature importance</div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={featureData} layout="vertical" margin={{ left: 35, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="feature" width={100} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                        <Bar dataKey="importance" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
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
      setError(messageFromError(fetchError, 'Failed to load training runs.'));
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
      if (!detail?.results) throw new Error('This run does not contain results yet.');
      setSelectedRun(detail);
    } catch (detailError: unknown) {
      setError(messageFromError(detailError, 'Failed to load run details.'));
    } finally {
      setDetailsLoading(null);
    }
  };

  if (selectedRun) {
    const taskType = selectedRun.results.task_type ?? ((selectedRun.config_snapshot?.taskType as 'classification' | 'regression' | undefined) ?? 'classification');
    const models = selectedRun.results.models ?? [];
    const summary = selectedRun.results.summary;

    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => setSelectedRun(null)}><ArrowLeft className="mr-1 h-4 w-4" /> All runs</Button>
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">Run #{selectedRun.run_number}</h2>{statusBadge(selectedRun.status)}</div>
            <p className="mt-1 text-sm text-muted-foreground">{new Date(selectedRun.created_at).toLocaleString()}</p>
          </div>
          {selectedRun.results.best_model && <div className="rounded-2xl border border-warning/25 bg-warning/[0.06] px-4 py-3"><div className="text-xs text-muted-foreground">Best candidate</div><div className="font-semibold text-warning">{selectedRun.results.best_model.display_name}</div><div className="text-xs text-muted-foreground">{selectedRun.results.best_model.metric}: {selectedRun.results.best_model.value.toFixed(4)}</div></div>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border/60 bg-card/45 p-4"><div className="text-xs text-muted-foreground">Models</div><div className="mt-1 text-2xl font-bold">{summary?.total_models ?? models.length}</div></div>
          <div className="rounded-2xl border border-border/60 bg-card/45 p-4"><div className="text-xs text-muted-foreground">Successful</div><div className="mt-1 text-2xl font-bold text-success">{summary?.successful ?? models.filter((model) => !model.error).length}</div></div>
          <div className="rounded-2xl border border-border/60 bg-card/45 p-4"><div className="text-xs text-muted-foreground">Failed</div><div className="mt-1 text-2xl font-bold text-destructive">{summary?.failed ?? models.filter((model) => model.error).length}</div></div>
        </div>

        {models.length ? models.map((model) => <ModelAnalysis key={model.model_type} model={model} taskType={taskType} isBest={selectedRun.results.best_model?.model_type === model.model_type} />) : <Card><CardContent className="py-10 text-center text-muted-foreground">No model results are available for this run.</CardContent></Card>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-2xl font-bold">Training runs</h2><p className="mt-1 text-sm text-muted-foreground">Compare every experiment run without losing the configuration that produced it.</p></div>
        <Button variant="outline" onClick={onBack}>Back to training</Button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{error}</div><Button size="sm" variant="outline" onClick={() => void fetchRuns()}>Retry</Button></div>}

      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : runs.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center"><Sparkles className="mx-auto mb-3 h-6 w-6 text-primary" /><div className="font-medium">No training runs yet</div><p className="mt-1 text-sm text-muted-foreground">Complete model configuration and start a run to see comparisons here.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run.id} className="border-border/60 bg-card/45 transition-colors hover:border-primary/25">
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-semibold text-primary">#{run.run_number}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{new Date(run.created_at).toLocaleString()}</span>{statusBadge(run.status)}</div><div className="mt-1 text-xs text-muted-foreground">Duration {formatDuration(run.duration_seconds)}{run.results_summary?.best_model ? ` · Best: ${run.results_summary.best_model.display_name}` : ''}</div></div></div>
                <Button size="sm" variant="outline" onClick={() => void openRun(run.id)} disabled={detailsLoading === run.id}>{detailsLoading === run.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}View results</Button>
              </CardContent>
            </Card>
          ))}

          {totalPages > 1 && <div className="flex items-center justify-center gap-3 pt-2"><Button size="icon" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span><Button size="icon" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button></div>}
        </div>
      )}
    </div>
  );
};

export default ResultsStep;
