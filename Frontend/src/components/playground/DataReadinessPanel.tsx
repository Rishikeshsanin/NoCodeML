import { AlertTriangle, CheckCircle2, Database, Sparkles, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EDAResponse } from "@/types/experiment";

interface DataReadinessPanelProps {
  edaData: EDAResponse;
}

type TaskType = "classification" | "regression";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const DataReadinessPanel = ({ edaData }: DataReadinessPanelProps) => {
  const rows = edaData.dataset_info.row_count || 0;
  const columns = edaData.columns || [];
  const missingPercent = edaData.missing_data_summary?.missing_percent || 0;
  const constantColumns = columns.filter((column) => column.unique_count <= 1);
  const highMissingColumns = columns.filter((column) => column.missing_percent >= 40);
  const categoricalSet = new Set(edaData.categorical_columns || []);
  const numericSet = new Set(edaData.numeric_columns || []);
  const idSet = new Set(edaData.id_columns || []);
  const highCardinalityCategoricals = columns.filter(
    (column) =>
      categoricalSet.has(column.name) &&
      !idSet.has(column.name) &&
      column.unique_count > Math.max(50, Math.floor(rows * 0.5)),
  );

  const sizePenalty = rows < 50 ? 25 : rows < 200 ? 12 : rows < 500 ? 5 : 0;
  const missingPenalty = Math.min(35, missingPercent * 0.55);
  const constantPenalty = Math.min(18, constantColumns.length * 6);
  const highMissingPenalty = Math.min(15, highMissingColumns.length * 4);
  const cardinalityPenalty = Math.min(10, highCardinalityCategoricals.length * 3);
  const score = Math.round(
    clamp(100 - sizePenalty - missingPenalty - constantPenalty - highMissingPenalty - cardinalityPenalty, 0, 100),
  );

  const readiness =
    score >= 85
      ? { label: "Ready", detail: "Strong starting point for model training." }
      : score >= 70
        ? { label: "Good", detail: "Usable now, with a few things worth reviewing." }
        : score >= 50
          ? { label: "Needs review", detail: "Training is possible, but data quality may limit results." }
          : { label: "High risk", detail: "Resolve the highlighted data issues before trusting model results." };

  const classificationThreshold = Math.max(20, Math.floor(rows * 0.05));
  const targetHints = [
    "target",
    "label",
    "outcome",
    "class",
    "churn",
    "survived",
    "fraud",
    "default",
    "price",
    "sales",
    "revenue",
    "score",
    "rating",
  ];

  const targetCandidates = columns
    .filter(
      (column) =>
        !idSet.has(column.name) &&
        column.unique_count > 1 &&
        column.missing_percent < 50,
    )
    .map((column, index) => {
      const lowerName = column.name.toLowerCase();
      const nameHint = targetHints.some((hint) => lowerName === hint || lowerName.includes(hint));
      const numericLowCardinality =
        numericSet.has(column.name) && column.unique_count <= classificationThreshold;
      const task: TaskType =
        categoricalSet.has(column.name) || numericLowCardinality ? "classification" : "regression";
      let candidateScore = nameHint ? 12 : 0;
      candidateScore += column.missing_percent === 0 ? 3 : column.missing_percent < 10 ? 2 : 0;
      candidateScore += categoricalSet.has(column.name) && column.unique_count <= 20 ? 4 : 0;
      candidateScore += numericLowCardinality ? 3 : 0;
      candidateScore += index === columns.length - 1 ? 2 : 0;
      return { column: column.name, task, score: candidateScore };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const recommendations: string[] = [];
  if (rows < 200) recommendations.push("The dataset is small; prefer simpler models and treat test metrics cautiously.");
  if (missingPercent >= 10) recommendations.push(`${missingPercent.toFixed(1)}% of cells are missing; review imputation before interpreting results.`);
  if (highMissingColumns.length) recommendations.push(`${highMissingColumns.length} column(s) are at least 40% missing and may be better excluded.`);
  if (constantColumns.length) recommendations.push(`${constantColumns.length} constant column(s) contain no predictive signal.`);
  if (highCardinalityCategoricals.length) recommendations.push(`${highCardinalityCategoricals.length} categorical column(s) have very high cardinality and may overfit.`);
  if (idSet.size) recommendations.push(`${idSet.size} likely ID column(s) were detected and will be excluded from recommended features.`);
  if (!recommendations.length) recommendations.push("No major readiness issues were detected. You can move on to model configuration.");

  return (
    <Card className="overflow-hidden border-primary/20 bg-card/55">
      <CardHeader className="border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary-purple/5 to-primary-blue/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-4 w-4" /> Smart data check
            </div>
            <CardTitle className="text-xl sm:text-2xl">ML Readiness</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">A transparent pre-training check based on size, missingness, cardinality and unusable columns.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
            <div className="text-3xl font-bold tabular-nums">{score}</div>
            <div>
              <Badge variant={score >= 70 ? "secondary" : "outline"}>{readiness.label}</Badge>
              <div className="mt-1 text-xs text-muted-foreground">out of 100</div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-border/60 bg-background/35 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="h-3.5 w-3.5" /> Rows</div>
            <div className="mt-1 text-lg font-semibold">{rows.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/35 p-3">
            <div className="text-xs text-muted-foreground">Missing cells</div>
            <div className="mt-1 text-lg font-semibold">{missingPercent.toFixed(1)}%</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/35 p-3">
            <div className="text-xs text-muted-foreground">Likely IDs</div>
            <div className="mt-1 text-lg font-semibold">{idSet.size}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/35 p-3">
            <div className="text-xs text-muted-foreground">Risky columns</div>
            <div className="mt-1 text-lg font-semibold">{new Set([...constantColumns, ...highMissingColumns, ...highCardinalityCategoricals].map((column) => column.name)).size}</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
            <div className="mb-3 flex items-center gap-2 font-medium">
              {score >= 70 ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
              What to review
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {recommendations.slice(0, 4).map((recommendation) => (
                <li key={recommendation} className="flex gap-2"><span className="mt-1 text-primary">•</span><span>{recommendation}</span></li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
            <div className="mb-3 flex items-center gap-2 font-medium"><Target className="h-4 w-4 text-primary" /> Possible prediction targets</div>
            {targetCandidates.length ? (
              <div className="space-y-2">
                {targetCandidates.map((candidate) => (
                  <div key={candidate.column} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-medium">{candidate.column}</span>
                    <Badge variant="outline" className="shrink-0 capitalize">{candidate.task}</Badge>
                  </div>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">Suggestions are heuristic. You still choose the business/ML target in the next step.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No reliable target suggestion was found automatically. Choose the target manually in Model Configuration.</p>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{readiness.detail} This score is guidance, not a substitute for domain knowledge or validation on unseen data.</p>
      </CardContent>
    </Card>
  );
};

export default DataReadinessPanel;
