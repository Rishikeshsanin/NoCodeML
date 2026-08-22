import { useCallback, useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Database,
  Download,
  FileDown,
  FlaskConical,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import DatasetUploadModal from "@/components/datasets/DatasetUploadModal";
import DataReadinessPanel from "@/components/playground/DataReadinessPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSession } from "@/contexts/SessionContext";
import {
  workspaceDatasetAPI,
  workspaceEDAAPI,
  workspaceExportAPI,
  workspacePredictionAPI,
  workspaceTrainingAPI,
  type WorkspaceDataset,
  type WorkspacePlotResponse,
  type WorkspacePrediction,
  type WorkspaceTrainingRun,
} from "@/services/workspaceService";
import type { EDAResponse } from "@/types/experiment";

const STEPS = ["Data", "Explore", "Configure", "Train", "Predict & Export"] as const;
const CLASSIFICATION_MODELS = [
  ["LogisticRegression", "Logistic Regression", "Fast, interpretable baseline"],
  ["RandomForestClassifier", "Random Forest", "Strong nonlinear ensemble"],
  ["XGBClassifier", "XGBoost", "High-performance gradient boosting"],
  ["LGBMClassifier", "LightGBM", "Efficient boosted trees"],
] as const;
const REGRESSION_MODELS = [
  ["LinearRegression", "Linear Regression", "Fast, interpretable baseline"],
  ["RandomForestRegressor", "Random Forest", "Robust nonlinear ensemble"],
  ["XGBRegressor", "XGBoost", "High-performance gradient boosting"],
  ["LGBMRegressor", "LightGBM", "Efficient boosted trees"],
] as const;

const selectClass = "h-11 w-full rounded-xl border border-border/70 bg-background/60 px-3 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10";

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "dataset";
const chartFilename = (dataset: string, kind: string) => {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  return `nocodeml_${slug(dataset)}_${slug(kind)}_${stamp}`;
};

const Workspace = () => {
  const { status: sessionStatus, restartSession } = useSession();
  const [step, setStep] = useState(0);
  const [datasets, setDatasets] = useState<WorkspaceDataset[]>([]);
  const [datasetId, setDatasetId] = useState<string>("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [eda, setEda] = useState<EDAResponse | null>(null);
  const [edaLoading, setEdaLoading] = useState(false);

  const [target, setTarget] = useState("");
  const [taskType, setTaskType] = useState<"classification" | "regression">("classification");
  const [features, setFeatures] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [testSize, setTestSize] = useState(0.2);

  const [run, setRun] = useState<WorkspaceTrainingRun | null>(null);
  const [startingTraining, setStartingTraining] = useState(false);
  const [predictionValues, setPredictionValues] = useState<Record<string, string>>({});
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const [predicting, setPredicting] = useState(false);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchPredicting, setBatchPredicting] = useState(false);
  const [predictionHistory, setPredictionHistory] = useState<WorkspacePrediction[]>([]);

  const [plotType, setPlotType] = useState<"histogram" | "scatter" | "box" | "correlation" | "bar">("histogram");
  const [plotX, setPlotX] = useState("");
  const [plotY, setPlotY] = useState("");
  const [plotGroup, setPlotGroup] = useState("");
  const [plotData, setPlotData] = useState<WorkspacePlotResponse | null>(null);
  const [plotLoading, setPlotLoading] = useState(false);

  const activeDataset = useMemo(() => datasets.find((dataset) => dataset.id === datasetId) || null, [datasets, datasetId]);
  const modelOptions = taskType === "classification" ? CLASSIFICATION_MODELS : REGRESSION_MODELS;

  const loadDatasets = useCallback(async () => {
    if (sessionStatus !== "active") return;
    setLoadingDatasets(true);
    try {
      const next = await workspaceDatasetAPI.list();
      setDatasets(next);
      setDatasetId((current) => next.some((dataset) => dataset.id === current) ? current : (next[0]?.id || ""));
    } catch (error: any) {
      toast.error(error.message || "Couldn't load this temporary workspace");
    } finally {
      setLoadingDatasets(false);
    }
  }, [sessionStatus]);

  useEffect(() => {
    if (sessionStatus === "active") void loadDatasets();
  }, [sessionStatus, loadDatasets]);

  useEffect(() => {
    if (!datasetId) {
      setEda(null);
      return;
    }
    let cancelled = false;
    setEdaLoading(true);
    workspaceEDAAPI.summary(datasetId)
      .then((summary) => { if (!cancelled) setEda(summary); })
      .catch((error: any) => { if (!cancelled) toast.error(error.message || "Couldn't analyze this dataset"); })
      .finally(() => { if (!cancelled) setEdaLoading(false); });
    return () => { cancelled = true; };
  }, [datasetId]);

  useEffect(() => {
    if (!eda) return;
    const ids = new Set(eda.id_columns || []);
    const candidates = eda.columns.filter((column) => !ids.has(column.name) && column.unique_count > 1);
    const hints = ["target", "label", "outcome", "class", "churn", "survived", "fraud", "default", "price", "sales", "revenue", "score"];
    const suggested = candidates.find((column) => hints.some((hint) => column.name.toLowerCase().includes(hint))) || candidates[candidates.length - 1];
    if (!suggested) return;

    setTarget(suggested.name);
    const numeric = new Set(eda.numeric_columns || []);
    const categorical = new Set(eda.categorical_columns || []);
    const lowCardinality = suggested.unique_count <= Math.max(20, Math.floor(eda.dataset_info.row_count * 0.05));
    const inferred: "classification" | "regression" = categorical.has(suggested.name) || (numeric.has(suggested.name) && lowCardinality) ? "classification" : "regression";
    setTaskType(inferred);
    setFeatures(eda.columns.filter((column) => column.name !== suggested.name && !ids.has(column.name) && column.unique_count > 1).map((column) => column.name));
    setSelectedModels(inferred === "classification" ? ["LogisticRegression", "RandomForestClassifier"] : ["LinearRegression", "RandomForestRegressor"]);
    setRun(null);
    setPredictionResult(null);
    setPredictionValues({});

    const numericColumns = (eda.numeric_columns || []).filter((column) => !ids.has(column));
    const categoricalColumns = (eda.categorical_columns || []).filter((column) => !ids.has(column));
    setPlotX(numericColumns[0] || categoricalColumns[0] || "");
    setPlotY(numericColumns[1] || "");
    setPlotGroup("");
    setPlotData(null);
  }, [eda]);

  useEffect(() => {
    if (!target || !eda) return;
    const column = eda.columns.find((item) => item.name === target);
    if (!column) return;
    const categorical = new Set(eda.categorical_columns || []);
    const numeric = new Set(eda.numeric_columns || []);
    const lowCardinality = column.unique_count <= Math.max(20, Math.floor(eda.dataset_info.row_count * 0.05));
    const inferred: "classification" | "regression" = categorical.has(target) || (numeric.has(target) && lowCardinality) ? "classification" : "regression";
    setTaskType(inferred);
    setFeatures((current) => current.filter((feature) => feature !== target));
    setSelectedModels(inferred === "classification" ? ["LogisticRegression", "RandomForestClassifier"] : ["LinearRegression", "RandomForestRegressor"]);
    setRun(null);
  }, [target, eda]);

  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await workspaceTrainingAPI.get(run.id);
        setRun(next);
        if (next.status === "completed") {
          toast.success("Training complete");
          window.clearInterval(timer);
        }
        if (next.status === "failed") {
          toast.error(next.error?.message || "Training failed");
          window.clearInterval(timer);
        }
      } catch (error: any) {
        toast.error(error.message || "Couldn't refresh training status");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [run?.id, run?.status]);

  useEffect(() => {
    if (step === 4 && sessionStatus === "active") {
      workspacePredictionAPI.list().then(setPredictionHistory).catch(() => setPredictionHistory([]));
    }
  }, [step, sessionStatus]);

  const continueStep = () => setStep((value) => Math.min(value + 1, STEPS.length - 1));
  const backStep = () => setStep((value) => Math.max(value - 1, 0));

  const generatePlot = async () => {
    if (!datasetId || !eda) return;
    if (plotType !== "correlation" && !plotX) {
      toast.error("Choose a column for this chart");
      return;
    }
    if (plotType === "scatter" && !plotY) {
      toast.error("Choose both X and Y columns for a scatter plot");
      return;
    }
    setPlotLoading(true);
    try {
      const response = await workspaceEDAAPI.plot(datasetId, {
        plot_type: plotType,
        x_column: plotType === "correlation" ? "unused" : plotX,
        y_column: plotType === "scatter" ? plotY : null,
        group_by: plotGroup || null,
      });
      setPlotData(response);
    } catch (error: any) {
      toast.error(error.message || "Couldn't generate this visualization");
    } finally {
      setPlotLoading(false);
    }
  };

  const startTraining = async () => {
    if (!datasetId || !target || !features.length || !selectedModels.length) {
      toast.error("Choose a target, at least one feature and at least one model");
      return;
    }
    setStartingTraining(true);
    try {
      const next = await workspaceTrainingAPI.start({
        dataset_id: datasetId,
        target_column: target,
        task_type: taskType,
        selected_features: features,
        models: selectedModels.map((model_type) => ({ model_type })),
        test_size: testSize,
        random_state: 42,
        cv_folds: 3,
        scaling: true,
      });
      setRun(next);
      toast.success("Training started");
    } catch (error: any) {
      toast.error(error.message || "Training couldn't start");
    } finally {
      setStartingTraining(false);
    }
  };

  const makePrediction = async () => {
    if (!run || run.status !== "completed") return;
    const numeric = new Set(eda?.numeric_columns || []);
    const payload: Record<string, unknown> = {};
    for (const feature of features) {
      const raw = predictionValues[feature]?.trim();
      if (!raw) {
        toast.error(`Enter a value for ${feature}`);
        return;
      }
      payload[feature] = numeric.has(feature) ? Number(raw) : raw;
      if (numeric.has(feature) && Number.isNaN(payload[feature])) {
        toast.error(`${feature} must be a number`);
        return;
      }
    }
    setPredicting(true);
    try {
      setPredictionResult(await workspaceTrainingAPI.predict(run.id, payload));
    } catch (error: any) {
      toast.error(error.message || "Prediction failed");
    } finally {
      setPredicting(false);
    }
  };

  const makeBatchPrediction = async () => {
    if (!run || !batchFile) return;
    setBatchPredicting(true);
    try {
      const prediction = await workspaceTrainingAPI.predictBatch(run.id, batchFile);
      toast.success(`${prediction.total_predictions} predictions generated`);
      setBatchFile(null);
      setPredictionHistory(await workspacePredictionAPI.list());
    } catch (error: any) {
      toast.error(error.message || "Batch prediction failed");
    } finally {
      setBatchPredicting(false);
    }
  };

  const clearWorkspace = async () => {
    if (!window.confirm("Clear this temporary session? Download anything you need first. All workspace files will be deleted.")) return;
    try {
      await restartSession();
      setDatasets([]);
      setDatasetId("");
      setEda(null);
      setRun(null);
      setPredictionHistory([]);
      setStep(0);
      await loadDatasets();
      toast.success("Fresh temporary workspace ready");
    } catch (error: any) {
      toast.error(error.message || "Couldn't reset the workspace");
    }
  };

  const canContinue = step === 0 ? Boolean(datasetId) : step === 1 ? Boolean(eda) : step === 2 ? Boolean(target && features.length && selectedModels.length) : step === 3 ? run?.status === "completed" : false;

  return (
    <main className="min-h-[calc(100vh-4rem)] py-5 sm:py-8">
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
        <section className="mb-5 overflow-hidden rounded-3xl border border-border/60 bg-card/45 p-5 backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                <ShieldCheck className="h-3.5 w-3.5" /> Private by lifecycle · No account required
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Temporary ML <span className="gradient-text">workspace</span></h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Upload, explore, train, predict and export. Your workspace is temporary and is automatically cleaned after you leave or the session expires.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void workspaceExportAPI.downloadSession()} disabled={!datasets.length} className="gap-2 rounded-xl"><Download className="h-4 w-4" /> Download session</Button>
              <Button variant="outline" onClick={() => void clearWorkspace()} className="gap-2 rounded-xl"><RefreshCw className="h-4 w-4" /> Start over</Button>
            </div>
          </div>
        </section>

        <div className="mb-6 overflow-x-auto pb-1">
          <div className="flex min-w-[680px] gap-2 rounded-2xl border border-border/60 bg-card/35 p-2">
            {STEPS.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => index <= step || (index === step + 1 && canContinue) ? setStep(index) : undefined}
                className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${index === step ? "bg-primary/10 text-primary" : index < step ? "text-foreground hover:bg-secondary/60" : "text-muted-foreground"}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${index <= step ? "bg-primary/15" : "bg-secondary"}`}>{index < step ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span>
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-5">
            <Card className="border-border/60 bg-card/45">
              <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Choose your data</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {loadingDatasets || sessionStatus === "initializing" ? (
                  <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparing temporary workspace…</div>
                ) : datasets.length ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {datasets.map((dataset) => (
                      <button key={dataset.id} type="button" onClick={() => setDatasetId(dataset.id)} className={`rounded-2xl border p-4 text-left transition ${dataset.id === datasetId ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/30 hover:border-primary/25"}`}>
                        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-semibold">{dataset.name}</div><div className="mt-1 truncate text-xs text-muted-foreground">{dataset.original_filename}</div></div>{dataset.id === datasetId && <Badge>Active</Badge>}</div>
                        <div className="mt-4 flex gap-3 text-xs text-muted-foreground"><span>{dataset.row_count.toLocaleString()} rows</span><span>{dataset.column_count} columns</span><span>{(dataset.file_size_bytes / 1024 / 1024).toFixed(2)} MB</span></div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 px-5 py-12 text-center"><UploadCloud className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-4 text-lg font-semibold">Drop in a dataset to begin</h2><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">CSV, Excel and Parquet are supported up to 100 MB. No signup and no permanent project record.</p></div>
                )}
                <Button onClick={() => setUploadOpen(true)} disabled={sessionStatus !== "active"} className="gradient-primary gap-2 rounded-xl text-background"><UploadCloud className="h-4 w-4" /> {datasets.length ? "Upload another dataset" : "Upload dataset"}</Button>
              </CardContent>
            </Card>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            {edaLoading || !eda ? <Card><CardContent className="flex items-center gap-2 py-14 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing dataset…</CardContent></Card> : (
              <>
                <DataReadinessPanel edaData={eda} />
                <Card className="border-border/60 bg-card/45"><CardHeader><CardTitle className="flex items-center gap-2"><FileDown className="h-5 w-5 text-primary" /> Keep the analysis</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void workspaceEDAAPI.downloadSummary(datasetId)}>EDA summary JSON</Button>
                  <Button variant="outline" onClick={() => void workspaceEDAAPI.downloadStatistics(datasetId)}>Statistics CSV</Button>
                  <Button variant="outline" onClick={() => void workspaceEDAAPI.downloadMissingValues(datasetId)}>Missing values CSV</Button>
                  <Button variant="outline" onClick={() => void workspaceEDAAPI.downloadCorrelations(datasetId)}>Correlations CSV</Button>
                </CardContent></Card>

                <Card className="border-border/60 bg-card/45"><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /> Visualization lab</CardTitle></CardHeader><CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <select className={selectClass} value={plotType} onChange={(event) => setPlotType(event.target.value as any)}><option value="histogram">Histogram</option><option value="scatter">Scatter</option><option value="box">Box plot</option><option value="bar">Bar chart</option><option value="correlation">Correlation</option></select>
                    <select className={selectClass} value={plotX} onChange={(event) => setPlotX(event.target.value)} disabled={plotType === "correlation"}><option value="">X column</option>{eda.columns.filter((column) => !eda.id_columns.includes(column.name)).map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select>
                    <select className={selectClass} value={plotY} onChange={(event) => setPlotY(event.target.value)} disabled={plotType !== "scatter"}><option value="">Y column</option>{eda.numeric_columns.filter((column) => !eda.id_columns.includes(column)).map((column) => <option key={column} value={column}>{column}</option>)}</select>
                    <Button onClick={() => void generatePlot()} disabled={plotLoading} className="h-11 gap-2 rounded-xl">{plotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />} Generate</Button>
                  </div>
                  {(plotType === "scatter" || plotType === "box") && <select className={selectClass} value={plotGroup} onChange={(event) => setPlotGroup(event.target.value)}><option value="">No grouping</option>{eda.categorical_columns.filter((column) => !eda.id_columns.includes(column)).map((column) => <option key={column} value={column}>{column}</option>)}</select>}
                  {plotData && <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/30 p-2 sm:p-4"><Plot data={plotData.data as any} layout={{ ...(plotData.layout as any), autosize: true, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { color: "hsl(var(--foreground))" }, margin: { t: 40, r: 30, b: 60, l: 60 } }} config={{ responsive: true, displaylogo: false, toImageButtonOptions: { format: "png", filename: chartFilename(activeDataset?.name || "dataset", plotData.plot_type), width: 1400, height: 900, scale: 2 } }} style={{ width: "100%", height: "min(520px,70vh)" }} useResizeHandler /></div>}
                </CardContent></Card>
              </>
            )}
          </div>
        )}

        {step === 2 && eda && (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
            <Card className="border-border/60 bg-card/45"><CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> What should NoCodeML predict?</CardTitle></CardHeader><CardContent className="space-y-5">
              <div><label className="mb-2 block text-sm font-medium">Target column</label><select className={selectClass} value={target} onChange={(event) => setTarget(event.target.value)}>{eda.columns.filter((column) => !eda.id_columns.includes(column.name) && column.unique_count > 1).map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select></div>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-center gap-2 font-medium"><WandSparkles className="h-4 w-4 text-primary" /> Suggested task</div><div className="mt-3 flex gap-2"><Button type="button" size="sm" variant={taskType === "classification" ? "default" : "outline"} onClick={() => setTaskType("classification")}>Classification</Button><Button type="button" size="sm" variant={taskType === "regression" ? "default" : "outline"} onClick={() => setTaskType("regression")}>Regression</Button></div><p className="mt-3 text-xs text-muted-foreground">The suggestion is based on target datatype and cardinality. You can override it when domain knowledge says otherwise.</p></div>
              <div><label className="mb-2 block text-sm font-medium">Test data: {Math.round(testSize * 100)}%</label><input type="range" min="0.1" max="0.4" step="0.05" value={testSize} onChange={(event) => setTestSize(Number(event.target.value))} className="w-full accent-primary" /></div>
            </Card>

            <Card className="border-border/60 bg-card/45"><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Features & models</CardTitle></CardHeader><CardContent className="space-y-5">
              <div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Input features</span><span className="text-xs text-muted-foreground">{features.length} selected</span></div><div className="grid max-h-52 gap-2 overflow-auto rounded-2xl border border-border/60 p-3 sm:grid-cols-2">{eda.columns.filter((column) => column.name !== target && !eda.id_columns.includes(column.name) && column.unique_count > 1).map((column) => { const checked = features.includes(column.name); return <label key={column.name} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${checked ? "border-primary/30 bg-primary/5" : "border-border/50"}`}><input type="checkbox" checked={checked} onChange={() => setFeatures((current) => checked ? current.filter((item) => item !== column.name) : [...current, column.name])} className="accent-primary" /><span className="min-w-0 truncate">{column.name}</span></label>; })}</div></div>
              <div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Models</span><span className="text-xs text-muted-foreground">Smart defaults selected</span></div><div className="grid gap-2 sm:grid-cols-2">{modelOptions.map(([value, label, description]) => { const checked = selectedModels.includes(value); return <button type="button" key={value} onClick={() => setSelectedModels((current) => checked ? current.filter((item) => item !== value) : [...current, value])} className={`rounded-2xl border p-3 text-left transition ${checked ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/30 hover:border-primary/25"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{label}</span>{checked && <CheckCircle2 className="h-4 w-4 text-primary" />}</div><p className="mt-1 text-xs text-muted-foreground">{description}</p></button>; })}</div></div>
            </Card>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <Card className="border-border/60 bg-card/45"><CardHeader><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" /> Train & compare</CardTitle></CardHeader><CardContent className="space-y-5">
              {!run && <div className="rounded-2xl border border-border/60 bg-background/30 p-5"><div className="grid gap-3 sm:grid-cols-3"><div><div className="text-xs text-muted-foreground">Task</div><div className="mt-1 font-semibold capitalize">{taskType}</div></div><div><div className="text-xs text-muted-foreground">Target</div><div className="mt-1 font-semibold">{target}</div></div><div><div className="text-xs text-muted-foreground">Models</div><div className="mt-1 font-semibold">{selectedModels.length}</div></div></div><Button onClick={() => void startTraining()} disabled={startingTraining} className="gradient-primary mt-5 gap-2 rounded-xl text-background">{startingTraining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Train models</Button></div>}
              {run && <><div className="rounded-2xl border border-border/60 bg-background/30 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><Badge variant={run.status === "completed" ? "secondary" : "outline"} className="capitalize">{run.status}</Badge><p className="mt-2 text-sm text-muted-foreground">{run.progress.message}</p></div><div className="text-2xl font-bold tabular-nums">{run.progress.percent}%</div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${run.progress.percent}%` }} /></div>{run.status === "failed" && <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{run.error?.message || "Training failed. Review the configuration and try again."}</div>}</div>
              {run.status === "completed" && <div className="space-y-3"><div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="text-xs uppercase tracking-wider text-primary">Best model</div><div className="mt-1 text-xl font-semibold">{String(run.best_model?.model_type || "Model")}</div><div className="mt-1 text-sm text-muted-foreground">{String(run.best_model?.metric || "score")}: {Number(run.best_model?.score ?? 0).toFixed(4)}</div></div><div className="overflow-x-auto rounded-2xl border border-border/60"><table className="w-full min-w-[640px] text-sm"><thead className="bg-secondary/50"><tr><th className="px-4 py-3 text-left">Model</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Primary metric</th><th className="px-4 py-3 text-left">Training time</th></tr></thead><tbody>{run.results.map((result: any) => { const test = result.metrics?.test || {}; const primary = taskType === "classification" ? test.f1_score : test.r2_score; return <tr key={String(result.model_type)} className="border-t border-border/50"><td className="px-4 py-3 font-medium">{String(result.model_type)}</td><td className="px-4 py-3">{result.success ? "Completed" : "Failed"}</td><td className="px-4 py-3">{typeof primary === "number" ? primary.toFixed(4) : "—"}</td><td className="px-4 py-3">{typeof result.training_time_seconds === "number" ? `${result.training_time_seconds.toFixed(2)}s` : "—"}</td></tr>; })}</tbody></table></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void workspaceTrainingAPI.downloadComparison(run.id)}>Model comparison CSV</Button><Button variant="outline" onClick={() => void workspaceTrainingAPI.downloadSummary(run.id)}>Training JSON</Button><Button variant="outline" onClick={() => void workspaceTrainingAPI.downloadFeatureImportance(run.id)}>Feature importance CSV</Button><Button variant="outline" onClick={() => void workspaceTrainingAPI.downloadBestModel(run.id)}>Best model</Button></div></div>}
              </>}
            </CardContent></Card>
          </div>
        )}

        {step === 4 && run?.status === "completed" && eda && (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="border-border/60 bg-card/45"><CardHeader><CardTitle>Single prediction</CardTitle></CardHeader><CardContent className="space-y-3">{features.map((feature) => { const column = eda.columns.find((item) => item.name === feature); const numeric = eda.numeric_columns.includes(feature); return <div key={feature}><label className="mb-1.5 block text-sm font-medium">{feature}</label><Input type={numeric ? "number" : "text"} value={predictionValues[feature] || ""} onChange={(event) => setPredictionValues((current) => ({ ...current, [feature]: event.target.value }))} placeholder={column?.sample_values?.length ? `e.g. ${String(column.sample_values[0])}` : numeric ? "Enter a number" : "Enter a value"} className="rounded-xl" /></div>; })}<Button onClick={() => void makePrediction()} disabled={predicting} className="mt-2 gap-2 rounded-xl">{predicting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Predict</Button>{predictionResult && <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4"><div className="text-xs uppercase tracking-wider text-primary">Prediction</div><div className="mt-1 break-words text-2xl font-bold">{String(predictionResult.prediction)}</div>{typeof predictionResult.confidence === "number" && <div className="mt-1 text-sm text-muted-foreground">Confidence {(predictionResult.confidence * 100).toFixed(1)}%</div>}</div>}</CardContent></Card>

              <Card className="border-border/60 bg-card/45"><CardHeader><CardTitle>Batch prediction</CardTitle></CardHeader><CardContent className="space-y-4"><div className="rounded-2xl border border-dashed border-border/70 p-5"><input type="file" accept=".csv" onChange={(event) => setBatchFile(event.target.files?.[0] || null)} className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary" /><p className="mt-2 text-xs text-muted-foreground">Upload a CSV containing the same input feature columns used during training.</p></div><Button onClick={() => void makeBatchPrediction()} disabled={!batchFile || batchPredicting} className="gap-2 rounded-xl">{batchPredicting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Generate batch predictions</Button>{predictionHistory.length > 0 && <div className="space-y-2"><div className="text-sm font-medium">Session prediction files</div>{predictionHistory.map((prediction) => <div key={prediction.id} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/30 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="truncate text-sm font-medium">{prediction.download_filename}</div><div className="text-xs text-muted-foreground">{prediction.total_predictions.toLocaleString()} rows</div></div><Button size="sm" variant="outline" onClick={() => void workspacePredictionAPI.download(prediction)} className="gap-2"><Download className="h-3.5 w-3.5" /> Download</Button></div>)}</div>}</CardContent></Card>
            </div>

            <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/60 to-primary-purple/[0.08]"><CardContent className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2 font-semibold"><Download className="h-5 w-5 text-primary" /> Take the whole session with you</div><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Download source data, EDA summaries, training results, best model and batch predictions in one ZIP before leaving. Then you can clear the temporary workspace.</p></div><Button onClick={() => void workspaceExportAPI.downloadSession()} className="gradient-primary shrink-0 gap-2 rounded-xl text-background"><FileDown className="h-4 w-4" /> Download session ZIP</Button></CardContent></Card>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" onClick={backStep} disabled={step === 0} className="gap-2 rounded-xl"><ArrowLeft className="h-4 w-4" /> Back</Button>
          {step < STEPS.length - 1 && <Button onClick={continueStep} disabled={!canContinue} className="gap-2 rounded-xl">Continue <ArrowRight className="h-4 w-4" /></Button>}
        </div>
      </div>

      <DatasetUploadModal open={uploadOpen} onOpenChange={setUploadOpen} onUploadSuccess={loadDatasets} />
    </main>
  );
};

export default Workspace;
