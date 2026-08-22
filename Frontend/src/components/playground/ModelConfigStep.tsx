import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useExperiment } from "@/contexts/ExperimentContext";
import { useModels } from "@/contexts/ModelsContext";
import { useToast } from "@/hooks/use-toast";
import type { ColumnInfo, EDAResponse } from "@/types/experiment";

import { FeatureSelector } from "./FeatureSelector";

type TaskType = "classification" | "regression";

interface ModelConfigStepProps {
  experiment: any;
  edaData: EDAResponse;
  onNext: () => void;
  onBack?: () => void;
}

interface TargetSuggestion {
  column: string;
  task: TaskType;
  score: number;
  reason: string;
}

const TARGET_HINTS = [
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

const ModelConfigStep = ({ experiment, edaData, onNext, onBack }: ModelConfigStepProps) => {
  const { toast } = useToast();
  const { updateExperiment } = useExperiment();
  const { getModelsByTask, loading: modelsLoading } = useModels();

  const [taskType, setTaskType] = useState<TaskType>(experiment?.config?.taskType || "classification");
  const [targetColumn, setTargetColumn] = useState(experiment?.config?.targetColumn || "");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(experiment?.config?.selectedFeatures || []);
  const [trainSplit, setTrainSplit] = useState<number[]>([
    experiment?.config?.trainTestSplit ? experiment.config.trainTestSplit * 100 : 80,
  ]);
  const [selectedModels, setSelectedModels] = useState<string[]>(
    experiment?.config?.models?.map((model: any) => model.model_type) || [],
  );
  const [optimizationEnabled, setOptimizationEnabled] = useState(Boolean(experiment?.config?.enableOptimization));
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const rows = edaData?.dataset_info?.row_count || 0;
  const allColumns = useMemo<ColumnInfo[]>(() => edaData?.columns || [], [edaData?.columns]);
  const idColumns = useMemo(() => edaData?.id_columns || [], [edaData?.id_columns]);
  const idSet = useMemo(() => new Set(idColumns), [idColumns]);
  const numericColumns = useMemo(
    () => (edaData?.numeric_columns || []).filter((column) => !idSet.has(column)),
    [edaData?.numeric_columns, idSet],
  );
  const categoricalColumns = useMemo(
    () => (edaData?.categorical_columns || []).filter((column) => !idSet.has(column)),
    [edaData?.categorical_columns, idSet],
  );
  const availableColumns = useMemo(
    () => Array.from(new Set([...numericColumns, ...categoricalColumns])),
    [numericColumns, categoricalColumns],
  );
  const columnMap = useMemo(
    () => new Map(allColumns.map((column) => [column.name, column])),
    [allColumns],
  );
  const numericSet = useMemo(() => new Set(numericColumns), [numericColumns]);
  const categoricalSet = useMemo(() => new Set(categoricalColumns), [categoricalColumns]);
  const classificationCardinalityLimit = Math.max(20, Math.floor(rows * 0.05));

  const inferTask = (column: string): TaskType => {
    const info = columnMap.get(column);
    if (categoricalSet.has(column)) return "classification";
    if (numericSet.has(column) && info && info.unique_count <= classificationCardinalityLimit) return "classification";
    return "regression";
  };

  const classificationTargets = useMemo(
    () =>
      availableColumns.filter((column) => {
        const info = columnMap.get(column);
        if (!info || info.unique_count < 2) return false;
        return categoricalSet.has(column) || (numericSet.has(column) && info.unique_count <= classificationCardinalityLimit);
      }),
    [availableColumns, categoricalSet, classificationCardinalityLimit, columnMap, numericSet],
  );

  const validTargetColumns = useMemo(
    () => (taskType === "classification" ? classificationTargets : numericColumns),
    [classificationTargets, numericColumns, taskType],
  );

  const availableFeatures = useMemo(
    () => availableColumns.filter((column) => column !== targetColumn),
    [availableColumns, targetColumn],
  );

  const models = useMemo(
    () =>
      getModelsByTask(taskType).map((model) => ({
        id: model.model_type,
        name: model.display_name,
        description: model.description,
      })),
    [getModelsByTask, taskType],
  );

  const targetSuggestions = useMemo<TargetSuggestion[]>(() => {
    return allColumns
      .filter(
        (column) =>
          !idSet.has(column.name) &&
          column.unique_count > 1 &&
          column.missing_percent < 50 &&
          (numericSet.has(column.name) || categoricalSet.has(column.name)),
      )
      .map((column, index) => {
        const lowerName = column.name.toLowerCase();
        const hasNameHint = TARGET_HINTS.some((hint) => lowerName === hint || lowerName.includes(hint));
        const inferredTask = inferTask(column.name);
        let score = 0;
        const reasons: string[] = [];

        if (hasNameHint) {
          score += 12;
          reasons.push("target-like name");
        }
        if (column.missing_percent === 0) {
          score += 3;
          reasons.push("no missing values");
        } else if (column.missing_percent < 10) {
          score += 2;
        }
        if (inferredTask === "classification" && column.unique_count <= 20) {
          score += 4;
          reasons.push(`${column.unique_count} classes`);
        }
        if (index === allColumns.length - 1) {
          score += 2;
          reasons.push("final dataset column");
        }

        return {
          column: column.name,
          task: inferredTask,
          score,
          reason: reasons.slice(0, 2).join(" · ") || "usable target candidate",
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [allColumns, categoricalSet, idSet, numericSet]);

  useEffect(() => {
    if (hasUnsavedChanges || !experiment?.config) return;
    const config = experiment.config;
    setTaskType(config.taskType || "classification");
    setTargetColumn(config.targetColumn || "");
    setSelectedFeatures(config.selectedFeatures || []);
    setTrainSplit([config.trainTestSplit ? config.trainTestSplit * 100 : 80]);
    setSelectedModels(config.models?.map((model: any) => model.model_type) || []);
    setOptimizationEnabled(Boolean(config.enableOptimization));
  }, [experiment?.config, hasUnsavedChanges]);

  useEffect(() => {
    if (!experiment?.config?.selectedFeatures?.length && !hasUnsavedChanges && !selectedFeatures.length) {
      setSelectedFeatures(
        availableColumns.filter((column) => {
          const info = columnMap.get(column);
          return info && info.unique_count > 1 && info.missing_percent < 50;
        }),
      );
    }
  }, [availableColumns, columnMap, experiment?.config?.selectedFeatures, hasUnsavedChanges, selectedFeatures.length]);

  const markChanged = () => {
    setHasUnsavedChanges(true);
    if (validationErrors.length) setValidationErrors([]);
  };

  const handleTaskChange = (nextTask: TaskType) => {
    setTaskType(nextTask);
    const validTargets = nextTask === "classification" ? classificationTargets : numericColumns;
    if (targetColumn && !validTargets.includes(targetColumn)) {
      setTargetColumn("");
      setSelectedFeatures((current) => current.filter((feature) => feature !== targetColumn));
    }
    setSelectedModels([]);
    markChanged();
  };

  const handleTargetChange = (value: string) => {
    const inferredTask = inferTask(value);
    setTargetColumn(value);
    setSelectedFeatures((current) => current.filter((feature) => feature !== value));
    if (inferredTask !== taskType) {
      setTaskType(inferredTask);
      setSelectedModels([]);
      toast({
        title: "Task type inferred",
        description: `${value} looks like a ${inferredTask} target. You can still change the task manually.`,
      });
    }
    markChanged();
  };

  const recommendedFeaturesFor = (target: string) => {
    const recommended = availableColumns.filter((column) => {
      if (column === target || idSet.has(column)) return false;
      const info = columnMap.get(column);
      if (!info || info.unique_count <= 1 || info.missing_percent >= 50) return false;
      if (categoricalSet.has(column)) {
        return info.unique_count <= Math.max(100, Math.floor(rows * 0.25));
      }
      return true;
    });

    return recommended.length
      ? recommended
      : availableColumns.filter((column) => column !== target && !idSet.has(column));
  };

  const applySmartSetup = (preferredTarget?: string) => {
    const target = preferredTarget || targetColumn || targetSuggestions[0]?.column;
    if (!target) {
      toast({
        title: "Choose a target first",
        description: "No reliable target candidate was found automatically.",
        variant: "destructive",
      });
      return;
    }

    const inferredTask = inferTask(target);
    const smartFeatures = recommendedFeaturesFor(target);
    const taskModels = getModelsByTask(inferredTask);
    const modelIds = taskModels.map((model) => model.model_type).slice(0, 4);
    const split = rows < 300 ? 75 : rows > 10000 ? 85 : 80;

    setTargetColumn(target);
    setTaskType(inferredTask);
    setSelectedFeatures(smartFeatures);
    setSelectedModels(modelIds);
    setTrainSplit([split]);
    setOptimizationEnabled(true);
    markChanged();

    toast({
      title: "Smart AutoML setup applied",
      description: `${inferredTask} · ${smartFeatures.length} features · ${modelIds.length} models · ${split}/${100 - split} split`,
    });
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((current) =>
      current.includes(modelId) ? current.filter((id) => id !== modelId) : [...current, modelId],
    );
    markChanged();
  };

  const handleFeatureToggle = (feature: string) => {
    if (feature === targetColumn) {
      toast({ title: "Invalid selection", description: "The target cannot also be a feature.", variant: "destructive" });
      return;
    }
    setSelectedFeatures((current) =>
      current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature],
    );
    markChanged();
  };

  const handleSelectRecommended = () => {
    setSelectedFeatures(recommendedFeaturesFor(targetColumn));
    markChanged();
  };

  const buildValidationErrors = () => {
    const errors: string[] = [];
    if (!targetColumn) errors.push("Choose the target column you want to predict.");
    if (targetColumn && !validTargetColumns.includes(targetColumn)) {
      errors.push(`The selected target is not valid for ${taskType}.`);
    }
    if (!selectedFeatures.length) errors.push("Select at least one usable feature.");
    if (selectedFeatures.includes(targetColumn)) errors.push("The target column cannot also be a feature.");
    const selectedIds = selectedFeatures.filter((feature) => idSet.has(feature));
    if (selectedIds.length) errors.push(`Remove likely ID columns from features: ${selectedIds.join(", ")}.`);
    if (!selectedModels.length) errors.push("Select at least one model to train.");
    return errors;
  };

  const handleSaveConfig = async (): Promise<boolean> => {
    const errors = buildValidationErrors();
    if (errors.length) {
      setValidationErrors(errors);
      toast({ title: "Configuration needs attention", description: errors[0], variant: "destructive" });
      return false;
    }

    setValidationErrors([]);
    setIsSaving(true);
    try {
      const modelLookup = new Map(getModelsByTask(taskType).map((model) => [model.model_type, model]));
      const config = {
        taskType,
        targetColumn,
        selectedFeatures,
        featureTypes: {
          numerical: selectedFeatures.filter((feature) => numericSet.has(feature)),
          categorical: selectedFeatures.filter((feature) => categoricalSet.has(feature)),
        },
        excludedColumns: idColumns,
        trainTestSplit: trainSplit[0] / 100,
        randomSeed: 42,
        models: selectedModels.map((modelType) => ({
          model_type: modelType,
          display_name: modelLookup.get(modelType)?.display_name || modelType,
          preset: "default",
          hyperparameters: {},
          custom_hyperparameters: null,
        })),
        enableOptimization: optimizationEnabled,
      };

      await updateExperiment(experiment.id, { config });
      setHasUnsavedChanges(false);
      toast({ title: "Configuration saved", description: "This experiment is ready for training." });
      return true;
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      const errorsFromApi = Array.isArray(detail)
        ? detail.map((item: any) => item?.msg || String(item))
        : [typeof detail === "string" ? detail : error?.message || "Failed to save configuration."];
      setValidationErrors(errorsFromApi);
      toast({ title: "Save failed", description: errorsFromApi[0], variant: "destructive" });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const validateAndContinue = async () => {
    const errors = buildValidationErrors();
    if (errors.length) {
      setValidationErrors(errors);
      return;
    }

    if (hasUnsavedChanges) {
      const saved = await handleSaveConfig();
      if (!saved) return;
    }
    onNext();
  };

  return (
    <div className="space-y-6">
      {validationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-inside list-disc space-y-1">
              {validationErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/[0.08] via-card to-primary-blue/[0.06]">
        <CardHeader className="border-b border-border/60">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-4 w-4" /> Smart AutoML
              </div>
              <CardTitle>Configure a strong baseline automatically</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                NoCodeML uses transparent dataset heuristics to suggest the task, target, usable features, model comparison set and train/test split. Nothing is locked—you can edit every choice afterward.
              </CardDescription>
            </div>
            <Button onClick={() => applySmartSetup()} className="shrink-0 gap-2" disabled={modelsLoading || !allColumns.length}>
              <Zap className="h-4 w-4" /> Apply Smart Setup
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-background/35 p-3"><div className="text-xs text-muted-foreground">Rows</div><div className="mt-1 font-semibold">{rows.toLocaleString()}</div></div>
            <div className="rounded-2xl border border-border/60 bg-background/35 p-3"><div className="text-xs text-muted-foreground">Usable columns</div><div className="mt-1 font-semibold">{availableColumns.length}</div></div>
            <div className="rounded-2xl border border-border/60 bg-background/35 p-3"><div className="text-xs text-muted-foreground">Likely IDs excluded</div><div className="mt-1 font-semibold">{idColumns.length}</div></div>
            <div className="rounded-2xl border border-border/60 bg-background/35 p-3"><div className="text-xs text-muted-foreground">Models available</div><div className="mt-1 font-semibold">{models.length}</div></div>
          </div>

          {targetSuggestions.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium">Suggested prediction targets</div>
              <div className="flex flex-wrap gap-2">
                {targetSuggestions.map((suggestion) => (
                  <Button
                    key={suggestion.column}
                    type="button"
                    variant={targetColumn === suggestion.column ? "secondary" : "outline"}
                    className="h-auto min-h-10 gap-2 whitespace-normal py-2 text-left"
                    onClick={() => applySmartSetup(suggestion.column)}
                  >
                    <Target className="h-3.5 w-3.5 shrink-0" />
                    <span>{suggestion.column}</span>
                    <Badge variant="outline" className="capitalize">{suggestion.task}</Badge>
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Target suggestions are heuristic. Domain knowledge still wins when the desired outcome is known.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/55">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl"><Settings className="h-5 w-5 text-primary" /> Model Configuration</CardTitle>
          <CardDescription>Fine-tune the prediction task and evaluation split.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div>
            <Label className="mb-2 block">Task type</Label>
            <Select value={taskType} onValueChange={(value: TaskType) => handleTaskChange(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="classification">Classification</SelectItem>
                <SelectItem value="regression">Regression</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">Numeric labels such as 0/1 are supported for classification.</p>
          </div>

          <div>
            <Label className="mb-2 flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Target variable</Label>
            <Select value={targetColumn} onValueChange={handleTargetChange}>
              <SelectTrigger><SelectValue placeholder="Choose what you want to predict" /></SelectTrigger>
              <SelectContent>
                {validTargetColumns.length ? validTargetColumns.map((column) => {
                  const info = columnMap.get(column);
                  return <SelectItem key={column} value={column}>{column}{info ? ` · ${info.unique_count} unique` : ""}</SelectItem>;
                }) : <SelectItem value="__none__" disabled>No valid target columns detected</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label>Train/test split</Label>
              <Badge variant="secondary">{trainSplit[0]}% / {100 - trainSplit[0]}%</Badge>
            </div>
            <Slider
              value={trainSplit}
              onValueChange={(value) => { setTrainSplit(value); markChanged(); }}
              min={60}
              max={90}
              step={5}
            />
            <p className="mt-2 text-xs text-muted-foreground">The test portion remains unseen during model fitting and is used for the reported final metrics.</p>
          </div>
        </CardContent>
      </Card>

      <FeatureSelector
        numericColumns={numericColumns.filter((column) => column !== targetColumn)}
        categoricalColumns={categoricalColumns.filter((column) => column !== targetColumn)}
        idColumns={idColumns}
        allColumns={allColumns}
        selectedFeatures={selectedFeatures}
        onFeatureToggle={handleFeatureToggle}
        onSelectAll={() => { setSelectedFeatures(availableFeatures); markChanged(); }}
        onClearAll={() => { setSelectedFeatures([]); markChanged(); }}
        onSelectRecommended={handleSelectRecommended}
        targetColumn={targetColumn}
      />

      <Card className="border-border/70 bg-card/55">
        <CardHeader>
          <CardTitle className="text-xl">Models to compare</CardTitle>
          <CardDescription>Train multiple algorithms on the same split so the comparison is fair.</CardDescription>
        </CardHeader>
        <CardContent>
          {modelsLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading models…</div>
          ) : models.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No models are available for this task.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {models.map((model) => {
                const checked = selectedModels.includes(model.id);
                return (
                  <div
                    key={model.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleModel(model.id)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") toggleModel(model.id); }}
                    className={`cursor-pointer rounded-2xl border p-4 transition ${checked ? "border-primary/60 bg-primary/[0.08]" : "border-border/60 bg-background/25 hover:border-primary/35"}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={checked}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={() => toggleModel(model.id)}
                        aria-label={`Select ${model.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{model.name}</div>
                        {model.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{model.description}</p>}
                      </div>
                      {checked && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 text-sm text-muted-foreground">{selectedModels.length} model{selectedModels.length === 1 ? "" : "s"} selected</div>
        </CardContent>
      </Card>

      <Card className="border-primary/25 bg-gradient-to-br from-card via-card to-primary/[0.04]">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Sparkles className="h-5 w-5 text-primary" /></div>
              <div>
                <CardTitle className="text-lg">Expert System Optimization</CardTitle>
                <CardDescription className="mt-1">Dataset-aware, transparent rule-based hyperparameter adjustment.</CardDescription>
              </div>
            </div>
            <Switch checked={optimizationEnabled} onCheckedChange={(value) => { setOptimizationEnabled(value); markChanged(); }} />
          </div>
        </CardHeader>
        {optimizationEnabled && (
          <CardContent className="space-y-4">
            <Alert className="border-primary/25 bg-primary/[0.05]">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription>The optimizer records the rules it applied, so results can explain why parameters changed instead of hiding the process.</AlertDescription>
            </Alert>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border/60 p-3"><TrendingUp className="mb-2 h-4 w-4 text-success" /><div className="text-sm font-medium">Dataset-aware</div><div className="mt-1 text-xs text-muted-foreground">Adapts to sample count, dimensionality and imbalance.</div></div>
              <div className="rounded-xl border border-border/60 p-3"><Zap className="mb-2 h-4 w-4 text-warning" /><div className="text-sm font-medium">Overfit controls</div><div className="mt-1 text-xs text-muted-foreground">Adjusts complexity and regularization where appropriate.</div></div>
              <div className="rounded-xl border border-border/60 p-3"><Sparkles className="mb-2 h-4 w-4 text-primary" /><div className="text-sm font-medium">Explainable</div><div className="mt-1 text-xs text-muted-foreground">Every rule can be inspected later in Results.</div></div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.07] via-primary-purple/[0.05] to-primary-blue/[0.07] p-4 sm:p-6">
        <div className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-primary">Configuration summary</div>
        <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
          <div><div className="text-xs text-muted-foreground">Task</div><div className="mt-1 font-semibold capitalize">{taskType}</div></div>
          <div><div className="text-xs text-muted-foreground">Target</div><div className="mt-1 truncate font-semibold">{targetColumn || "Not set"}</div></div>
          <div><div className="text-xs text-muted-foreground">Features</div><div className="mt-1 font-semibold">{selectedFeatures.length}</div></div>
          <div><div className="text-xs text-muted-foreground">Models</div><div className="mt-1 font-semibold">{selectedModels.length}</div></div>
          <div><div className="text-xs text-muted-foreground">Optimization</div><div className="mt-1 font-semibold">{optimizationEnabled ? "On" : "Off"}</div></div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? <Button variant="outline" onClick={onBack}>Back to Data Analysis</Button> : <span />}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => void handleSaveConfig()}
            disabled={isSaving || !targetColumn || !selectedFeatures.length || !selectedModels.length || !hasUnsavedChanges}
          >
            {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : hasUnsavedChanges ? "Save Configuration" : "Saved"}
          </Button>
          <Button
            onClick={() => void validateAndContinue()}
            disabled={isSaving || !targetColumn || !selectedFeatures.length || !selectedModels.length}
            className="gradient-primary text-background"
          >
            {hasUnsavedChanges ? "Save & Continue to Training" : "Continue to Training"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ModelConfigStep;
