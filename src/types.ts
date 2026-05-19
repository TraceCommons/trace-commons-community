// Shape of the snapshot JSON the build consumes. Mirrors the design
// in `trace-commons-server`'s
// docs/superpowers/specs/2026-05-19-community-analytics-leaderboard-design.md
// (the `trace_leaderboard_snapshots.contents_jsonb` payload).
//
// Keeping these as plain TypeScript types (not a runtime schema) for
// the first slice. CI will switch to runtime validation (e.g. via
// `zod`) when Slice 2 starts pulling live snapshots from the
// upstream API.

export type LeaderboardWindow = "7d" | "30d" | "all";
export type LeaderboardMetric = "novelty_credit" | "accepted_count";

export interface LeaderboardEntry {
  rank: number;
  display_handle: string;
  /** Score in the snapshot's primary metric. */
  score: number;
  accepted_count: number;
  /** Decimal in [0, 1]. */
  accept_rate: number;
  /** ISO8601 timestamp the contributor first opted in. */
  public_since: string;
}

export interface ContributorProfile {
  display_handle: string;
  bio: string | null;
  public_since: string;
  total_accepted: number;
  total_credit: number;
  rolling_7d_accepted: number;
  rolling_7d_credit: number;
}

export interface CorpusAnalyticsSummary {
  window: LeaderboardWindow;
  total_submissions: number;
  total_accepted: number;
  total_rejected: number;
  /** Decimal in [0, 1]. */
  accept_rate: number;
  /** Histogram bins of novelty score in micros. */
  novelty_histogram: Array<{ bucket_micros: number; count: number }>;
  /** Counts by gate outcome label. */
  gate_outcomes: Record<string, number>;
}

export interface Snapshot {
  snapshot_id: string;
  computed_at: string;
  window: LeaderboardWindow;
  metric: LeaderboardMetric;
  /** Captures the min-cell guard that was in effect at compute time. */
  min_cell_count: number;
  leaderboard: LeaderboardEntry[];
  contributors: Record<string, ContributorProfile>;
  analytics: CorpusAnalyticsSummary;
}
