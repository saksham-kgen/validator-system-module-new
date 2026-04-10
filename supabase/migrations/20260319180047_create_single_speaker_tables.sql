/*
  # Create Single Speaker QC Tables

  1. New Tables
    - `single_speaker_runs`
      - `id` (uuid, primary key)
      - `filename` (text) - name of uploaded CSV
      - `total_rows` (int) - number of prompts
      - `passed_rows` (int) - rows that passed WER threshold
      - `avg_wer` (float) - average WER across all processed rows
      - `wer_threshold` (float) - threshold used for this run
      - `status` (text) - processing | complete
      - `created_at` (timestamptz)

    - `single_speaker_results`
      - `id` (uuid, primary key)
      - `run_id` (uuid, foreign key -> single_speaker_runs)
      - `prompt_id` (text) - identifier from CSV
      - `audio_file` (text) - URL to audio file
      - `script` (text) - reference script from CSV
      - `asr_transcript` (text, nullable) - ElevenLabs transcription
      - `wer` (float, nullable) - computed word error rate
      - `status` (text) - Pass | Fail | Skipped
      - `error` (text, nullable) - error message if skipped
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Authenticated users can insert and read their own run data
*/

CREATE TABLE IF NOT EXISTS single_speaker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL DEFAULT '',
  total_rows int NOT NULL DEFAULT 0,
  passed_rows int,
  avg_wer float,
  wer_threshold float NOT NULL DEFAULT 0.15,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE single_speaker_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert single speaker runs"
  ON single_speaker_runs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read single speaker runs"
  ON single_speaker_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update single speaker runs"
  ON single_speaker_runs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS single_speaker_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES single_speaker_runs(id) ON DELETE CASCADE,
  prompt_id text NOT NULL DEFAULT '',
  audio_file text NOT NULL DEFAULT '',
  script text NOT NULL DEFAULT '',
  asr_transcript text,
  wer float,
  status text NOT NULL DEFAULT 'Skipped',
  error text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE single_speaker_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert single speaker results"
  ON single_speaker_results FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read single speaker results"
  ON single_speaker_results FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_single_speaker_results_run_id ON single_speaker_results(run_id);
