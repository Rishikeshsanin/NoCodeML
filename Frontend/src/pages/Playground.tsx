import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { DataScienceAssistant } from "@/components/experiments/DataScienceAssistant";
import DataAnalysisStep from "@/components/playground/DataAnalysisStep";
import ModelConfigStep from "@/components/playground/ModelConfigStep";
import PredictionStep from "@/components/playground/PredictionStep";
import ResultsStep from "@/components/playground/ResultsStep";
import TrainingStep from "@/components/playground/TrainingStep";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExperiment } from "@/contexts/ExperimentContext";
import { useTraining } from "@/contexts/TrainingContext";
import { useEDA } from "@/hooks/useEDA";

const phases = [
  { value: "analysis", number: "01", label: "Analysis" },
  { value: "config", number: "02", label: "Configure" },
  { value: "training", number: "03", label: "Train" },
  { value: "results", number: "04", label: "Results" },
  { value: "predict", number: "05", label: "Predict" },
] as const;

type Phase = (typeof phases)[number]["value"];

const Playground = () => {
  const { experimentId } = useParams<{ experimentId: string }>();
  const navigate = useNavigate();
  const { currentExperiment, loadExperiment } = useExperiment();
  const { currentRun } = useTraining();
  const [activeTab, setActiveTab] = useState<Phase>("analysis");

  const { edaData, isLoading: edaLoading } = useEDA(currentExperiment?.datasetId);

  useEffect(() => {
    if (!experimentId) {
      navigate("/experiments", { replace: true });
      return;
    }
    void loadExperiment(experimentId);
    // loadExperiment is supplied by context and currently recreated by the V2 provider.
    // Re-running this effect should depend on the route ID, not provider render identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId, navigate]);

  useEffect(() => {
    if (experimentId && (activeTab === "config" || activeTab === "training")) {
      void loadExperiment(experimentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, experimentId]);

  if (!currentExperiment) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading experiment…
        </div>
      </div>
    );
  }

  const configurationReady = Boolean(
    currentExperiment.config?.taskType &&
      currentExperiment.config?.targetColumn &&
      currentExperiment.config?.selectedFeatures?.length,
  );

  return (
    <main className="min-h-[calc(100vh-4rem)] py-5 sm:py-8">
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-3xl border border-border/60 bg-card/40 p-4 backdrop-blur-xl sm:p-6">
          <div className="flex items-start gap-3 sm:items-center">
            <Button
              variant="outline"
              size="icon"
              className="mt-0.5 shrink-0 rounded-xl sm:mt-0"
              onClick={() => navigate("/experiments")}
              aria-label="Back to experiments"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-primary">Experiment workspace</div>
              <h1 className="mt-1 truncate text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{currentExperiment.name}</h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">Dataset: {currentExperiment.datasetName || "Loading dataset…"}</p>
            </div>
            <div className="hidden rounded-2xl border border-border/60 bg-background/30 px-4 py-2 text-right sm:block">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</div>
              <div className="text-sm font-medium capitalize">{currentExperiment.status.replace("_", " ")}</div>
            </div>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Phase)} className="space-y-5">
          <div className="overflow-x-auto pb-1">
            <TabsList className="inline-flex h-auto min-w-full justify-start gap-1 border border-border/60 bg-card/50 p-1 sm:grid sm:grid-cols-5">
              {phases.map((phase) => (
                <TabsTrigger
                  key={phase.value}
                  value={phase.value}
                  className="min-w-[110px] gap-2 rounded-lg px-3 py-2.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary sm:min-w-0 sm:text-sm"
                >
                  <span className="text-[10px] font-semibold opacity-60">{phase.number}</span>
                  {phase.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="analysis" className="animate-fade-in focus-visible:outline-none">
            <DataAnalysisStep onNext={() => setActiveTab("config")} />
          </TabsContent>

          <TabsContent value="config" className="animate-fade-in focus-visible:outline-none">
            {edaLoading ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading dataset analysis…</div>
              </div>
            ) : edaData ? (
              <ModelConfigStep
                experiment={currentExperiment}
                edaData={edaData}
                onNext={() => setActiveTab("training")}
                onBack={() => setActiveTab("analysis")}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">Complete Data Analysis before configuring models.</p>
                <Button onClick={() => setActiveTab("analysis")} className="mt-4">Go to analysis</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="training" className="animate-fade-in focus-visible:outline-none">
            {configurationReady ? (
              <TrainingStep
                experimentId={currentExperiment.id}
                experimentConfig={currentExperiment.config}
                onComplete={() => setActiveTab("results")}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">Choose a task, target, features and models before training.</p>
                <Button onClick={() => setActiveTab("config")} className="mt-4">Configure models</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="results" className="animate-fade-in focus-visible:outline-none">
            <ResultsStep experimentId={currentExperiment.id} onBack={() => setActiveTab("training")} />
          </TabsContent>

          <TabsContent value="predict" className="animate-fade-in focus-visible:outline-none">
            <PredictionStep />
          </TabsContent>
        </Tabs>
      </div>

      <DataScienceAssistant
        datasetId={currentExperiment.datasetId}
        edaData={edaData}
        currentPhase={activeTab}
        experimentConfig={currentExperiment.config}
        trainingData={currentRun}
        resultsData={currentExperiment.results}
      />
    </main>
  );
};

export default Playground;
