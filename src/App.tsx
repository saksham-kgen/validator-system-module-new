import { useState, useCallback, useRef } from "react";
import { Download, RefreshCw, Database, Zap } from "lucide-react";
import StepIndicator from "./components/StepIndicator";
import UploadStep from "./components/UploadStep";
import ConfigPanel from "./components/ConfigPanel";
import ProcessingView from "./components/ProcessingView";
import ReportTable from "./components/ReportTable";
import SummaryMetrics from "./components/SummaryMetrics";
import ModeSelector from "./components/ModeSelector";
import SingleSpeakerUploadStep from "./components/SingleSpeakerUploadStep";
import SingleSpeakerProcessingView from "./components/SingleSpeakerProcessingView";
import SingleSpeakerResultsTable from "./components/SingleSpeakerResultsTable";
import SingleSpeakerSummary from "./components/SingleSpeakerSummary";
import {
  CsvRow, RowResult, ValidationConfig, RunSummary, AppStep,
  QcMode, SingleSpeakerCsvRow, SingleSpeakerResult,
} from "./lib/types";
import { exportToCsv, exportSingleSpeakerToCsv } from "./lib/reportExporter";
import { supabase, EDGE_FUNCTION_URL } from "./lib/supabase";

const DEFAULT_CONFIG: ValidationConfig = {
  minDurationSec: 1,
  maxDurationSec: 600,
  werThreshold: 0.15,
  concurrency: 10,
  languageCode: "",
};

function buildSummary(rows: RowResult[], _werThreshold: number): RunSummary {
  const structuralPassed = rows.filter((r) => r.structural_check === "Pass").length;
  const accuracyPassed   = rows.filter((r) => r.accuracy_status === "Pass").length;
  const accuracyFailed   = rows.filter((r) => r.accuracy_status === "Fail").length;
  const werRows          = rows.filter((r) => r.accuracy_wer !== null);
  const avgWer           = werRows.length > 0
    ? werRows.reduce((sum, r) => sum + (r.accuracy_wer ?? 0), 0) / werRows.length
    : null;
  const qcRows   = rows.filter((r) => r.transcript_qc);
  const qcPassed = qcRows.filter((r) => r.transcript_qc?.verdict === "Pass").length;
  const qcWarned = qcRows.filter((r) => r.transcript_qc?.verdict === "Warn").length;
  const qcFailed = qcRows.filter((r) => r.transcript_qc?.verdict === "Fail").length;
  return {
    totalRows: rows.length,
    structuralPassed,
    structuralFailed: rows.length - structuralPassed,
    accuracyPassed,
    accuracyFailed,
    accuracySkipped: rows.filter((r) => r.accuracy_status === "Skipped").length,
    avgWer,
    qcPassed,
    qcWarned,
    qcFailed,
  };
}

type PhaseResult = {
  structural_check: "Pass" | "Fail";
  structural_errors: string[];
  accuracy_wer: number | null;
  accuracy_wer_speaker_a: number | null;
  accuracy_wer_speaker_b: number | null;
  accuracy_status: "Pass" | "Fail" | "Skipped";
  transcript_preview?: string;
  transcript_qc?: import("./lib/types").TranscriptQcResult;
  golden_transcript_a?: string;
  golden_transcript_b?: string;
  asr_transcript_a?: string;
  asr_transcript_b?: string;
};

async function callEdgeFunction(
  phase: "structural" | "accuracy",
  row: CsvRow,
  config: ValidationConfig,
  anonKey: string
): Promise<PhaseResult> {
  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        Apikey: anonKey,
      },
      body: JSON.stringify({
        phase,
        audio_id: row.audio_id,
        speaker_A_audio: row.speaker_A_audio,
        speaker_B_audio: row.speaker_B_audio,
        combined_audio: row.combined_audio,
        transcription: row.transcription,
        config: {
          minDurationSec: config.minDurationSec,
          maxDurationSec: config.maxDurationSec,
          werThreshold: config.werThreshold,
          languageCode: config.languageCode,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return {
        structural_check: "Fail",
        structural_errors: [`Validation service error (HTTP ${res.status}): ${errText}`],
        accuracy_wer: null,
        accuracy_wer_speaker_a: null,
        accuracy_wer_speaker_b: null,
        accuracy_status: "Pending",
      };
    }

    const data = await res.json();
    return {
      structural_check:       data.structural_check       ?? "Fail",
      structural_errors:      data.structural_errors      ?? [],
      accuracy_wer:           data.accuracy_wer           ?? null,
      accuracy_wer_speaker_a: data.accuracy_wer_speaker_a ?? null,
      accuracy_wer_speaker_b: data.accuracy_wer_speaker_b ?? null,
      accuracy_status:        data.accuracy_status        ?? "Skipped",
      transcript_preview:     data.transcript_preview,
      transcript_qc:          data.transcript_qc,
      golden_transcript_a:    data.golden_transcript_a,
      golden_transcript_b:    data.golden_transcript_b,
      asr_transcript_a:       data.asr_transcript_a,
      asr_transcript_b:       data.asr_transcript_b,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      structural_check: "Fail",
      structural_errors: [`Network error: ${msg}`],
      accuracy_wer: null,
      accuracy_wer_speaker_a: null,
      accuracy_wer_speaker_b: null,
      accuracy_status: "Pending",
    };
  }
}

async function callSingleSpeakerEdgeFunction(
  row: SingleSpeakerCsvRow,
  config: ValidationConfig,
  anonKey: string
): Promise<{ wer: number | null; status: "Pass" | "Fail" | "Skipped"; asr_transcript: string | null; error?: string }> {
  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        Apikey: anonKey,
      },
      body: JSON.stringify({
        phase: "single_speaker",
        prompt_id: row.prompt_id,
        script: row.script,
        audio_file: row.audio_file,
        config: { werThreshold: config.werThreshold, languageCode: config.languageCode },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      return { wer: null, status: "Skipped", asr_transcript: null, error: `Service error (HTTP ${res.status}): ${errText}` };
    }

    const data = await res.json();
    return {
      wer:            data.wer            ?? null,
      status:         data.status         ?? "Skipped",
      asr_transcript: data.asr_transcript ?? null,
      error:          data.error,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { wer: null, status: "Skipped", asr_transcript: null, error: `Network error: ${msg}` };
  }
}

async function processBatch<T>(
  items: T[],
  concurrency: number,
  processor: (item: T, idx: number) => Promise<void>
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      await processor(items[current], current);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

export default function App() {
  const [mode, setMode] = useState<QcMode>("dual");
  const [appStep, setAppStep] = useState<AppStep>("upload");

  // Dual speaker state
  const [rows, setRows] = useState<CsvRow[]>([]);
  const rowsRef = useRef<CsvRow[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [runId, setRunId] = useState<string | null>(null);

  // Single speaker state
  const [singleRows, setSingleRows] = useState<SingleSpeakerCsvRow[]>([]);
  const singleRowsRef = useRef<SingleSpeakerCsvRow[]>([]);
  const [singleResults, setSingleResults] = useState<SingleSpeakerResult[]>([]);

  const [filename, setFilename] = useState("dataset.csv");
  const filenameRef = useRef("dataset.csv");
  const [config, setConfig] = useState<ValidationConfig>(DEFAULT_CONFIG);
  const configRef = useRef<ValidationConfig>(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false);
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const setFilenameSync = (v: string) => { filenameRef.current = v; setFilename(v); };
  const setConfigSync = (v: ValidationConfig) => { configRef.current = v; setConfig(v); };
  const setIsRunningSync = (v: boolean) => { isRunningRef.current = v; setIsRunning(v); };

  // ── Dual speaker handlers ─────────────────────────────────────────────────
  const handleDualParsed = useCallback((parsedRows: CsvRow[], csvFilename: string) => {
    rowsRef.current = parsedRows;
    setRows(parsedRows);
    setFilenameSync(csvFilename);
    const initial: RowResult[] = parsedRows.map((r, i) => ({
      audio_id: r.audio_id,
      rowIndex: i,
      speaker_A_audio: r.speaker_A_audio,
      speaker_B_audio: r.speaker_B_audio,
      combined_audio: r.combined_audio,
      transcription: r.transcription,
      structural_check: "Pending",
      structural_errors: [],
      accuracy_wer: null,
      accuracy_wer_speaker_a: null,
      accuracy_wer_speaker_b: null,
      accuracy_status: "Pending",
    }));
    setResults(initial);
  }, []);

  const startDualValidation = useCallback(async () => {
    const rows = rowsRef.current;
    const filename = filenameRef.current;
    const config = configRef.current;
    if (rows.length === 0 || isRunningRef.current) return;
    setIsRunningSync(true);

    const { data: runData } = await supabase
      .from("validation_runs")
      .insert({ filename, total_rows: rows.length, status: "processing", config })
      .select("id")
      .single();

    const currentRunId = runData?.id ?? null;
    setRunId(currentRunId);

    const workingResults: RowResult[] = rows.map((r, i) => ({
      audio_id: r.audio_id,
      rowIndex: i,
      speaker_A_audio: r.speaker_A_audio,
      speaker_B_audio: r.speaker_B_audio,
      combined_audio: r.combined_audio,
      transcription: r.transcription,
      structural_check: "Pending",
      structural_errors: [],
      accuracy_wer: null,
      accuracy_wer_speaker_a: null,
      accuracy_wer_speaker_b: null,
      accuracy_status: "Pending",
    }));

    setResults([...workingResults]);
    setAppStep("structural");

    const flushInterval = setInterval(() => {
      setResults([...workingResults]);
    }, 300);

    const accuracyPromises: Promise<void>[] = [];

    const runAccuracyFor = async (idx: number) => {
      workingResults[idx].accuracy_status = "Processing";
      const result = await callEdgeFunction("accuracy", rows[idx], config, anonKey);
      workingResults[idx].accuracy_wer           = result.accuracy_wer;
      workingResults[idx].accuracy_wer_speaker_a = result.accuracy_wer_speaker_a;
      workingResults[idx].accuracy_wer_speaker_b = result.accuracy_wer_speaker_b;
      workingResults[idx].accuracy_status        = result.accuracy_status;
      workingResults[idx].golden_transcript_a    = result.golden_transcript_a;
      workingResults[idx].golden_transcript_b    = result.golden_transcript_b;
      workingResults[idx].asr_transcript_a       = result.asr_transcript_a;
      workingResults[idx].asr_transcript_b       = result.asr_transcript_b;
    };

    await processBatch(rows, config.concurrency, async (row, idx) => {
      workingResults[idx].structural_check = "Processing";
      workingResults[idx].accuracy_status  = "Pending";

      const result = await callEdgeFunction("structural", row, config, anonKey);

      workingResults[idx].structural_check   = result.structural_check;
      workingResults[idx].structural_errors  = result.structural_errors;
      workingResults[idx].transcript_preview = result.transcript_preview;
      workingResults[idx].transcript_qc      = result.transcript_qc;
      workingResults[idx].accuracy_wer       = null;

      if (result.structural_check === "Pass") {
        accuracyPromises.push(runAccuracyFor(idx));
      } else {
        workingResults[idx].accuracy_status = "Pending";
      }
    });

    setAppStep("accuracy");
    await Promise.all(accuracyPromises);

    clearInterval(flushInterval);

    if (currentRunId) {
      await Promise.all(
        rows.map((row, idx) =>
          supabase.from("validation_results").insert({
            run_id: currentRunId,
            audio_id: row.audio_id,
            row_index: idx,
            speaker_a_url: row.speaker_A_audio,
            speaker_b_url: row.speaker_B_audio,
            combined_url: row.combined_audio,
            transcription_url: row.transcription,
            structural_check: workingResults[idx].structural_check,
            structural_errors: workingResults[idx].structural_errors,
            accuracy_wer: workingResults[idx].accuracy_wer,
            accuracy_status: workingResults[idx].accuracy_status,
          })
        )
      );
    }

    setAppStep("report");

    const finalSummary = buildSummary(workingResults, config.werThreshold);
    if (currentRunId) {
      await supabase
        .from("validation_runs")
        .update({
          status: "complete",
          structural_passed: finalSummary.structuralPassed,
          accuracy_passed: finalSummary.accuracyPassed,
          avg_wer: finalSummary.avgWer,
        })
        .eq("id", currentRunId);
    }

    setIsRunningSync(false);
  }, [anonKey]);

  // ── Single speaker handlers ───────────────────────────────────────────────
  const handleSingleParsed = useCallback((parsedRows: SingleSpeakerCsvRow[], csvFilename: string) => {
    singleRowsRef.current = parsedRows;
    setSingleRows(parsedRows);
    setFilenameSync(csvFilename);
    const initial: SingleSpeakerResult[] = parsedRows.map((r, i) => ({
      prompt_id: r.prompt_id,
      rowIndex: i,
      audio_file: r.audio_file,
      script: r.script,
      asr_transcript: null,
      wer: null,
      status: "Pending",
    }));
    setSingleResults(initial);
  }, []);

  const singleWorkingRef = useRef<SingleSpeakerResult[]>([]);

  const startSingleValidation = useCallback(async () => {
    const singleRows = singleRowsRef.current;
    const filename = filenameRef.current;
    const config = configRef.current;
    if (singleRows.length === 0 || isRunningRef.current) return;
    setIsRunningSync(true);

    const { data: runData } = await supabase
      .from("single_speaker_runs")
      .insert({ filename, total_rows: singleRows.length, status: "processing", wer_threshold: config.werThreshold })
      .select("id")
      .maybeSingle();

    const currentRunId = runData?.id ?? null;

    const working: SingleSpeakerResult[] = singleRows.map((r, i) => ({
      prompt_id: r.prompt_id,
      rowIndex: i,
      audio_file: r.audio_file,
      script: r.script,
      asr_transcript: null,
      wer: null,
      status: "Pending",
    }));

    singleWorkingRef.current = working;
    setSingleResults([...working]);
    setAppStep("accuracy");

    const flushInterval = setInterval(() => {
      setSingleResults([...singleWorkingRef.current]);
    }, 500);

    await processBatch(singleRows, config.concurrency, async (row, idx) => {
      working[idx].status = "Processing";

      const result = await callSingleSpeakerEdgeFunction(row, config, anonKey);

      working[idx].wer            = result.wer;
      working[idx].status         = result.status;
      working[idx].asr_transcript = result.asr_transcript;
      working[idx].error          = result.error;
    });

    clearInterval(flushInterval);
    setSingleResults([...working]);

    if (currentRunId) {
      const CHUNK = 500;
      for (let i = 0; i < working.length; i += CHUNK) {
        const chunk = working.slice(i, i + CHUNK).map((r) => ({
          run_id: currentRunId,
          prompt_id: r.prompt_id,
          audio_file: r.audio_file,
          script: r.script,
          asr_transcript: r.asr_transcript,
          wer: r.wer,
          status: r.status,
          error: r.error ?? null,
        }));
        await supabase.from("single_speaker_results").insert(chunk);
      }

      const passed = working.filter((r) => r.status === "Pass").length;
      const werVals = working.filter((r) => r.wer !== null);
      const avgWer = werVals.length > 0
        ? werVals.reduce((s, r) => s + (r.wer ?? 0), 0) / werVals.length
        : null;

      await supabase
        .from("single_speaker_runs")
        .update({ status: "complete", passed_rows: passed, avg_wer: avgWer })
        .eq("id", currentRunId);
    }

    setAppStep("report");
    setIsRunningSync(false);
  }, [anonKey]);

  // ── Shared handlers ───────────────────────────────────────────────────────
  const handleReset = () => {
    setAppStep("upload");
    rowsRef.current = [];
    setRows([]);
    setResults([]);
    singleRowsRef.current = [];
    setSingleRows([]);
    setSingleResults([]);
    setRunId(null);
    setIsRunningSync(false);
  };

  const handleDownload = () => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    if (mode === "single") {
      exportSingleSpeakerToCsv(singleResults, `single-speaker-report-${timestamp}.csv`);
    } else {
      exportToCsv(results, `validation-report-${timestamp}.csv`);
    }
  };

  const summary = buildSummary(results, config.werThreshold);
  const isComplete = appStep === "report" && !isRunning;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-200">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-tight">AudioQA</h1>
              <p className="text-xs text-gray-400">Dataset Validation Pipeline</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isComplete && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-xl font-semibold transition-all shadow-sm shadow-emerald-200 hover:shadow-md active:scale-95"
              >
                <Download size={15} />
                Download Report
              </button>
            )}
            {appStep !== "upload" && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm px-3 py-2 rounded-xl hover:bg-gray-100 transition-all font-medium"
              >
                <RefreshCw size={14} />
                New Run
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="flex justify-center">
          <StepIndicator currentStep={appStep} />
        </div>

        {/* ── Upload step ── */}
        {appStep === "upload" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Upload Audio Dataset CSV</h2>
              <p className="text-sm text-gray-500 mt-1">
                Choose a validation mode and upload a CSV to begin.
              </p>
            </div>

            <ModeSelector mode={mode} onChange={(m) => { setMode(m); handleReset(); }} />

            <div className="border-t border-gray-100" />

            <ConfigPanel config={config} onChange={setConfigSync} />

            {mode === "dual" ? (
              <UploadStep
                onParsed={(parsedRows, csvFilename) => {
                  handleDualParsed(parsedRows, csvFilename);
                  setAppStep("structural");
                }}
              />
            ) : (
              <SingleSpeakerUploadStep
                onParsed={(parsedRows, csvFilename) => {
                  handleSingleParsed(parsedRows, csvFilename);
                  setAppStep("accuracy");
                }}
              />
            )}
          </div>
        )}

        {/* ── Dual: ready to validate ── */}
        {mode === "dual" && (appStep === "structural" || appStep === "accuracy") && !isRunning && rows.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Ready to Validate</h2>
              <p className="text-sm text-gray-500 mt-1">
                {rows.length} rows loaded from <span className="font-medium text-gray-700">{filename}</span>.
              </p>
            </div>

            <ConfigPanel config={config} onChange={setConfigSync} />

            <div className="flex items-center justify-between bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="text-sm text-blue-800 space-y-0.5">
                <p className="font-semibold">Pipeline will run:</p>
                <p className="text-blue-600">1. Structural check on all {rows.length} rows</p>
                <p className="text-blue-600">2. Accuracy check on passing rows only</p>
              </div>
              <button
                onClick={startDualValidation}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-blue-200 hover:shadow-lg active:scale-95 flex items-center gap-2 shrink-0"
              >
                <Zap size={15} />
                Start Validation
              </button>
            </div>
          </div>
        )}

        {/* ── Single: ready to validate ── */}
        {mode === "single" && appStep === "accuracy" && !isRunning && singleRows.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Ready to Validate</h2>
              <p className="text-sm text-gray-500 mt-1">
                {singleRows.length} prompts loaded from <span className="font-medium text-gray-700">{filename}</span>.
              </p>
            </div>

            <ConfigPanel config={config} onChange={setConfigSync} />

            <div className="flex items-center justify-between bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="text-sm text-blue-800 space-y-0.5">
                <p className="font-semibold">Pipeline will run:</p>
                <p className="text-blue-600">Transcribe each audio via ElevenLabs and compute WER against reference script</p>
                <p className="text-blue-600">Threshold: WER &gt; {(config.werThreshold * 100).toFixed(0)}% = Fail</p>
              </div>
              <button
                onClick={startSingleValidation}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-blue-200 hover:shadow-lg active:scale-95 flex items-center gap-2 shrink-0"
              >
                <Zap size={15} />
                Start Validation
              </button>
            </div>
          </div>
        )}

        {/* ── Running ── */}
        {isRunning && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Validation Running</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Processing {mode === "single" ? singleRows.length : rows.length} rows...
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-blue-600 font-medium">
                <Database size={14} className="animate-pulse" />
                Saving to database
              </div>
            </div>
            {mode === "dual" ? (
              <ProcessingView rows={results} currentStep={appStep} totalRows={rows.length} />
            ) : (
              <SingleSpeakerProcessingView rows={singleResults} totalRows={singleRows.length} />
            )}
          </div>
        )}

        {/* ── Report ── */}
        {appStep === "report" && !isRunning && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Validation Report</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {filename} — {mode === "single" ? singleResults.length : results.length} rows processed
                    {mode === "dual" && runId && (
                      <span className="text-xs text-gray-400 ml-2">Run ID: {runId.slice(0, 8)}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-xl font-semibold transition-all shadow-sm active:scale-95"
                >
                  <Download size={14} />
                  Download CSV
                </button>
              </div>

              {mode === "dual" ? (
                <SummaryMetrics summary={summary} />
              ) : (
                <SingleSpeakerSummary rows={singleResults} werThreshold={config.werThreshold} />
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-base font-bold text-gray-900 mb-4">Detailed Results</h3>
              {mode === "dual" ? (
                <ReportTable rows={results} werThreshold={config.werThreshold} />
              ) : (
                <SingleSpeakerResultsTable rows={singleResults} werThreshold={config.werThreshold} />
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 mt-16 py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-gray-400">
          <span>AudioQA — Audio Dataset Validation Pipeline</span>
          <span>Powered by Supabase Edge Functions</span>
        </div>
      </footer>
    </div>
  );
}
