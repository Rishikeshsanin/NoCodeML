import { useMemo } from "react";
import { CheckCircle2, Info, Sparkles, Trophy } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface MetricGroup {
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

export interface Metrics extends MetricGroup {
  train?: MetricGroup;
  test?: MetricGroup;
}

export interface ModelResult {
  model_type: string;
  display_name: string;
  metrics?: Metrics;
  feature_importance?: { features: string[]; importance: number[] };
  confusion_matrix?: { matrix: number[][]; labels: string[] };
  hyperparameters?: Record<string, unknown>;
  hyperparameter_tuning?: {
    enabled?: boolean;
    engine?: string;
    method?: string;
    rules_evaluated?: number;
    rules_applied?: number;
    cv_strategy?: string;
    test_score?: number;
    best_params?: Record<string, unknown>;
    applied_rules?: Array<{
      parameter: string;
      original_value: unknown;
      value: unknown;
      reason: string;
    }>;
    dataset_info?: { n_samples?: number; n_features?: number };
  };
  error?: string;
}

const metricValue = (metrics: Metrics | undefined, task: "classification" | "regression") => {
  if (!metrics) return null;
  if (task === "classification") return metrics.test?.accuracy ?? metrics.accuracy ?? null;
  return metrics.test?.r2_score ?? metrics.r2_score ?? null;
};

const RunModelAnalysis = ({
  model,
  taskType,
  isBest,
}: {
  model: ModelResult;
  taskType: "classification" | "regression";
  isBest: boolean;
}) => {
  const test = model.metrics?.test ?? model.metrics;
  const train = model.metrics?.train;
  const score = metricValue(model.metrics, taskType);

  const featureData = useMemo(
    () =>
      (model.feature_importance?.features ?? []).slice(0, 10).map((feature, index) => ({
        feature: feature.length > 26 ? `${feature.slice(0, 23)}…` : feature,
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
          {model.error ? (
            <Badge variant="destructive">Training failed</Badge>
          ) : score != null ? (
            <div className="text-left sm:text-right">
              <div className="text-2xl font-bold">{score.toFixed(4)}</div>
              <div className="text-xs text-muted-foreground">{taskType === "classification" ? "test accuracy" : "test R²"}</div>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-4 sm:p-6">
        {model.error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{model.error}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(taskType === "classification"
                ? [
                    ["Accuracy", test?.accuracy ?? model.metrics?.accuracy],
                    ["Precision", test?.precision ?? model.metrics?.precision],
                    ["Recall", test?.recall ?? model.metrics?.recall],
                    ["F1 score", test?.f1_score ?? model.metrics?.f1_score],
                  ]
                : [
                    ["R²", test?.r2_score ?? model.metrics?.r2_score],
                    ["MAE", test?.mae ?? model.metrics?.mae],
                    ["RMSE", test?.rmse ?? model.metrics?.rmse],
                    ["MSE", test?.mse ?? model.metrics?.mse],
                  ]
              ).map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-border/60 bg-background/35 p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 text-lg font-semibold">{typeof value === "number" ? value.toFixed(4) : "—"}</div>
                </div>
              ))}
            </div>

            {train && score != null && (
              <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-success" /> Generalization check
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="text-sm text-muted-foreground">
                    Train score
                    <span className="ml-2 font-semibold text-foreground">{(taskType === "classification" ? train.accuracy : train.r2_score)?.toFixed(4) ?? "—"}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Test score <span className="ml-2 font-semibold text-foreground">{score.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            )}

            {model.hyperparameter_tuning?.enabled && (
              <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">Expert optimization</div>
                    <div className="text-xs text-muted-foreground">
                      {model.hyperparameter_tuning.engine || "NoCodeML rules engine"} · {model.hyperparameter_tuning.cv_strategy || model.hyperparameter_tuning.method || "configured strategy"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><div className="text-xs text-muted-foreground">Rules evaluated</div><div className="font-semibold">{model.hyperparameter_tuning.rules_evaluated ?? model.hyperparameter_tuning.applied_rules?.length ?? 0}</div></div>
                  <div><div className="text-xs text-muted-foreground">Rules applied</div><div className="font-semibold">{model.hyperparameter_tuning.rules_applied ?? 0}</div></div>
                  <div><div className="text-xs text-muted-foreground">Samples</div><div className="font-semibold">{model.hyperparameter_tuning.dataset_info?.n_samples?.toLocaleString() ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Features</div><div className="font-semibold">{model.hyperparameter_tuning.dataset_info?.n_features ?? "—"}</div></div>
                </div>

                {model.hyperparameter_tuning.applied_rules?.length ? (
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
                ) : null}

                {(model.hyperparameter_tuning.best_params || model.hyperparameters) && (
                  <details className="rounded-xl border border-border/60 bg-background/30 p-3">
                    <summary className="cursor-pointer text-sm font-medium">Final hyperparameters</summary>
                    <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">{JSON.stringify(model.hyperparameter_tuning.best_params || model.hyperparameters, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {taskType === "classification" && model.confusion_matrix && (
                <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
                  <div className="mb-3 flex items-center gap-2 font-medium"><Info className="h-4 w-4 text-primary-blue" /> Confusion matrix</div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead><tr><th className="p-2" />{model.confusion_matrix.labels.map((label) => <th key={label} className="border border-border/60 p-2 text-muted-foreground">Pred {label}</th>)}</tr></thead>
                      <tbody>
                        {model.confusion_matrix.matrix.map((row, rowIndex) => (
                          <tr key={model.confusion_matrix?.labels[rowIndex] ?? rowIndex}>
                            <th className="border border-border/60 p-2 text-muted-foreground">Actual {model.confusion_matrix?.labels[rowIndex] ?? rowIndex}</th>
                            {row.map((value, columnIndex) => (
                              <td key={`${rowIndex}-${columnIndex}`} className={`border border-border/60 p-2 text-center font-semibold ${rowIndex === columnIndex ? "bg-success/10 text-success" : value ? "bg-destructive/10 text-destructive" : ""}`}>{value}</td>
                            ))}
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
                        <YAxis type="category" dataKey="feature" width={110} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
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

export default RunModelAnalysis;
