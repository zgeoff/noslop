// the store's rows, as SQLite holds them: a list or an object is JSON text, and a boolean is 0 or 1
export interface StoreTables {
  reviews: ReviewRow;
  calls: CallRow;
  findings: FindingRow;
  dropped_findings: DroppedFindingRow;
  dispositions: DispositionRow;
  escapes: EscapeRow;
}

export interface ReviewRow {
  review_id: string;
  repo: string;
  pull_request: number | null;
  base: string;
  head: string;
  title: string | null;
  depth: string;
  special: string | null;
  risk_classes: string;
  lenses: string;
  config_hash: string;
  started_at: string;
  ended_at: string;
}

export interface CallRow {
  review_id: string;
  call_id: string;
  lenses: string;
  depth: string;
  adapter: string;
  model: string | null;
  effort: string;
  status: string;
  attempts: number;
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  duration_ms: number;
}

export interface FindingRow {
  review_id: string;
  finding_id: string;
  lens: string;
  call_id: string | null;
  title: string;
  body: string;
  path: string;
  start_line: number;
  end_line: number;
  second_location: string | null;
  severity: string;
  criterion: string;
  rule: string | null;
  verdict: string;
  unverified_fact: string | null;
  written_by_change: number;
  risk_class: string | null;
  fix: string | null;

  // the depth, model and effort of the call that reported it; null for a direct finding
  depth: string;
  model: string | null;
  effort: string | null;
}

export interface DroppedFindingRow {
  review_id: string;
  lens: string;
  call_id: string | null;
  title: string;
  path: string;
  start_line: number;
  end_line: number;
  criterion: string;
  reason: string;
  rule: string | null;
  rule_quote: string | null;
}

export interface DispositionRow {
  repo: string;
  finding_id: string;
  kind: string;
  value: string;
  author: string;
  author_is_owner: number;
  source: string;
  at: string;

  // the pull request whose thread held the reply; null for a row from before the store kept it
  pull_request: number | null;
}

export interface EscapeRow {
  escape_id: string;
  repo: string;

  // the issue that reports the defect, and the head commit of the change that caused it
  issue: string;
  head: string;
  lens: string | null;
  defect: string;
  path: string | null;
  start_line: number | null;
  end_line: number | null;
  recorded_at: string;
}
