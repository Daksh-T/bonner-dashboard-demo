export type Status = "Red" | "Yellow" | "Blue" | "Green" | "Exempt";

export interface DataStatus {
  demo_mode?: boolean;
  loaded: boolean;
  active_checkpoint: string;
  users_file: string | null;
  impacts_file: string | null;
  users_rows: number;
  impacts_rows: number;
  member_rows: number;
  active_member_rows: number;
  last_loaded_at: string | null;
}

export interface CheckpointItem {
  name: string;
  date: string;
  requirements: Record<string, number>;
}

export interface CohortInfo {
  id: string;
  label: string;
  is_default?: boolean;
}

export interface CheckpointsResponse {
  active: string;
  cohorts: CohortInfo[];
  program_start: string;
  program_end: string;
  items: CheckpointItem[];
  today: { name: string; date: string; requirements: Record<string, number> };
}

export interface Cohort {
  id: string;
  label: string;
  grad_years: number[];
  is_default: boolean;
}

export interface CheckpointConfig {
  name: string;
  date: string;
  requirements: Record<string, number>;
}

export interface ReflectionConfig {
  fields: string[];
  empty_values: string[];
  blank_rule: "all" | "any";
}

export interface StatusConfig {
  yellow_ratio: number;
  blue_when_zero: boolean;
  recent_window_days: number;
  weight_blue: number;
  weight_red: number;
  weight_yellow: number;
  weight_pace_gap: number;
  weight_stalled: number;
  pending_cap: number;
}

export interface AppConfig {
  program_name: string;
  timezone: string;
  theme: "dark" | "light";
  program_start: string;
  cohorts: Cohort[];
  checkpoints: CheckpointConfig[];
  reflection: ReflectionConfig;
  status: StatusConfig;
  class_labels: Record<string, string>;
  grad_year_field: string;
  class_field: string;
  manual_seniors: string[];
  manual_classes: Record<string, string>;
  data_source: "csv";
  roster_order: string[];
  name_mappings: Record<string, string>;
  message_templates: Record<string, string>;
  onboarding_complete: boolean;
}

export interface MemberRow {
  email: string;
  display_name: string;
  class_label: string;
  status: Status;
  hours: number;
  required: number;
  still_needed: number;
  progress_pct: number;
  pending_hours: number;
  message: string;
  exempt_reason: string;
  is_senior: boolean;
  active_weeks: number;
  avg_week: number;
  pace_needed: number;
  recent_hours: number;
  pace_gap: number;
  pace_ratio: number | null;
  risk_score: number;
}

export interface OverviewResponse {
  status_counts: Record<Status, number>;
  cohort_pulse: {
    week_hours: number;
    week_members: number;
    pending_hours: number;
    pending_members: number;
    avg_progress_pct: number;
    on_track_pct: number;
  };
}

export interface InsightBucket {
  display_name: string;
  email: string;
  status?: string;
  hours?: number;
  pending_hours?: number;
  still_needed?: number;
  active_weeks?: number;
  avg_week?: number;
  recent_hours?: number;
  surge_ratio?: number;
}

export interface InsightsResponse {
  concerning: InsightBucket[];
  consistent: InsightBucket[];
  recent_surge: InsightBucket[];
}

export interface ReflectionMember {
  email: string;
  name: string;
  severity: string;
  blank_reflections: number;
  filled_reflections: number;
  total_impacts: number;
  blank_percent: number;
  partners: string[];
  pattern: string;
  blank_examples: Array<Record<string, unknown>>;
  filled_examples: Array<Record<string, unknown>>;
}
