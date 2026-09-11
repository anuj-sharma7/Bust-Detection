/**
 * Types mirroring the FastAPI response models in `backend/app/schemas.py`.
 * They are the contract between the two halves of the system; when the
 * backend swaps its baseline model for a trained one, these do not change.
 */

export type RiskCategory = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';

export interface LocationRef {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  featured?: boolean;
}

export interface VariableRef {
  id: string;
  label: string;
  unit: string;
  axis_label: string;
}

export interface ModelRef {
  id: string;
  label: string;
  centre: string;
  skill: number;
  has_ensemble: boolean;
}

export interface RiskBand {
  name: RiskCategory;
  min: number;
  max: number;
  color: string;
}

export interface ScenarioRef {
  id: string;
  title: string;
  summary: string;
  expected_band: RiskCategory;
  location_id: string;
  variable_id: string;
  model_id: string;
  horizon: number;
  base_date: string;
}

export interface Selection {
  location_id: string;
  variable_id: string;
  model_id: string;
  horizon: number;
  base_date: string;
  scenario_id?: string;
}

export interface Meta {
  app_name: string;
  tagline: string;
  version: string;
  data_mode: string;
  demo_notice: string | null;
  reference_date: string;
  locations: LocationRef[];
  regions: LocationRef[];
  variables: VariableRef[];
  models: ModelRef[];
  risk_bands: RiskBand[];
  horizons: number[];
  scenarios: ScenarioRef[];
  default_selection: Selection;
  disclaimer: string;
}

export interface FeatureContribution {
  feature: string;
  label: string;
  description: string;
  value: number;
  contribution: number;
  direction: 'increases' | 'decreases';
}

export interface EnsembleDay {
  lead: number;
  label: string;
  date: string;
}

export interface EnsembleMember {
  member: number;
  values: number[];
}

export interface EnsemblePayload {
  days: EnsembleDay[];
  members: EnsembleMember[];
  member_count: number;
  plotted_member_count: number;
  mean: number[];
  deterministic: number[];
  observed: (number | null)[];
  percentiles: Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90', number[]>;
  unit: string;
  axis_label: string;
  spread_anomaly: number;
  high_spread: boolean;
  spread_at_horizon: number;
  range_at_horizon: [number, number];
  climatological_spread: number;
  explanation: string;
}

export interface ModelComparisonRow {
  model_id: string;
  model: string;
  centre: string;
  forecast_value: number;
  unit: string;
  ensemble_spread: number;
  spread_label: string;
  risk_score: number;
  risk_category: RiskCategory;
  forecast_confidence: number;
  historical_skill: number;
}

export interface Analogue {
  rank: number;
  id: string;
  date: string;
  region: string;
  regime: string;
  pattern: string;
  similarity: number;
  bust_occurred: boolean;
  outcome: string;
  verified_error: string;
}

export interface TimelineRow {
  lead_time: number;
  label: string;
  init_date: string;
  risk_score: number;
  risk_category: RiskCategory;
  forecast_confidence: number;
}

export interface HorizonRow {
  horizon: number;
  label: string;
  valid_date: string;
  risk_score: number;
  risk_category: RiskCategory;
  forecast_confidence: number;
  model_confidence: number;
}

export interface VerificationSeriesPoint {
  date: string;
  forecast: number;
  observed: number;
  error: number;
  bust: boolean;
}

export interface ForecastVerification {
  series: VerificationSeriesPoint[];
  unit: string;
  metrics: {
    rmse: number;
    mae: number;
    bias: number;
    acc: number;
    skill: number;
    sample_size: number;
    bust_count: number;
    reference?: string;
  };
}

export interface RiskResponse {
  location: LocationRef;
  variable: { id: string; label: string; unit: string };
  model: { id: string; label: string; centre: string };
  forecast_horizon: number;
  base_date: string;
  valid_date: string;
  risk_score: number;
  risk_category: RiskCategory;
  confidence: number;
  forecast_confidence: number;
  model_confidence: number;
  features: Record<string, number>;
  feature_contributions: FeatureContribution[];
  base_value: number;
  explanation: string;
  explanation_label: string;
  explanation_method: string;
  synoptic: {
    regime: string;
    next_regime: string;
    regime_change: number;
    transition_day: number;
    event_day: number;
  };
  ensemble: EnsemblePayload;
  model_comparison: {
    rows: ModelComparisonRow[];
    spread_between_models: number;
    disagreement: boolean;
    message: string;
  };
  analogues: Analogue[];
  analogue_summary: {
    best_similarity: number;
    bust_count: number;
    total: number;
    note: string;
  };
  persistence_history: { init_date: string; lead_time: number; value: number }[];
  horizon_profile: HorizonRow[];
  risk_timeline: TimelineRow[];
  verification: ForecastVerification;
  observation_source: { verified_against: string; real: boolean; window: [string, string] };
  data_mode: string;
  demo_notice: string | null;
  disclaimer: string;
  generated_at: string;
  scenario?: { id: string; title: string; summary: string; expected_band: RiskCategory };
}

export interface NetworkSite {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  featured: boolean;
  risk_score: number;
  risk_category: RiskCategory;
  forecast_confidence: number;
  model_confidence: number;
  ensemble_spread: number;
  regime_change: number;
  regime: string;
  top_driver: string;
}

export interface NetworkResponse {
  sites: NetworkSite[];
  counts: Record<RiskCategory, number>;
  high_risk_areas: number;
  highest_risk: NetworkSite | null;
  mean_model_confidence: number;
  network_size: number;
  variable_id: string;
  horizon: number;
  model_id: string;
  base_date: string;
  data_mode: string;
  demo_notice: string | null;
}

export interface Alert {
  id: string;
  location_id: string;
  location_name: string;
  state: string;
  lat: number;
  lon: number;
  variable_id: string;
  variable_label: string;
  horizon: number;
  valid_date: string;
  issued_at: string;
  risk_score: number;
  bust_probability: number;
  severity: RiskCategory;
  model_confidence: number;
  forecast_confidence: number;
  reason: string;
  headline: string;
  status: string;
  recommended_action: string;
}

export interface AlertsResponse {
  alerts: Alert[];
  counts: Record<RiskCategory, number>;
  threshold: number;
  probability_threshold: number;
  base_date: string;
  data_mode: string;
  demo_notice: string | null;
  disclaimer: string;
}

export interface ModelPerformance {
  operating_threshold: number;
  sample_size: number;
  base_rate: number;
  roc_auc: number;
  brier_score: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  confusion_matrix: {
    true_positive: number;
    false_positive: number;
    false_negative: number;
    true_negative: number;
  };
  roc_curve: { fpr: number; tpr: number; threshold: number }[];
  reliability: { bin: string; predicted: number; observed: number; count: number }[];
  band_reliability: {
    band: RiskCategory;
    range: string;
    observed_bust_rate: number;
    count: number;
    share: number;
  }[];
  score_interpretation: string;
  model: {
    name: string;
    version: string;
    kind: string;
    trained: boolean;
    weights: Record<string, number>;
    coefficients: Record<string, number>;
    intercept: number;
    training: {
      rows: number;
      train_rows: number;
      test_rows: number;
      base_rate: number;
      roc_auc_train: number;
      roc_auc_holdout: number;
      split: string;
      cutoff_date: string;
      source: string;
    };
    explanation_method: string;
    notice: string;
  };
}

export interface VerificationResponse {
  model_performance: ModelPerformance;
  label: string;
  data_mode: string;
  demo_notice: string | null;
  disclaimer: string;
}

export interface SystemStatus {
  data_mode: string;
  demo_notice: string | null;
  sources: { id: string; name: string; role: string; status: string; detail: string }[];
  pipeline: { stage: string; status: string; detail: string }[];
  model: ModelPerformance['model'];
  reference_date: string;
  ensemble_members: number;
  database: string;
  disclaimer: string;
}


export interface ClimateTrend {
  slope_per_decade: number;
  percent_per_decade: number;
  z: number;
  p_value: number;
  significant: boolean;
  direction: string;
}

export interface ClimateProfile {
  subdivision: string;
  location_id: string;
  location_name: string;
  record: { start: number; end: number; years: number };
  annual_mean: number;
  monsoon_mean: number;
  monsoon_share: number;
  variability: number;
  trend: ClimateTrend | null;
  categories: { category: string; years: number; frequency: number; range: string }[];
  decades: { decade: number; label: string; mean: number; departure_pct: number; years: number }[];
  extremes: {
    wettest: { year: number; monsoon: number; departure_pct: number; category: string }[];
    driest: { year: number; monsoon: number; departure_pct: number; category: string }[];
  };
  baseline_shift: {
    early_period: string;
    late_period: string;
    early_mean: number;
    late_mean: number;
    change_pct: number;
    early_variability: number;
    late_variability: number;
  } | null;
  series: { year: number; monsoon: number; annual: number }[];
  source: { name: string; publisher: string; method: string };
}

export interface DataSource {
  id: string;
  name: string;
  agency: string;
  country: string;
  portal: string;
  role: string;
  variables: string[];
  resolution: string;
  coverage: string;
  fmt: string;
  access: string;
  how_to_get: string;
  licence: string;
  feeds: string;
  notes: string;
  status: string;
  docs: string[];
}

export interface SourcesResponse {
  sources: DataSource[];
  in_use: string[];
  counts: Record<string, number>;
  note: string;
}
