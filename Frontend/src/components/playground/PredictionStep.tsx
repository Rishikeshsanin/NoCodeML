import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useExperiment } from "@/contexts/ExperimentContext";
import { useToast } from "@/hooks/use-toast";
import { predictionAPI } from "@/services/apiService";

interface SinglePredictionResult {
  prediction: string;
  confidence?: number | null;
  probabilities?: Record<string, number> | null;
}

interface BatchPredictionResult {
  prediction_id: string;
  total_predictions: number;
  download_url: string;
}

interface PredictionHistoryItem {
  id: string;
  total_predictions: number;
  created_at: string;
}

const MAX_BATCH_MB = 100;

const messageFromError = (error: any, fallback: string) =>
  error?.response?.data?.detail || error?.message || fallback;

const PredictionStep = () => {
  const { currentExperiment } = useExperiment();
  const { toast } = useToast();

  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [predictionResult, setPredictionResult] = useState<SinglePredictionResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchPredictionResult | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [singleLoading, setSingleLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFeatures = currentExperiment?.config?.selectedFeatures || [];
  const numericFeatures = new Set(currentExperiment?.config?.featureTypes?.numerical || []);
  const hasCompletedResult = Boolean(currentExperiment?.results) || currentExperiment?.status === "completed";

  const handleSinglePredict = async () => {
    if (!currentExperiment) return;

    const missingFeatures = selectedFeatures.filter((feature) => {
      const value = inputValues[feature];
      return value === undefined || value.trim() === "";
    });
    if (missingFeatures.length) {
      setError(`Fill in all required features: ${missingFeatures.join(", ")}`);
      return;
    }

    const features = Object.fromEntries(
      selectedFeatures.map((feature) => {
        const raw = inputValues[feature];
        return [feature, numericFeatures.has(feature) ? Number(raw) : raw];
      }),
    );

    if (selectedFeatures.some((feature) => numericFeatures.has(feature) && Number.isNaN(features[feature]))) {
      setError("One or more numerical features contain an invalid number.");
      return;
    }

    setSingleLoading(true);
    setError(null);
    try {
      const result = (await predictionAPI.single(currentExperiment.id, features)) as SinglePredictionResult;
      setPredictionResult(result);
      toast({ title: "Prediction complete", description: `Predicted value: ${result.prediction}` });
    } catch (predictionError: any) {
      const message = messageFromError(predictionError, "Prediction failed.");
      setError(message);
      toast({ title: "Prediction failed", description: message, variant: "destructive" });
    } finally {
      setSingleLoading(false);
    }
  };

  const handleBatchPredict = async (file: File) => {
    if (!currentExperiment) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Batch prediction currently accepts CSV files only.");
      return;
    }
    if (file.size > MAX_BATCH_MB * 1024 * 1024) {
      setError(`Batch CSV files must be ${MAX_BATCH_MB} MB or smaller.`);
      return;
    }

    setBatchLoading(true);
    setError(null);
    try {
      const result = (await predictionAPI.batch(currentExperiment.id, file)) as BatchPredictionResult;
      setBatchResult(result);
      toast({ title: "Batch prediction complete", description: `${result.total_predictions.toLocaleString()} rows predicted.` });
    } catch (predictionError: any) {
      const message = messageFromError(predictionError, "Batch prediction failed.");
      setError(message);
      toast({ title: "Batch prediction failed", description: message, variant: "destructive" });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleDownload = async (predictionId?: string) => {
    const id = predictionId || batchResult?.prediction_id;
    if (!id) return;
    try {
      await predictionAPI.download(id);
    } catch (downloadError: any) {
      const message = messageFromError(downloadError, "Prediction download failed.");
      setError(message);
    }
  };

  const loadPredictionHistory = async () => {
    if (!currentExperiment) return;
    setHistoryLoading(true);
    try {
      const result = await predictionAPI.getHistory(currentExperiment.id);
      setPredictionHistory(result.predictions || []);
      setShowHistory(true);
    } catch (historyError: any) {
      setError(messageFromError(historyError, "Could not load prediction history."));
    } finally {
      setHistoryLoading(false);
    }
  };

  if (!currentExperiment) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No experiment is selected.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden border-primary/25 bg-card/55">
        <CardHeader className="border-b border-border/60 bg-gradient-to-r from-primary/[0.08] via-primary-purple/[0.05] to-primary-blue/[0.08]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-4 w-4" /> Prediction workspace
              </div>
              <CardTitle className="text-2xl">Use your best trained model</CardTitle>
              <CardDescription className="mt-1">Run one prediction interactively or score an entire CSV using the same fitted preprocessing pipeline as training.</CardDescription>
            </div>
            <Badge variant="secondary" className="w-fit">{selectedFeatures.length} required features</Badge>
          </div>
        </CardHeader>
      </Card>

      {!hasCompletedResult && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Predictions require at least one successful completed training run. If prediction fails, return to Train and Results first.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/70 bg-card/55">
          <CardHeader>
            <CardTitle className="text-xl">Single prediction</CardTitle>
            <CardDescription>Enter one observation. Numerical features accept zero and decimal values normally.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!selectedFeatures.length ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Configure the experiment features before making predictions.</AlertDescription>
              </Alert>
            ) : (
              <div className="grid max-h-[430px] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
                {selectedFeatures.map((feature: string) => {
                  const numeric = numericFeatures.has(feature);
                  return (
                    <div key={feature} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={`predict-${feature}`} className="truncate">{feature}</Label>
                        <Badge variant="outline" className="shrink-0 text-[10px]">{numeric ? "number" : "text/category"}</Badge>
                      </div>
                      <Input
                        id={`predict-${feature}`}
                        type={numeric ? "number" : "text"}
                        step={numeric ? "any" : undefined}
                        placeholder={numeric ? "0" : `Enter ${feature}`}
                        value={inputValues[feature] ?? ""}
                        onChange={(event) => {
                          setInputValues((current) => ({ ...current, [feature]: event.target.value }));
                          if (error) setError(null);
                        }}
                        disabled={singleLoading}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              onClick={() => void handleSinglePredict()}
              disabled={singleLoading || !selectedFeatures.length}
              className="w-full gap-2"
            >
              {singleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {singleLoading ? "Predicting…" : "Predict"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/55">
          <CardHeader>
            <CardTitle className="text-xl">Batch prediction</CardTitle>
            <CardDescription>Upload a CSV containing all required feature columns. Extra columns are preserved in the exported result.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="group flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/25 p-6 text-center transition hover:border-primary/50 hover:bg-primary/[0.03]">
              {batchLoading ? <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" /> : <Upload className="mb-4 h-10 w-10 text-primary transition group-hover:-translate-y-0.5" />}
              <div className="font-medium">{batchLoading ? "Processing CSV…" : "Choose a CSV file"}</div>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
                Required columns: {selectedFeatures.length ? selectedFeatures.join(", ") : "configure features first"}. Maximum file size: {MAX_BATCH_MB} MB.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={batchLoading || !selectedFeatures.length}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleBatchPredict(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            {batchResult && (
              <div className="rounded-2xl border border-success/30 bg-success/[0.06] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-medium text-success"><CheckCircle2 className="h-4 w-4" /> Batch complete</div>
                    <div className="mt-1 text-sm text-muted-foreground">{batchResult.total_predictions.toLocaleString()} predictions generated.</div>
                  </div>
                  <Button variant="outline" className="gap-2" onClick={() => void handleDownload()}>
                    <Download className="h-4 w-4" /> Download CSV
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {predictionResult && (
        <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/[0.07] via-card to-primary-blue/[0.06]">
          <CardHeader>
            <CardTitle>Prediction result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Prediction</div>
                <div className="mt-2 break-words text-3xl font-bold text-primary">{predictionResult.prediction}</div>
              </div>
              {predictionResult.confidence != null && (
                <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</div>
                  <div className="mt-2 text-3xl font-bold">{(predictionResult.confidence * 100).toFixed(1)}%</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, predictionResult.confidence * 100))}%` }} /></div>
                </div>
              )}
              <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Input features</div>
                <div className="mt-2 text-3xl font-bold">{selectedFeatures.length}</div>
                <div className="mt-1 text-xs text-muted-foreground">Processed by the saved V3 pipeline</div>
              </div>
            </div>

            {predictionResult.probabilities && Object.keys(predictionResult.probabilities).length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
                <div className="mb-3 text-sm font-medium">Class probabilities</div>
                <div className="space-y-3">
                  {Object.entries(predictionResult.probabilities)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, probability]) => (
                      <div key={label} className="grid grid-cols-[minmax(80px,1fr)_minmax(120px,3fr)_64px] items-center gap-3 text-sm">
                        <span className="truncate font-medium">{label}</span>
                        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${probability * 100}%` }} /></div>
                        <span className="text-right tabular-nums text-muted-foreground">{(probability * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 bg-card/55">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl"><History className="h-5 w-5 text-primary" /> Batch history</CardTitle>
              <CardDescription className="mt-1">Authenticated exports generated for this experiment.</CardDescription>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => void loadPredictionHistory()} disabled={historyLoading}>
              {historyLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {showHistory ? "Refresh" : "Load history"}
            </Button>
          </div>
        </CardHeader>
        {showHistory && (
          <CardContent>
            {!predictionHistory.length ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <FileSpreadsheet className="mx-auto mb-3 h-8 w-8" /> No batch predictions yet.
              </div>
            ) : (
              <div className="space-y-2">
                {predictionHistory.map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/25 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium">{item.total_predictions.toLocaleString()} predictions</div>
                      <div className="mt-1 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => void handleDownload(item.id)}>
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default PredictionStep;
