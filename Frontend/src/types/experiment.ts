export interface FeatureTypes {
  numerical: string[];
  categorical: string[];
}

export interface ModelConfig {
  model_type: string;
  display_name: string;
  preset: "fast" | "default";
  hyperparameters: Record<string, unknown>;
  custom_hyperparameters?: Record<string, unknown> | null;
}

export interface ExperimentConfig {
  taskType?: "classification" | "regression";
  targetColumn?: string;
  selectedFeatures?: string[];
  featureTypes?: FeatureTypes;
  excludedColumns?: string[];
  trainTestSplit?: number;
  randomSeed?: number;
  models?: ModelConfig[];
  enableOptimization?: boolean;

  // Deprecated V2 compatibility fields. New V3 code should not write these.
  features?: string[];
  selectedModels?: string[];
}

export interface AppliedRule {
  parameter: string;
  original_value: unknown;
  value: unknown;
  reason: string;
}

export interface DatasetInfo {
  n_samples: number;
  n_features: number;
}

export interface HyperparameterTuning {
  enabled: boolean;
  method: string;
  engine: string;
  rules_evaluated: number;
  rules_applied: number;
  cv_folds: number;
  cv_strategy: string;
  test_score: number;
  applied_rules: AppliedRule[];
  dataset_info: DatasetInfo;
  best_params: Record<string, unknown>;
}

export interface ExperimentResponse {
  id: string;
  name: string;
  datasetId: string;
  datasetName?: string;
  status: "in_progress" | "completed";
  config: ExperimentConfig;
  results?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface ColumnInfo {
  name: string;
  dtype: string;
  missing_count: number;
  missing_percent: number;
  unique_count: number;
  is_id_column: boolean;
  sample_values?: unknown[];
}

export interface NumericColumnStatistics {
  count: number;
  mean: number;
  std: number;
  min: number;
  "25%": number;
  "50%": number;
  "75%": number;
  max: number;
}

export interface EDAResponse {
  dataset_info: {
    id: string;
    name: string;
    row_count: number;
    column_count: number;
    file_size_bytes: number;
    file_name: string;
    memory_usage_bytes: number;
  };
  columns: ColumnInfo[];
  numeric_columns: string[];
  categorical_columns: string[];
  id_columns: string[];
  statistics: Record<string, NumericColumnStatistics>;
  correlations: {
    columns: string[];
    matrix: number[][];
    pairs: Array<{
      col1: string;
      col2: string;
      correlation: number;
    }>;
  } | null;
  missing_data_summary: {
    total_missing: number;
    total_cells: number;
    missing_percent: number;
    columns_with_missing: Array<{
      column: string;
      missing_count: number;
      missing_percent: number;
    }>;
  };
  preview_data: {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    total_rows: number;
    page_size: number;
  };
}
