import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Thresholds (matching SOP) ─────────────────────────────────────────────────
const GAP_THRESHOLD_S     = 5;
const OVERLAP_THRESHOLD_S = 10;

// ── Speaker label patterns ────────────────────────────────────────────────────
// Format A: "Speaker 1", "Speaker A", "Speaker 01"
const LABEL_PATTERN_A = /^Speaker\s+[\dA-Za-z]+$/i;
// Format B: "S1", "SA", "S01"
const LABEL_PATTERN_B = /^S[\dA-Za-z]+$/i;
// Format C (this tool's native format): "speaker_a", "speaker_b", etc.
const LABEL_PATTERN_C = /^speaker_[a-zA-Z0-9]+$/i;
// R12: speaker_a/speaker_b or Speaker A/Speaker B
const VALID_R12_LABELS = new Set(["speaker_a", "speaker_b", "speaker a", "speaker b"]);


const SEGMENT_KEYS = [
  "transcript",
  "transcription",
  "transcriptJson",
  "segments",
  "utterances",
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Segment {
  start?: unknown;
  end?: unknown;
  speaker?: unknown;
  text?: unknown;
  [key: string]: unknown;
}

interface QcIssues {
  R01_missing_fields:           Array<{ index: number; missing: string[] }>;
  R02_bad_timestamp_format:     Array<{ index: number; field: string; value: unknown }>;
  R03_end_before_start:         Array<{ index: number; start: unknown; end: unknown }>;
  R04_empty_text:               Array<{ index: number; at: unknown }>;
  R06_mixed_label_format:       Array<{ note: string }>;
  R07_invalid_label_format:     Array<{ index: number; label: string }>;
  R08_large_gap:                Array<{ index: number; gap_s: string; at: unknown }>;
  R09_large_overlap:            Array<{ index: number; overlap_s: string; at: unknown }>;
  R10_zero_duration:            Array<{ index: number; at: unknown }>;
  R12_invalid_speaker_labels:   Array<{ index: number; label: string }>;
}

interface TranscriptQcResult {
  verdict: "Pass" | "Warn" | "Fail";
  segment_count: number;
  issues_summary: string;
  rule_counts: Record<string, number>;
  flagged_segments: Array<{ segment_index: number; issues: string[] }>;
}

interface ValidationResult {
  audio_id: string;
  structural_check: "Pass" | "Fail";
  structural_errors: string[];
  accuracy_wer: number | null;
  accuracy_wer_speaker_a: number | null;
  accuracy_wer_speaker_b: number | null;
  accuracy_status: "Pass" | "Fail" | "Skipped";
  transcript_preview?: string;
  transcript_qc?: TranscriptQcResult;
  golden_transcript_a?: string;
  golden_transcript_b?: string;
  asr_transcript_a?: string;
  asr_transcript_b?: string;
}

interface RowInput {
  phase: "structural" | "accuracy" | "single_speaker";
  audio_id: string;
  speaker_A_audio: string;
  speaker_B_audio: string;
  combined_audio: string;
  transcription: string;
  prompt_id?: string;
  script?: string;
  audio_file?: string;
  config: {
    minDurationSec: number;
    maxDurationSec: number;
    werThreshold: number;
    languageCode?: string;
  };
}

interface SingleSpeakerResult {
  prompt_id: string;
  wer: number | null;
  status: "Pass" | "Fail" | "Skipped";
  asr_transcript: string | null;
  error?: string;
}

// =============================================================================
// TIMESTAMP UTILITIES
// =============================================================================

function isValidTimestamp(ts: unknown): boolean {
  if (!ts) return false;
  return /^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(String(ts).trim());
}

function toSeconds(ts: unknown): number {
  if (!ts) return 0;
  const parts = String(ts).trim().split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// =============================================================================
// SEGMENT EXTRACTOR — handles all known vendor JSON wrappers
// =============================================================================

function looksLikeSegments(arr: unknown): arr is Segment[] {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const first = arr[0];
  return (
    first !== null &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    Object.prototype.hasOwnProperty.call(first, "start")
  );
}

function searchObject(obj: Record<string, unknown>): Segment[] | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  for (const key of SEGMENT_KEYS) {
    const val = obj[key];
    if (!val) continue;
    if (looksLikeSegments(val)) return val;
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
      const inner = searchObject(val[0] as Record<string, unknown>);
      if (inner) return inner;
    }
    if (typeof val === "object" && !Array.isArray(val)) {
      const inner = searchObject(val as Record<string, unknown>);
      if (inner) return inner;
    }
  }

  for (const key of Object.keys(obj)) {
    if (SEGMENT_KEYS.includes(key)) continue;
    const val = obj[key];
    if (!val) continue;
    if (looksLikeSegments(val)) return val;
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
      const inner = searchObject(val[0] as Record<string, unknown>);
      if (inner) return inner;
    }
    if (typeof val === "object" && !Array.isArray(val)) {
      const inner = searchObject(val as Record<string, unknown>);
      if (inner) return inner;
    }
  }
  return null;
}

function extractSegments(parsed: unknown): Segment[] | null {
  if (looksLikeSegments(parsed)) return parsed as Segment[];

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return parsed as Segment[];
    const first = parsed[0];
    if (typeof first === "object" && !Array.isArray(first) && first !== null) {
      const found = searchObject(first as Record<string, unknown>);
      if (found) return found;
    }
    return parsed as Segment[];
  }

  if (typeof parsed === "object" && parsed !== null) {
    const found = searchObject(parsed as Record<string, unknown>);
    if (found) return found;
  }

  return null;
}

// =============================================================================
// ALL 12 QC RULES (ported from SOP Apps Script + R12 extension)
// =============================================================================

function runTranscriptQC(segments: Segment[]): TranscriptQcResult {
  const issues: QcIssues = {
    R01_missing_fields:           [],
    R02_bad_timestamp_format:     [],
    R03_end_before_start:         [],
    R04_empty_text:               [],
    R06_mixed_label_format:       [],
    R07_invalid_label_format:     [],
    R08_large_gap:                [],
    R09_large_overlap:            [],
    R10_zero_duration:            [],
      R12_invalid_speaker_labels:   [],
  };

  // R06: detect label format mix
  let fmtA = 0, fmtB = 0, fmtC = 0;
  for (const seg of segments) {
    const spk = String(seg.speaker || "").trim();
    if      (LABEL_PATTERN_A.test(spk)) fmtA++;
    else if (LABEL_PATTERN_B.test(spk)) fmtB++;
    else if (LABEL_PATTERN_C.test(spk)) fmtC++;
  }
  const mixedFormats = [fmtA > 0, fmtB > 0, fmtC > 0].filter(Boolean).length > 1;

  // Per-segment checks
  for (let idx = 0; idx < segments.length; idx++) {
    const seg   = segments[idx];
    const spk   = String(seg.speaker || "").trim();
    const text  = String(seg.text ?? "").trim();
    const start = seg.start;
    const end   = seg.end;

    // R01 — Required fields
    const missing: string[] = [];
    if (seg.start   === undefined || seg.start   === null || seg.start   === "") missing.push("start");
    if (seg.end     === undefined || seg.end     === null || seg.end     === "") missing.push("end");
    if (!Object.prototype.hasOwnProperty.call(seg, "speaker") || !spk)          missing.push("speaker");
    if (!Object.prototype.hasOwnProperty.call(seg, "text"))                      missing.push("text");
    if (missing.length > 0) issues.R01_missing_fields.push({ index: idx, missing });

    // R02 — Timestamp format HH:MM:SS.mmm
    if (start && !isValidTimestamp(start))
      issues.R02_bad_timestamp_format.push({ index: idx, field: "start", value: start });
    if (end && !isValidTimestamp(end))
      issues.R02_bad_timestamp_format.push({ index: idx, field: "end", value: end });

    // R03 / R10 — End before start + zero duration
    if (start && end) {
      const s = toSeconds(start);
      const e = toSeconds(end);
      if (e < s)           issues.R03_end_before_start.push({ index: idx, start, end });
      if (e === s && text) issues.R10_zero_duration.push({ index: idx, at: start });
    }

    // R04 — Empty text
    if (!text) issues.R04_empty_text.push({ index: idx, at: start });

    // R06 — Mixed format (recorded once)
    if (mixedFormats && idx === 0)
      issues.R06_mixed_label_format.push({
        note: `File mixes speaker label formats (Format A: ${fmtA}, Format B: ${fmtB}, Format C: ${fmtC}). Use one format consistently.`,
      });

    // R07 — Invalid label format (accepts Format A, B, and C)
    if (spk && !LABEL_PATTERN_A.test(spk) && !LABEL_PATTERN_B.test(spk) && !LABEL_PATTERN_C.test(spk))
      issues.R07_invalid_label_format.push({ index: idx, label: spk });

    // R08 / R09 — Gap and overlap
    if (idx > 0 && start) {
      const prevEnd   = toSeconds(segments[idx - 1].end ?? "0");
      const currStart = toSeconds(start);
      const diff      = currStart - prevEnd;
      if (diff > GAP_THRESHOLD_S)
        issues.R08_large_gap.push({ index: idx, gap_s: diff.toFixed(2), at: start });
      if (diff < -OVERLAP_THRESHOLD_S)
        issues.R09_large_overlap.push({ index: idx, overlap_s: Math.abs(diff).toFixed(2), at: start });
    }

    // R12 — Speaker label must be speaker_a/speaker_b or Speaker A/Speaker B
    if (spk && !VALID_R12_LABELS.has(spk.toLowerCase()))
      issues.R12_invalid_speaker_labels.push({ index: idx, label: spk });
  }

  // ── Verdict ────────────────────────────────────────────────────────────────
  const hardFail =
    issues.R01_missing_fields.length         > 0 ||
    issues.R02_bad_timestamp_format.length   > 0 ||
    issues.R03_end_before_start.length       > 0 ||
    issues.R04_empty_text.length             > 0 ||
    issues.R06_mixed_label_format.length     > 0 ||
    issues.R07_invalid_label_format.length   > 0 ||
    issues.R10_zero_duration.length          > 0;

  const softWarn = issues.R08_large_gap.length > 0;
  const verdict  = hardFail ? "Fail" : softWarn ? "Warn" : "Pass";

  // ── Issues summary ─────────────────────────────────────────────────────────
  const parts: string[] = [];
  if (issues.R01_missing_fields.length > 0)           parts.push(`[R01] ${issues.R01_missing_fields.length} segment(s) missing required fields`);
  if (issues.R02_bad_timestamp_format.length > 0)     parts.push(`[R02] ${issues.R02_bad_timestamp_format.length} bad timestamp(s)`);
  if (issues.R03_end_before_start.length > 0)         parts.push(`[R03] ${issues.R03_end_before_start.length} end<start`);
  if (issues.R04_empty_text.length > 0)               parts.push(`[R04] ${issues.R04_empty_text.length} empty text segment(s)`);
  if (issues.R06_mixed_label_format.length > 0)       parts.push(`[R06] Mixed speaker label formats`);
  if (issues.R07_invalid_label_format.length > 0)     parts.push(`[R07] ${issues.R07_invalid_label_format.length} non-standard label(s)`);
  if (issues.R08_large_gap.length > 0)                parts.push(`[R08] ${issues.R08_large_gap.length} gap(s) > ${GAP_THRESHOLD_S}s`);
  if (issues.R09_large_overlap.length > 0)            parts.push(`[R09] HIL: ${issues.R09_large_overlap.length} overlap(s) > ${OVERLAP_THRESHOLD_S}s`);
  if (issues.R10_zero_duration.length > 0)            parts.push(`[R10] ${issues.R10_zero_duration.length} zero-duration segment(s)`);
  if (issues.R12_invalid_speaker_labels.length > 0)   parts.push(`[R12] ${issues.R12_invalid_speaker_labels.length} label(s) not in {speaker_a, speaker_b}`);

  // ── Rule counts ────────────────────────────────────────────────────────────
  const rule_counts: Record<string, number> = {
    R01: issues.R01_missing_fields.length,
    R02: issues.R02_bad_timestamp_format.length,
    R03: issues.R03_end_before_start.length,
    R04: issues.R04_empty_text.length,
    R06: issues.R06_mixed_label_format.length,
    R07: issues.R07_invalid_label_format.length,
    R08: issues.R08_large_gap.length,
    R09: issues.R09_large_overlap.length,
    R10: issues.R10_zero_duration.length,
    R12: issues.R12_invalid_speaker_labels.length,
  };

  // ── Flagged segments ───────────────────────────────────────────────────────
  const flagMap = new Map<number, string[]>();
  const addFlag = (index: number, reason: string) => {
    if (!flagMap.has(index)) flagMap.set(index, []);
    flagMap.get(index)!.push(reason);
  };

  issues.R01_missing_fields.forEach((i) =>           addFlag(i.index, `R01: missing fields — ${i.missing.join(", ")}`));
  issues.R02_bad_timestamp_format.forEach((i) =>     addFlag(i.index, `R02: bad ${i.field} timestamp — "${i.value}" (expected HH:MM:SS)`));
  issues.R03_end_before_start.forEach((i) =>         addFlag(i.index, `R03: end (${i.end}) before start (${i.start})`));
  issues.R04_empty_text.forEach((i) =>           addFlag(i.index, `R04: empty text at ${i.at}`));
  issues.R07_invalid_label_format.forEach((i) => addFlag(i.index, `R07: non-standard label — "${i.label}"`));
  issues.R08_large_gap.forEach((i) =>                addFlag(i.index, `R08: ${i.gap_s}s gap before this segment`));
  issues.R09_large_overlap.forEach((i) =>            addFlag(i.index, `R09 (HIL): ${i.overlap_s}s overlap with previous segment`));
  issues.R10_zero_duration.forEach((i) =>            addFlag(i.index, `R10: zero-duration with text at ${i.at}`));
  issues.R12_invalid_speaker_labels.forEach((i) =>   addFlag(i.index, `R12: "${i.label}" must be speaker_a or speaker_b`));

  const flagged_segments = Array.from(flagMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([segment_index, issueList]) => ({ segment_index, issues: issueList }));

  return {
    verdict: verdict as "Pass" | "Warn" | "Fail",
    segment_count: segments.length,
    issues_summary: parts.join(" | ") || "No issues found",
    rule_counts,
    flagged_segments,
  };
}

// =============================================================================
// WAV FILE VALIDATION
// =============================================================================

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try { const res = await fetch(url, { ...options, signal: ctrl.signal }); clearTimeout(id); return res; }
  catch (err) { clearTimeout(id); throw err; }
}

function isHtmlResponse(text: string): boolean {
  const t = text.slice(0, 64).toLowerCase();
  return t.includes("<!doctype") || t.includes("<html");
}

function classifyGoogleDriveHtml(html: string): "quota_exceeded" | "access_denied" | "confirm_needed" | "unknown" {
  const lower = html.toLowerCase();

  // Check for virus scan warning / large-file confirmation page FIRST.
  // This page contains a download form and must be handled as confirm_needed,
  // not confused with quota errors (both pages may share some generic text).
  if (
    lower.includes("uc-warning-caption") ||
    lower.includes("uc-warning-subcaption") ||
    lower.includes("virus scan warning") ||
    lower.includes("google drive can") && lower.includes("scan this file for viruses") ||
    lower.includes("too large for google to scan") ||
    lower.includes("download anyway") ||
    html.includes('id="downloadForm"') ||
    html.includes('id="uc-download-link"') ||
    html.includes('name="confirm"') ||
    html.match(/[?&]confirm=([^&"'\s]+)/) !== null ||
    html.match(/href="[^"]*confirm=[^"]*"/) !== null
  ) return "confirm_needed";

  // Quota exceeded — use precise CSS class names Google Drive actually uses,
  // not broad keywords like "quota" that appear on other pages too.
  if (
    lower.includes("uc-error-caption") ||
    lower.includes("uc-error-subcaption") ||
    lower.includes("google drive - quota exceeded") ||
    lower.includes("too many users have viewed or downloaded") ||
    lower.includes("too many users") ||
    lower.includes("can't view or download this file at this time")
  ) return "quota_exceeded";

  if (
    lower.includes("you need permission") ||
    lower.includes("request access") ||
    lower.includes("sign in") ||
    lower.includes("access denied") ||
    lower.includes("private")
  ) return "access_denied";

  return "unknown";
}

function extractGoogleDriveFileId(url: string): string | null {
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /docs\.google\.com\/.*\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isGoogleDriveUrl(url: string): boolean {
  return /drive\.google\.com|docs\.google\.com/.test(url);
}

function makeGoogleDriveErrorResponse(reason: "quota_exceeded" | "access_denied" | "unknown"): Response {
  const messages: Record<string, string> = {
    quota_exceeded: "Google Drive download quota exceeded – too many people have accessed this file recently. Try again later or use a direct hosting service.",
    access_denied:  "Google Drive file is private or requires login. Make sure the file is shared as 'Anyone with the link'.",
    unknown:        "Google Drive could not serve the file. Check that it is publicly shared and try again.",
  };
  return new Response(new TextEncoder().encode(messages[reason]), {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8", "x-gdrive-error": reason },
  });
}

async function fetchGoogleDriveFile(fileId: string, timeoutMs = 30000): Promise<Response> {
  const browserHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://drive.google.com/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };

  // Attempt 1: usercontent direct download with browser headers
  const usercontent = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
  try {
    const resp1 = await fetchWithTimeout(usercontent, { redirect: "follow", headers: browserHeaders }, timeoutMs);
    if (resp1.ok) {
      const ct = resp1.headers.get("content-type") ?? "";
      if (!ct.includes("text/html")) return resp1;

      const html = await resp1.text();
      const cls = classifyGoogleDriveHtml(html);
      if (cls === "quota_exceeded") return makeGoogleDriveErrorResponse("quota_exceeded");
      if (cls === "access_denied")  return makeGoogleDriveErrorResponse("access_denied");

      if (cls === "confirm_needed") {
        const tokenMatches = [
          html.match(/name=["']confirm["']\s+value=["']([^"']+)["']/),
          html.match(/value=["']([^"']+)["']\s+name=["']confirm["']/),
          html.match(/[?&]confirm=([^&"'\s]+)/),
          html.match(/confirm=([A-Za-z0-9_-]+)/),
        ];
        const token = tokenMatches.find(m => m)?.[1] ?? "t";
        const uuidMatch = html.match(/name=["']uuid["']\s+value=["']([^"']+)["']/) ??
                          html.match(/value=["']([^"']+)["']\s+name=["']uuid["']/);
        const uuid = uuidMatch?.[1] ?? "";

        const params = new URLSearchParams({ id: fileId, export: "download", confirm: token });
        if (uuid) params.set("uuid", uuid);

        try {
          const resp2 = await fetchWithTimeout(
            `https://drive.usercontent.google.com/download?${params}`,
            { redirect: "follow", headers: browserHeaders },
            timeoutMs
          );
          if (resp2.ok) {
            const ct2 = resp2.headers.get("content-type") ?? "";
            if (!ct2.includes("text/html")) return resp2;
          }
        } catch { /* fall through */ }
      }
    }
  } catch { /* fall through */ }

  // Attempt 2: legacy uc endpoint with browser headers
  const ucUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  try {
    const resp3 = await fetchWithTimeout(ucUrl, { redirect: "follow", headers: browserHeaders }, timeoutMs);
    if (resp3.ok) {
      const ct3 = resp3.headers.get("content-type") ?? "";
      if (!ct3.includes("text/html")) return resp3;

      const html3 = await resp3.text();
      const cls3 = classifyGoogleDriveHtml(html3);
      if (cls3 === "quota_exceeded") return makeGoogleDriveErrorResponse("quota_exceeded");
      if (cls3 === "access_denied")  return makeGoogleDriveErrorResponse("access_denied");

      if (cls3 === "confirm_needed") {
        const tokenMatches3 = [
          html3.match(/name=["']confirm["']\s+value=["']([^"']+)["']/),
          html3.match(/value=["']([^"']+)["']\s+name=["']confirm["']/),
          html3.match(/[?&]confirm=([^&"'\s]+)/),
          html3.match(/confirm=([A-Za-z0-9_-]+)/),
        ];
        const token3 = tokenMatches3.find(m => m)?.[1] ?? "t";
        const uuidMatch3 = html3.match(/name=["']uuid["']\s+value=["']([^"']+)["']/) ??
                           html3.match(/value=["']([^"']+)["']\s+name=["']uuid["']/);
        const uuid3 = uuidMatch3?.[1] ?? "";

        const params3 = new URLSearchParams({ id: fileId, export: "download", confirm: token3 });
        if (uuid3) params3.set("uuid", uuid3);

        try {
          const resp4 = await fetchWithTimeout(
            `https://drive.usercontent.google.com/download?${params3}`,
            { redirect: "follow", headers: browserHeaders },
            timeoutMs
          );
          if (resp4.ok) {
            const ct4 = resp4.headers.get("content-type") ?? "";
            if (!ct4.includes("text/html")) return resp4;
          }
        } catch { /* fall through */ }
      }
    }
  } catch { /* fall through */ }

  // Attempt 3: googleapis direct media (works for some public files without needing confirm)
  try {
    const resp5 = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { redirect: "follow", headers: browserHeaders },
      timeoutMs
    );
    if (resp5.ok) {
      const ct5 = resp5.headers.get("content-type") ?? "";
      if (!ct5.includes("text/html")) return resp5;
    }
  } catch { /* fall through */ }

  return makeGoogleDriveErrorResponse("unknown");
}

async function fetchAudioBytes(
  url: string,
  timeoutMs = 30000
): Promise<{ ok: boolean; bytes?: Uint8Array; error?: string }> {
  try {
    if (isGoogleDriveUrl(url)) {
      const fileId = extractGoogleDriveFileId(url);
      if (!fileId) return { ok: false, error: "Could not extract file ID from Google Drive URL" };

      const candidates = [
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&authuser=0`,
        `https://drive.usercontent.google.com/uc?id=${fileId}&export=download&confirm=t`,
        `https://drive.google.com/uc?id=${fileId}&export=download&confirm=t&authuser=0`,
      ];

      let lastError = "";
      for (const candidate of candidates) {
        try {
          const r = await fetchWithTimeout(candidate, {
            redirect: "follow",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Referer": "https://drive.google.com/",
              "Accept": "*/*",
              "Accept-Language": "en-US,en;q=0.9",
              "Cache-Control": "no-cache",
            },
          }, timeoutMs);

          if (!r.ok) { lastError = `HTTP ${r.status}`; continue; }

          const reader = r.body?.getReader();
          if (!reader) { lastError = "No response body"; continue; }

          const chunks: Uint8Array[] = [];
          let totalBytes = 0;
          let isHtml = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            totalBytes += value.length;

            if (chunks.length === 1) {
              const preview = new TextDecoder("utf-8", { fatal: false }).decode(value.slice(0, 64));
              if (isHtmlResponse(preview)) {
                isHtml = true;
                reader.cancel();
                break;
              }
            }
          }

          if (isHtml) { lastError = "Got HTML response"; continue; }

          const combined = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }

          return { ok: true, bytes: combined };
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          continue;
        }
      }

      return { ok: false, error: `All Google Drive download attempts failed. Last error: ${lastError}. The file may require login despite appearing public (this happens with links shared from the Google Drive mobile app using 'usp=drivesdk').` };
    }

    const resp = await fetchWithTimeout(url, { redirect: "follow" }, timeoutMs);

    if (!resp.ok && resp.status !== 206) {
      return { ok: false, error: `Failed to fetch audio (HTTP ${resp.status})` };
    }

    const buffer = await resp.arrayBuffer();
    const bytes  = new Uint8Array(buffer);
    const preview = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 64));
    if (isHtmlResponse(preview)) {
      return { ok: false, error: "Audio URL returned HTML – check that the file is publicly accessible" };
    }

    return { ok: true, bytes };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown fetch error" };
  }
}

async function validateWavFile(rawUrl: string, minDur: number, maxDur: number): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  if (!rawUrl?.trim()) return { ok: false, errors: ["Empty URL"] };
  try {
    const fetched = await fetchAudioBytes(rawUrl, 30000);
    if (!fetched.ok || !fetched.bytes) {
      errors.push(fetched.error ?? "Failed to fetch audio file");
      return { ok: false, errors };
    }
    const bytes = fetched.bytes;
    const buf   = bytes.buffer as ArrayBuffer;
    if (bytes.byteLength < 4) { errors.push("File too small"); return { ok: false, errors }; }
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (riff !== "RIFF") { errors.push(`Invalid WAV header: expected 'RIFF', got '${riff}'`); return { ok: false, errors }; }
    if (bytes.byteLength >= 12) {
      const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (wave !== "WAVE") { errors.push(`Invalid WAV marker: got '${wave}'`); return { ok: false, errors }; }
    }

    // Scan RIFF chunks to find fmt and data chunks at their actual offsets
    if (bytes.byteLength >= 16) {
      const view = new DataView(buf);
      let offset = 12;
      let sampleRate = 0, numChannels = 0, bitsPerSample = 0, dataSize = 0;
      let foundData = false;

      while (offset + 8 <= bytes.byteLength) {
        const chunkId   = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
        const chunkSize = view.getUint32(offset + 4, true);

        if (chunkId === "fmt " && chunkSize >= 16 && offset + 8 + 16 <= bytes.byteLength) {
          numChannels  = view.getUint16(offset + 10, true);
          sampleRate   = view.getUint32(offset + 12, true);
          bitsPerSample = view.getUint16(offset + 22, true);
        } else if (chunkId === "data") {
          dataSize  = chunkSize;
          foundData = true;
          break;
        }

        const next = offset + 8 + chunkSize + (chunkSize % 2);
        if (next <= offset) break;
        offset = next;
      }

      if (foundData && sampleRate > 0 && numChannels > 0 && bitsPerSample > 0) {
        const dur = dataSize / (sampleRate * numChannels * (bitsPerSample / 8));
        if (dur < minDur) errors.push(`Audio too short: ${dur.toFixed(1)}s (min ${minDur}s)`);
        if (dur > maxDur) errors.push(`Audio too long: ${dur.toFixed(1)}s (max ${maxDur}s)`);
      }
    }

    return { ok: errors.length === 0, errors };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg.includes("aborted") ? "Request timed out" : `Fetch error: ${msg}`);
    return { ok: false, errors };
  }
}

// =============================================================================
// TRANSCRIPTION FETCH + QC
// =============================================================================

async function fetchAndQcTranscription(rawUrl: string): Promise<{
  ok: boolean;
  errors: string[];
  transcriptText?: string;
  qc?: TranscriptQcResult;
}> {
  if (!rawUrl?.trim()) return { ok: false, errors: ["Empty transcription URL"] };
  try {
    const resp = await fetchWithTimeout(rawUrl, {}, 15000);
    if (!resp.ok) {
      const msg = resp.status === 403 || resp.status === 401 ? `Access denied (HTTP ${resp.status})`
        : resp.status === 404 ? "Transcription file not found (HTTP 404)" : `HTTP ${resp.status}`;
      return { ok: false, errors: [msg] };
    }
    const text = await resp.text();
    if (isHtmlResponse(text)) return { ok: false, errors: ["URL returned HTML instead of JSON"] };

    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return { ok: false, errors: ["File is not valid JSON"] }; }

    const segments = extractSegments(parsed);
    if (!segments) {
      const keys = typeof parsed === "object" && parsed !== null ? Object.keys(parsed as object).join(", ") : typeof parsed;
      return { ok: false, errors: [`Cannot find segments. Top-level keys: ${keys}`] };
    }
    if (segments.length === 0) return { ok: false, errors: ["Segments array is empty"] };

    const qc = runTranscriptQC(segments);

    // Extract golden reference text: always join segment texts (matches Python reference)
    const transcriptText = segments.map((s) => String(s.text ?? "")).join(" ").trim() || undefined;

    // ok = true only if QC did not hard-fail (Warn is still ok for proceeding)
    return { ok: qc.verdict !== "Fail", errors: [], transcriptText, qc };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errors: [msg.includes("aborted") ? "Request timed out" : `Fetch error: ${msg}`] };
  }
}

// =============================================================================
// TEXT NORMALIZATION
// =============================================================================

function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// =============================================================================
// WER (Word Error Rate) — edit-distance based
// =============================================================================

function computeWer(reference: string, hypothesis: string): number {
  const ref = normalizeText(reference).split(" ").filter(Boolean);
  const hyp = normalizeText(hypothesis).split(" ").filter(Boolean);
  if (!ref.length) return hyp.length === 0 ? 0 : 1;
  const dp = Array.from({ length: ref.length + 1 }, (_, i) =>
    Array.from({ length: hyp.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      dp[i][j] = ref[i - 1] === hyp[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return parseFloat((dp[ref.length][hyp.length] / ref.length).toFixed(4));
}

// =============================================================================
// ELEVENLABS SCRIBE V2 — transcribe audio for hypothesis
// =============================================================================

function detectAudioMime(bytes: Uint8Array): { mime: string; ext: string } {
  if (bytes.length >= 4) {
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (riff === "RIFF") return { mime: "audio/wav", ext: "wav" };
  }
  if (bytes.length >= 3) {
    if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) return { mime: "audio/mpeg", ext: "mp3" };
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return { mime: "audio/mpeg", ext: "mp3" };
  }
  if (bytes.length >= 4) {
    const ogg = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (ogg === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  }
  if (bytes.length >= 4 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { mime: "audio/mp4", ext: "m4a" };
  }
  return { mime: "audio/wav", ext: "wav" };
}

async function transcribeWithElevenLabs(
  audioUrl: string,
  apiKey: string,
  languageCode?: string
): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (!audioUrl?.trim()) return { ok: false, error: "Empty audio URL for transcription" };

  try {
    const body: Record<string, unknown> = {
      model_id: "scribe_v2",
      diarize: false,
      url: audioUrl,
    };
    if (languageCode?.trim()) body.language_code = languageCode.trim();

    const resp = await fetchWithTimeout(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      60000
    );

    if (resp.ok) {
      const result = await resp.json();
      if (result && typeof result.text === "string" && result.text.trim()) {
        return { ok: true, text: result.text.trim() };
      }
    }

    const fetched = await fetchAudioBytes(audioUrl, 30000);
    if (!fetched.ok || !fetched.bytes) {
      return { ok: false, error: fetched.error ?? "Failed to fetch audio for transcription" };
    }

    const audioBytes = fetched.bytes;
    if (audioBytes.byteLength < 100) {
      return { ok: false, error: `Audio file too small (${audioBytes.byteLength} bytes)` };
    }

    const { mime, ext } = detectAudioMime(audioBytes);
    const form = new FormData();
    form.append("file", new Blob([audioBytes], { type: mime }), `audio.${ext}`);
    form.append("model_id", "scribe_v2");
    form.append("diarize", "false");
    if (languageCode?.trim()) form.append("language_code", languageCode.trim());

    const resp2 = await fetchWithTimeout(
      "https://api.elevenlabs.io/v1/speech-to-text",
      { method: "POST", headers: { "xi-api-key": apiKey }, body: form },
      60000
    );

    if (!resp2.ok) {
      const errText = await resp2.text().catch(() => "");
      return { ok: false, error: `ElevenLabs API error (HTTP ${resp2.status}): ${errText.slice(0, 200)}` };
    }

    const result2 = await resp2.json();
    if (result2 && typeof result2.text === "string" && result2.text.trim()) {
      return { ok: true, text: result2.text.trim() };
    }

    let words: Array<{ text?: string }> = [];
    if (Array.isArray(result2)) words = result2;
    else if (result2 && Array.isArray(result2.words)) words = result2.words;
    const text = words.map((w) => (typeof w === "object" ? w.text ?? "" : "")).join(" ").trim();
    return { ok: true, text };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg.includes("aborted") ? "ElevenLabs request timed out" : `ElevenLabs fetch error: ${msg}` };
  }
}

// =============================================================================
// PHASE HANDLERS
// =============================================================================

async function handleStructural(body: RowInput): Promise<ValidationResult> {
  const { audio_id, speaker_A_audio, speaker_B_audio, combined_audio, transcription, config } = body;
  const { minDurationSec = 1, maxDurationSec = 600 } = config || {};

  const structuralErrors: string[] = [];

  const [spkA, spkB, comb, txResult] = await Promise.all([
    validateWavFile(speaker_A_audio, minDurationSec, maxDurationSec),
    validateWavFile(speaker_B_audio, minDurationSec, maxDurationSec),
    validateWavFile(combined_audio,  minDurationSec, maxDurationSec),
    fetchAndQcTranscription(transcription),
  ]);

  spkA.errors.forEach((e) => structuralErrors.push(`Speaker A audio: ${e}`));
  spkB.errors.forEach((e) => structuralErrors.push(`Speaker B audio: ${e}`));
  comb.errors.forEach((e) => structuralErrors.push(`Combined audio: ${e}`));
  txResult.errors.forEach((e) => structuralErrors.push(`Transcription: ${e}`));

  if (txResult.qc?.verdict === "Fail") {
    structuralErrors.push(`Transcript QC failed: ${txResult.qc.issues_summary}`);
  }

  const structuralCheck: "Pass" | "Fail" =
    spkA.ok && spkB.ok && comb.ok && txResult.ok ? "Pass" : "Fail";

  return {
    audio_id,
    structural_check: structuralCheck,
    structural_errors: structuralErrors,
    accuracy_wer: null,
    accuracy_wer_speaker_a: null,
    accuracy_wer_speaker_b: null,
    accuracy_status: "Pending",
    transcript_preview: txResult.transcriptText?.slice(0, 120),
    transcript_qc: txResult.qc,
  };
}

async function handleAccuracy(body: RowInput): Promise<ValidationResult> {
  const { audio_id, speaker_A_audio, speaker_B_audio, transcription, config } = body;
  const { werThreshold = 0.15, languageCode = "" } = config || {};

  const elevenLabsApiKey = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

  const skipped = (extra?: Partial<ValidationResult>): ValidationResult => ({
    audio_id,
    structural_check: "Pass",
    structural_errors: [],
    accuracy_wer: null,
    accuracy_wer_speaker_a: null,
    accuracy_wer_speaker_b: null,
    accuracy_status: "Skipped",
    ...extra,
  });

  if (!elevenLabsApiKey) return skipped();

  // Fetch and parse transcription JSON to get per-speaker reference texts
  if (!transcription?.trim()) return skipped();

  let segments: Segment[] | null = null;
  try {
    const resp = await fetchWithTimeout(transcription, {}, 15000);
    if (!resp.ok) return skipped();
    const text = await resp.text();
    if (isHtmlResponse(text)) return skipped();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return skipped(); }
    segments = extractSegments(parsed);
  } catch { return skipped(); }

  if (!segments || segments.length === 0) return skipped();

  // Detect which unique speaker labels appear and map them to A/B by order of first occurrence
  const speakerOrder: string[] = [];
  for (const seg of segments) {
    const spk = String(seg.speaker ?? "").trim().toLowerCase();
    if (spk && !speakerOrder.includes(spk)) speakerOrder.push(spk);
    if (speakerOrder.length >= 2) break;
  }

  const labelA = speakerOrder[0] ?? "";
  const labelB = speakerOrder[1] ?? "";

  const refA = segments
    .filter((s) => String(s.speaker ?? "").trim().toLowerCase() === labelA)
    .map((s) => String(s.text ?? ""))
    .join(" ")
    .trim();

  const refB = segments
    .filter((s) => String(s.speaker ?? "").trim().toLowerCase() === labelB)
    .map((s) => String(s.text ?? ""))
    .join(" ")
    .trim();

  if (!refA && !refB) return skipped();

  // Transcribe each speaker's audio independently — same process as single speaker
  const [asrA, asrB] = await Promise.all([
    refA ? transcribeWithElevenLabs(speaker_A_audio, elevenLabsApiKey, languageCode) : Promise.resolve({ ok: false as const }),
    refB ? transcribeWithElevenLabs(speaker_B_audio, elevenLabsApiKey, languageCode) : Promise.resolve({ ok: false as const }),
  ]);

  const werA = asrA.ok && asrA.text && refA ? computeWer(refA, asrA.text) : null;
  const werB = asrB.ok && asrB.text && refB ? computeWer(refB, asrB.text) : null;

  // Average WER over whichever speakers were successfully evaluated
  const werValues = [werA, werB].filter((v): v is number => v !== null);
  if (werValues.length === 0) {
    return skipped({
      structural_errors: ["Accuracy check failed: transcription failed for both speakers"],
    });
  }

  const avgWer = parseFloat((werValues.reduce((s, v) => s + v, 0) / werValues.length).toFixed(4));
  const transcriptPreview = refA ? refA.slice(0, 120) : refB.slice(0, 120);

  return {
    audio_id,
    structural_check: "Pass",
    structural_errors: [],
    accuracy_wer: avgWer,
    accuracy_wer_speaker_a: werA,
    accuracy_wer_speaker_b: werB,
    accuracy_status: avgWer <= werThreshold ? "Pass" : "Fail",
    transcript_preview: transcriptPreview,
    golden_transcript_a: refA || undefined,
    golden_transcript_b: refB || undefined,
    asr_transcript_a: asrA.ok && asrA.text ? asrA.text : undefined,
    asr_transcript_b: asrB.ok && asrB.text ? asrB.text : undefined,
  };
}

// =============================================================================
// SINGLE SPEAKER HANDLER
// =============================================================================

async function handleSingleSpeaker(body: RowInput): Promise<SingleSpeakerResult> {
  const { prompt_id = "", script = "", audio_file = "", config } = body;
  const { werThreshold = 0.15, languageCode = "" } = config || {};

  const elevenLabsApiKey = Deno.env.get("ELEVENLABS_API_KEY") ?? "";

  if (!elevenLabsApiKey) {
    return {
      prompt_id,
      wer: null,
      status: "Skipped",
      asr_transcript: null,
      error: "ElevenLabs API key not configured",
    };
  }

  if (!script.trim()) {
    return {
      prompt_id,
      wer: null,
      status: "Skipped",
      asr_transcript: null,
      error: "Reference script is empty",
    };
  }

  const asr = await transcribeWithElevenLabs(audio_file, elevenLabsApiKey, languageCode);
  if (!asr.ok || !asr.text) {
    return {
      prompt_id,
      wer: null,
      status: "Skipped",
      asr_transcript: null,
      error: `Transcription failed: ${asr.error ?? "No text returned"}`,
    };
  }

  const wer = computeWer(script, asr.text);

  return {
    prompt_id,
    wer,
    status: wer <= werThreshold ? "Pass" : "Fail",
    asr_transcript: asr.text,
  };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respond({ error: `Failed to read request body: ${message}` }, 400);
  }

  let body: RowInput;
  try {
    body = JSON.parse(rawBody) as RowInput;
  } catch {
    return respond({ error: "Request body is not valid JSON" }, 400);
  }

  try {
    const phase = body.phase ?? "structural";

    let result;
    if (phase === "accuracy") {
      result = await handleAccuracy(body);
    } else if (phase === "single_speaker") {
      result = await handleSingleSpeaker(body);
    } else {
      result = await handleStructural(body);
    }

    return respond(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return respond({ error: message }, 500);
  }
});
