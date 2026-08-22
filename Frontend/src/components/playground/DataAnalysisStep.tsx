import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowRight, Loader2, BarChart3 } from "lucide-react";
import { useExperiment } from "@/contexts/ExperimentContext";
import { useEDA } from "@/hooks/useEDA";
import { DatasetOverview } from "./DatasetOverview";
import { DetailedAnalysis } from "./DetailedAnalysis";
import { VisualizationPanel } from "./VisualizationPanel";
import DataReadinessPanel from "./DataReadinessPanel";
import { toast } from "sonner";

interface DataAnalysisStepProps {
  onNext?: () => void;
}

export const DataAnalysisStep = ({ onNext }: DataAnalysisStepProps) => {
  const { currentExperiment } = useExperiment();
  const datasetId = currentExperiment?.datasetId;

  const { edaData, isLoading, error, loadEDASummary } = useEDA(datasetId);
  const [activeTab, setActiveTab] = useState("overview");
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = () => {
    if (retryCount < 3) {
      setRetryCount(retryCount + 1);
      setTimeout(() => {
        loadEDASummary(true);
      }, Math.pow(2, retryCount) * 1000);
    } else {
      toast.error("Maximum retry attempts reached. Please refresh the page.");
    }
  };

  if (isLoading && !edaData) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <CardTitle>Loading Data Analysis...</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to Load Data Analysis</AlertTitle>
          <AlertDescription className="mt-2">
            {error}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={handleRetry} variant="outline" size="sm">
                Retry {retryCount > 0 && `(${retryCount}/3)`}
              </Button>
              <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                Refresh Page
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!edaData) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No data available</p>
              <p className="text-sm text-muted-foreground mt-2">Please select a dataset to analyze</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DataReadinessPanel edaData={edaData} />

      <Card className="border-border/70 bg-card/55">
        <CardHeader>
          <CardTitle className="text-2xl">Data Analysis</CardTitle>
          <p className="text-sm text-muted-foreground">
            Explore statistics, visualizations, relationships and detailed column information before training.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="overflow-x-auto pb-1">
              <TabsList className="grid min-w-[430px] w-full grid-cols-3">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="detailed">Detailed Analysis</TabsTrigger>
                <TabsTrigger value="visualize">Visualizations</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="space-y-4">
              <DatasetOverview
                datasetInfo={edaData.dataset_info}
                previewData={edaData.preview_data}
                missingDataSummary={edaData.missing_data_summary}
              />
            </TabsContent>

            <TabsContent value="detailed" className="space-y-4">
              <DetailedAnalysis
                columns={edaData.columns}
                statistics={edaData.statistics}
                correlations={edaData.correlations}
                numericColumns={edaData.numeric_columns}
                idColumns={edaData.id_columns}
              />
            </TabsContent>

            <TabsContent value="visualize" className="space-y-4">
              <VisualizationPanel
                datasetId={datasetId || ""}
                numericColumns={edaData.numeric_columns}
                categoricalColumns={edaData.categorical_columns}
                idColumns={edaData.id_columns}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={() => window.history.back()}>
          Back to Experiments
        </Button>
        {onNext && (
          <Button onClick={onNext} className="gap-2">
            Continue to Model Config
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default DataAnalysisStep;
