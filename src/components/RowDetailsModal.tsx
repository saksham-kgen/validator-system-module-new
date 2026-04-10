import { X, AlertCircle, CheckCircle2, ExternalLink, Mic, FileText, Activity, FileSearch, AlertTriangle } from "lucide-react";
import { RowResult, TranscriptQcResult, QC_RULES } from "../lib/types";

interface Props {
  row: RowResult;
  onClose: () => void;
}

function LinkCell({ label, url }: { label: string; url: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <a href={url} target="_blank" rel="noreferrer"
        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors truncate max-w-full"
        title={url}
      >
        <ExternalLink size={11} className="shrink-0" />
        <span className="truncate">{url}</span>
      </a>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: "Pass" | "Warn" | "Fail" }) {
  const cls = verdict === "Pass" ? "bg-emerald-100 text-emerald-700"
    : verdict === "Warn" ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";
  const Icon = verdict === "Pass" ? CheckCircle2 : verdict === "Warn" ? AlertTriangle : AlertCircle;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      <Icon size={11} />{verdict}
    </span>
  );
}

function TranscriptQcSection({ qc }: { qc: TranscriptQcResult }) {
  const hasFlaggedSegments = qc.flagged_segments.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileSearch size={14} className="text-gray-400" />
        <h4 className="text-sm font-bold text-gray-700">Transcript QC</h4>
        <VerdictBadge verdict={qc.verdict} />
        <span className="ml-auto text-xs text-gray-400">{qc.segment_count} segments</span>
      </div>

      {/* Per-rule checklist */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rule Results (11 checks)</p>
        {Object.entries(QC_RULES).map(([rule, meta]) => {
          const count = qc.rule_counts[rule] ?? 0;
          const triggered = count > 0;
          const icon = !triggered ? "✅"
            : meta.isNote ? "🔵"
            : meta.isSoft ? "🟡"
            : "❌";
          return (
            <div key={rule} className={`flex items-start gap-2 text-xs py-0.5 ${triggered && !meta.isNote && !meta.isSoft ? "text-red-700 font-medium" : triggered && meta.isSoft ? "text-amber-700" : "text-gray-600"}`}>
              <span className="shrink-0 text-sm leading-none mt-0.5">{icon}</span>
              <span className="font-mono text-gray-400 shrink-0 w-7">{rule}</span>
              <span className="flex-1">{meta.label}</span>
              {triggered && <span className="shrink-0 font-bold">({count})</span>}
            </div>
          );
        })}
      </div>

      {/* Issues summary if any */}
      {qc.issues_summary && qc.issues_summary !== "No issues found" && (
        <div className={`rounded-xl p-3 text-xs leading-relaxed ${qc.verdict === "Fail" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
          {qc.issues_summary.split(" | ").map((part, i) => (
            <p key={i} className="py-0.5">• {part}</p>
          ))}
        </div>
      )}

      {/* Flagged segments */}
      {hasFlaggedSegments && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Flagged Segments ({qc.flagged_segments.length})
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {qc.flagged_segments.map(({ segment_index, issues }) => (
              <div key={segment_index} className="bg-white border border-gray-200 rounded-lg p-2.5">
                <p className="text-xs font-semibold text-gray-600 mb-1">Segment #{segment_index}</p>
                {issues.map((issue, j) => (
                  <p key={j} className="text-xs text-red-600 leading-snug">• {issue}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RowDetailsModal({ row, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <p className="text-xs text-gray-500 font-medium">Row Details</p>
            <h3 className="text-lg font-bold text-gray-900">{row.audio_id}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Links */}
          <div className="grid grid-cols-1 gap-2.5">
            <LinkCell label="Speaker A Audio" url={row.speaker_A_audio} />
            <LinkCell label="Speaker B Audio" url={row.speaker_B_audio} />
            <LinkCell label="Combined Audio"  url={row.combined_audio} />
            <LinkCell label="Transcription JSON" url={row.transcription} />
          </div>

          <div className="border-t border-gray-100" />

          {/* Structural Validation */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Mic size={14} className="text-gray-400" />
              <h4 className="text-sm font-bold text-gray-700">Audio Structural Check</h4>
              <span className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                row.structural_check === "Pass" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}>
                {row.structural_check}
              </span>
            </div>
            {row.structural_errors.length > 0 ? (
              <div className="bg-red-50 rounded-xl p-3 space-y-1.5">
                {row.structural_errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-700">{err}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-emerald-50 rounded-xl p-2.5 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <p className="text-xs text-emerald-700 font-medium">All audio files accessible and valid WAV format</p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* Transcript QC */}
          {row.transcript_qc ? (
            <TranscriptQcSection qc={row.transcript_qc} />
          ) : (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <FileSearch size={13} />
              <span>Transcript QC not available (file could not be fetched)</span>
            </div>
          )}

          <div className="border-t border-gray-100" />

          {/* Accuracy */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-gray-400" />
              <h4 className="text-sm font-bold text-gray-700">Accuracy Validation (WER)</h4>
              <span className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                row.accuracy_status === "Pass" ? "bg-emerald-100 text-emerald-700"
                  : row.accuracy_status === "Fail" ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-500"
              }`}>
                {row.accuracy_status}
              </span>
            </div>

            {row.accuracy_status === "Skipped" ? (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500">Skipped — structural or transcript QC check failed</p>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                {/* Average WER */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 font-medium">Average WER</span>
                  <span className={`text-lg font-bold ${row.accuracy_wer !== null && row.accuracy_wer <= 0.15 ? "text-emerald-600" : "text-red-600"}`}>
                    {row.accuracy_wer !== null ? (row.accuracy_wer * 100).toFixed(1) + "%" : "—"}
                  </span>
                </div>
                {row.accuracy_wer !== null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-400"><span>0%</span><span>100%</span></div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${row.accuracy_wer <= 0.15 ? "bg-emerald-500" : "bg-red-500"}`}
                        style={{ width: `${Math.min(row.accuracy_wer * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Per-speaker WER */}
                {(row.accuracy_wer_speaker_a !== null || row.accuracy_wer_speaker_b !== null) && (
                  <div className="grid grid-cols-2 gap-3">
                    {(["a", "b"] as const).map((spk) => {
                      const wer = spk === "a" ? row.accuracy_wer_speaker_a : row.accuracy_wer_speaker_b;
                      if (wer === null) return null;
                      const pass = wer <= 0.15;
                      return (
                        <div key={spk} className={`rounded-xl p-3 border ${pass ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Speaker {spk.toUpperCase()} WER</p>
                          <p className={`text-base font-bold ${pass ? "text-emerald-700" : "text-red-700"}`}>{(wer * 100).toFixed(1)}%</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Per-speaker transcripts */}
                {(["a", "b"] as const).map((spk) => {
                  const ref = spk === "a" ? row.golden_transcript_a : row.golden_transcript_b;
                  const asr = spk === "a" ? row.asr_transcript_a : row.asr_transcript_b;
                  if (!ref && !asr) return null;
                  return (
                    <div key={spk} className="space-y-2 pt-1 border-t border-gray-200">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Speaker {spk.toUpperCase()} Transcripts</p>
                      {ref && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <FileText size={12} className="text-emerald-500" />
                            <p className="text-xs font-semibold text-gray-600">Reference (from JSON)</p>
                            <span className="ml-auto text-xs text-gray-400">{ref.split(/\s+/).filter(Boolean).length} words</span>
                          </div>
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 max-h-36 overflow-y-auto">
                            <p className="text-xs text-emerald-900 leading-relaxed whitespace-pre-wrap">{ref}</p>
                          </div>
                        </div>
                      )}
                      {asr && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <FileText size={12} className="text-blue-500" />
                            <p className="text-xs font-semibold text-gray-600">ElevenLabs ASR</p>
                            <span className="ml-auto text-xs text-gray-400">{asr.split(/\s+/).filter(Boolean).length} words</span>
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 max-h-36 overflow-y-auto">
                            <p className="text-xs text-blue-900 leading-relaxed whitespace-pre-wrap">{asr}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
