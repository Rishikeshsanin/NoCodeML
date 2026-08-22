import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { useToast } from '@/hooks/use-toast';
import apiService from '@/services/apiService';

interface TrainingProgress {
  percent: number;
  message: string;
}

interface TrainingResultsSummary {
  total_models: number;
  successful: number;
  failed: number;
  best_model?: {
    model_type: string;
    display_name: string;
    metric: string;
    value: number;
  };
}

interface TrainingRun {
  id: string;
  run_number: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  progress?: TrainingProgress;
  results_summary?: TrainingResultsSummary;
  error_message?: string;
  created_at: string;
}

interface StartRunResponse {
  run_id: string;
  run_number: number;
  created_at: string;
}

interface RunStatusResponse {
  status: TrainingRun['status'];
  progress?: TrainingProgress;
  results_summary?: TrainingResultsSummary;
  error_message?: string;
}

interface TrainingContextType {
  currentRun: TrainingRun | null;
  isTraining: boolean;
  error: string | null;
  startTraining: (experimentId: string) => Promise<void>;
  stopPolling: () => void;
  clearTraining: () => void;
}

const TrainingContext = createContext<TrainingContextType | undefined>(undefined);

export const useTraining = () => {
  const context = useContext(TrainingContext);
  if (!context) {
    throw new Error('useTraining must be used within TrainingProvider');
  }
  return context;
};

const errorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export const TrainingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRun, setCurrentRun] = useState<TrainingRun | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { toast } = useToast();

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsTraining(false);
  };

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const startTraining = async (experimentId: string) => {
    if (isTraining) {
      toast({
        title: 'Training in progress',
        description: 'Please wait for the current training run to complete.',
        variant: 'destructive',
      });
      return;
    }

    stopPolling();
    setError(null);
    setIsTraining(true);

    try {
      const response = (await apiService.training.startRun(experimentId)) as StartRunResponse;

      setCurrentRun({
        id: response.run_id,
        run_number: response.run_number,
        status: 'pending',
        created_at: response.created_at,
      });

      toast({
        title: 'Training started',
        description: `Run #${response.run_number} has been queued.`,
      });

      let pollCount = 0;
      let consecutiveErrors = 0;
      const maxPolls = 1200; // Up to one hour at a 3 second cadence.
      const maxConsecutiveErrors = 8;

      const interval = setInterval(async () => {
        pollCount += 1;

        if (pollCount > maxPolls) {
          stopPolling();
          setError('Training is taking longer than expected. Refresh later to check the run status.');
          return;
        }

        try {
          const status = (await apiService.training.getRunStatus(response.run_id)) as RunStatusResponse;
          consecutiveErrors = 0;

          setCurrentRun((previous) =>
            previous
              ? {
                  ...previous,
                  status: status.status,
                  progress: status.progress,
                  error_message: status.error_message,
                  results_summary: status.results_summary,
                }
              : null,
          );

          if (['completed', 'failed', 'cancelled'].includes(status.status)) {
            stopPolling();

            if (status.status === 'completed') {
              toast({
                title: 'Training complete',
                description: `Run #${response.run_number} finished successfully.`,
              });
            } else {
              const detail = status.error_message || (status.status === 'cancelled' ? 'Training was cancelled.' : 'Training failed.');
              setError(detail);
              toast({
                title: status.status === 'cancelled' ? 'Training cancelled' : 'Training failed',
                description: detail,
                variant: 'destructive',
              });
            }
          }
        } catch (pollError: unknown) {
          consecutiveErrors += 1;
          console.warn('Training status poll failed', pollError);

          if (consecutiveErrors >= maxConsecutiveErrors) {
            stopPolling();
            setError('Lost contact with the training service. Refresh to check whether the run is still active.');
          }
        }
      }, 3000);

      pollingIntervalRef.current = interval;
    } catch (startError: unknown) {
      stopPolling();
      const detail = errorMessage(startError, 'Failed to start training.');
      setError(detail);
      toast({
        title: 'Training failed to start',
        description: detail,
        variant: 'destructive',
      });
    }
  };

  const clearTraining = () => {
    stopPolling();
    setCurrentRun(null);
    setError(null);
  };

  return (
    <TrainingContext.Provider
      value={{
        currentRun,
        isTraining,
        error,
        startTraining,
        stopPolling,
        clearTraining,
      }}
    >
      {children}
    </TrainingContext.Provider>
  );
};

export default TrainingContext;
