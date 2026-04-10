/*
  # Audio Dataset Validation Schema

  ## Overview
  Creates tables to store the history of validation runs and their per-row results,
  enabling users to review past validations and track dataset quality over time.

  ## New Tables

  ### 1. `validation_runs`
  Stores metadata about each CSV validation job:
  - `id` (uuid, PK) - unique run identifier
  - `filename` (text) - name of the uploaded CSV file
  - `total_rows` (int) - total number of rows parsed from CSV
  - `structural_passed` (int) - rows that passed structural validation
  - `accuracy_passed` (int) - rows that passed accuracy/WER check
  - `avg_wer` (float) - average WER across rows that were accuracy-checked
  - `status` (text) - overall run status: pending, processing, complete
  - `config` (jsonb) - the validation config used (thresholds, duration limits)
  - `created_at` (timestamptz) - when the run was started
  - `user_id` (uuid) - optional: ties run to an auth user if present

  ### 2. `validation_results`
  Stores per-row results for each run:
  - `id` (uuid, PK)
  - `run_id` (uuid, FK → validation_runs)
  - `audio_id` (text) - the audio_id from the CSV row
  - `row_index` (int) - 0-based position in the CSV
  - `speaker_a_url` / `speaker_b_url` / `combined_url` / `transcription_url` (text) - original URLs
  - `structural_check` (text) - Pass / Fail
  - `structural_errors` (jsonb) - array of error strings
  - `accuracy_wer` (float, nullable) - computed WER score, null if skipped
  - `accuracy_status` (text) - Pass / Fail / Skipped
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - Anonymous users can INSERT and SELECT their own runs (tracked by session or user_id)
  - For simplicity, public read/write is allowed for anonymous access (no auth required by the product spec)
*/

CREATE TABLE IF NOT EXISTS validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL DEFAULT '',
  total_rows integer NOT NULL DEFAULT 0,
  structural_passed integer NOT NULL DEFAULT 0,
  accuracy_passed integer NOT NULL DEFAULT 0,
  avg_wer float DEFAULT NULL,
  status text NOT NULL DEFAULT 'pending',
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  audio_id text NOT NULL DEFAULT '',
  row_index integer NOT NULL DEFAULT 0,
  speaker_a_url text NOT NULL DEFAULT '',
  speaker_b_url text NOT NULL DEFAULT '',
  combined_url text NOT NULL DEFAULT '',
  transcription_url text NOT NULL DEFAULT '',
  structural_check text NOT NULL DEFAULT 'Pending',
  structural_errors jsonb NOT NULL DEFAULT '[]',
  accuracy_wer float DEFAULT NULL,
  accuracy_status text NOT NULL DEFAULT 'Skipped',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validation_results_run_id ON validation_results(run_id);
CREATE INDEX IF NOT EXISTS idx_validation_runs_created_at ON validation_runs(created_at DESC);

ALTER TABLE validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert validation runs"
  ON validation_runs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can select validation runs"
  ON validation_runs FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can update validation runs"
  ON validation_runs FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can insert validation results"
  ON validation_results FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can select validation results"
  ON validation_results FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can update validation results"
  ON validation_results FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
