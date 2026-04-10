export interface CsvRow {
  audio_id: string;
  speaker_A_audio: string;
  speaker_B_audio: string;
  combined_audio: string;
  transcription: string;
}

export type StepStatus = "pending" | "active" | "complete" | "error";

export type ValidationStatus = "Pass" | "Fail" | "Skipped" | "Pending" | "Processing";

export interface FlaggedSegment {
  segment_index: number;
  issues: string[];
}

export interface TranscriptQcResult {
  verdict: "Pass" | "Warn" | "Fail";
  segment_count: number;
  issues_summary: string;
  rule_counts: Record<string, number>;
  flagged_segments: FlaggedSegment[];
}

export interface RowResult {
  audio_id: string;
  rowIndex: number;
  speaker_A_audio: string;
  speaker_B_audio: string;
  combined_audio: string;
  transcription: string;
  structural_check: "Pass" | "Fail" | "Pending" | "Processing";
  structural_errors: string[];
  accuracy_wer: number | null;
  accuracy_wer_speaker_a: number | null;
  accuracy_wer_speaker_b: number | null;
  accuracy_status: "Pass" | "Fail" | "Skipped" | "Pending" | "Processing";
  transcript_preview?: string;
  transcript_qc?: TranscriptQcResult;
  golden_transcript_a?: string;
  golden_transcript_b?: string;
  asr_transcript_a?: string;
  asr_transcript_b?: string;
}

export interface ValidationConfig {
  minDurationSec: number;
  maxDurationSec: number;
  werThreshold: number;
  concurrency: number;
  languageCode: string;
}

export interface RunSummary {
  totalRows: number;
  structuralPassed: number;
  structuralFailed: number;
  accuracyPassed: number;
  accuracyFailed: number;
  accuracySkipped: number;
  avgWer: number | null;
  qcPassed: number;
  qcWarned: number;
  qcFailed: number;
}

export type AppStep = "upload" | "structural" | "accuracy" | "report";

export type QcMode = "dual" | "single";

export interface SingleSpeakerCsvRow {
  prompt_id: string;
  script: string;
  audio_file: string;
}

export interface SingleSpeakerResult {
  prompt_id: string;
  rowIndex: number;
  audio_file: string;
  script: string;
  asr_transcript: string | null;
  wer: number | null;
  status: "Pass" | "Fail" | "Skipped" | "Pending" | "Processing";
  error?: string;
}

export const QC_RULES: Record<string, { label: string; isSoft: boolean; isNote: boolean }> = {
  R01: { label: "Missing required fields",             isSoft: false, isNote: false },
  R02: { label: "Bad timestamp format (HH:MM:SS)",     isSoft: false, isNote: false },
  R03: { label: "End timestamp before start",          isSoft: false, isNote: false },
  R04: { label: "Empty text segments",                 isSoft: false, isNote: false },
  R06: { label: "Mixed speaker label formats",         isSoft: false, isNote: false },
  R07: { label: "Non-standard speaker label format",   isSoft: false, isNote: false },
  R08: { label: "Gap > 5s between segments",           isSoft: true,  isNote: false },
  R09: { label: "Overlap > 10s between segments",      isSoft: true,  isNote: true  },
  R10: { label: "Zero-duration segments with text",    isSoft: false, isNote: false },
  R12: { label: "Speaker not speaker_a or speaker_b",  isSoft: false, isNote: false },
};
