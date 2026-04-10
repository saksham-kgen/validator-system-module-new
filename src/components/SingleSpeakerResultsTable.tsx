import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { SingleSpeakerResult } from "../lib/types";
import { computeWordDiff, DiffToken } from "../lib/textDiff";

interface Props {
  rows: SingleSpeakerResult[];
  werThreshold: number;
}

type SortKey = "prompt_id" | "wer" | "status";
type SortDir = "asc" | "desc";

function WerBadge({ wer, threshold }: { wer: number | null; threshold: number }) {
  if (wer === null) return <span className="text-xs text-gray-400">—</span>;
  const pct = (wer * 100).toFixed(1) + "%";
  const fail = wer > threshold;
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${
      fail ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
    }`}>
      {pct}
    </span>
  );
}

function StatusBadge({ status }: { status: SingleSpeakerResult["status"] }) {
  const cls =
    status === "Pass"       ? "bg-emerald-100 text-emerald-700" :
    status === "Fail"       ? "bg-red-100 text-red-700" :
    status === "Skipped"    ? "bg-gray-100 text-gray-500" :
    status === "Processing" ? "bg-blue-100 text-blue-600 animate-pulse" :
                              "bg-gray-100 text-gray-400";
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

function TokenSpan({ token }: { token: DiffToken }) {
  const cls =
    token.tag === "equal"   ? "" :
    token.tag === "replace" ? "bg-amber-200 text-amber-900 rounded px-0.5" :
    token.tag === "delete"  ? "bg-red-200 text-red-900 line-through rounded px-0.5" :
                              "bg-emerald-200 text-emerald-900 rounded px-0.5";
  return <span className={cls}>{token.text} </span>;
}

function DiffPanel({
  label,
  tokens,
  wordCount,
  side,
  empty,
}: {
  label: string;
  tokens: DiffToken[];
  wordCount: number;
  side: "ref" | "hyp";
  empty?: boolean;
}) {
  const dotColor  = side === "ref" ? "bg-emerald-500" : "bg-blue-500";
  const border    = side === "ref" ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50";
  const labelCls  = side === "ref" ? "text-emerald-800" : "text-blue-800";
  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <p className={`text-xs font-bold uppercase tracking-wide ${labelCls}`}>{label}</p>
        <span className="ml-auto text-xs text-gray-400 shrink-0">{wordCount} words</span>
      </div>
      <div className={`border rounded-xl p-3.5 max-h-56 overflow-y-auto leading-7 text-sm ${border}`}>
        {empty ? (
          <span className="text-gray-400 italic text-xs">Not available</span>
        ) : (
          tokens.map((t, i) => <TokenSpan key={i} token={t} />)
        )}
      </div>
    </div>
  );
}

function DiffLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
      <span className="font-semibold uppercase tracking-wide text-gray-400 mr-1">Legend:</span>
      <span><span className="bg-amber-200 text-amber-900 rounded px-1.5 py-0.5">word</span> substitution</span>
      <span><span className="bg-red-200 text-red-900 line-through rounded px-1.5 py-0.5">word</span> deletion (ref only)</span>
      <span><span className="bg-emerald-200 text-emerald-900 rounded px-1.5 py-0.5">word</span> insertion (hyp only)</span>
    </div>
  );
}

interface ExpandedRowProps {
  row: SingleSpeakerResult;
  threshold: number;
}

function ExpandedRow({ row, threshold }: ExpandedRowProps) {
  const werFail   = row.wer !== null && row.wer > threshold;
  const hasDiff   = !!(row.asr_transcript && row.script);
  const refWords  = row.script.trim().split(/\s+/).filter(Boolean).length;
  const hypWords  = row.asr_transcript ? row.asr_transcript.trim().split(/\s+/).filter(Boolean).length : 0;

  const { refTokens, hypTokens } = hasDiff
    ? computeWordDiff(row.script, row.asr_transcript!)
    : { refTokens: [], hypTokens: [] };

  return (
    <tr>
      <td colSpan={4} className="px-6 py-0 bg-gray-50/60 border-b border-gray-100">
        <div className="py-5 space-y-5">
          {row.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
              {row.error}
            </div>
          )}

          {row.wer !== null && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">WER Score</p>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${werFail ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(row.wer * 100, 100)}%` }}
                  />
                </div>
                <span className={`text-xl font-bold shrink-0 tabular-nums ${werFail ? "text-red-600" : "text-emerald-600"}`}>
                  {(row.wer * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Text Comparison
              </p>
              {hasDiff && (
                <span className="text-xs text-gray-400">
                  ({refWords} ref / {hypWords} hyp tokens)
                </span>
              )}
            </div>
            {hasDiff && <DiffLegend />}
            <div className="flex gap-4">
              <DiffPanel
                label="Reference Script"
                tokens={hasDiff ? refTokens : row.script ? [{ text: row.script, tag: "equal" }] : []}
                wordCount={refWords}
                side="ref"
                empty={!row.script}
              />
              <DiffPanel
                label="ElevenLabs ASR Transcript"
                tokens={hasDiff ? hypTokens : row.asr_transcript ? [{ text: row.asr_transcript, tag: "equal" }] : []}
                wordCount={hypWords}
                side="hyp"
                empty={!row.asr_transcript}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1">
            <ExternalLink size={11} />
            <a
              href={row.audio_file}
              target="_blank"
              rel="noreferrer"
              className="hover:text-blue-600 transition-colors truncate"
            >
              {row.audio_file}
            </a>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function SingleSpeakerResultsTable({ rows, werThreshold }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("prompt_id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "prompt_id") cmp = a.prompt_id.localeCompare(b.prompt_id);
    else if (sortKey === "wer") cmp = (a.wer ?? -1) - (b.wer ?? -1);
    else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === "asc" ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />
    ) : (
      <ChevronDown size={13} className="text-gray-300" />
    );

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th
              className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 transition-colors select-none"
              onClick={() => toggleSort("prompt_id")}
            >
              <div className="flex items-center gap-1">Prompt ID <SortIcon k="prompt_id" /></div>
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600">Audio File</th>
            <th
              className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 transition-colors select-none"
              onClick={() => toggleSort("wer")}
            >
              <div className="flex items-center gap-1">WER <SortIcon k="wer" /></div>
            </th>
            <th
              className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 transition-colors select-none"
              onClick={() => toggleSort("status")}
            >
              <div className="flex items-center gap-1">Status <SortIcon k="status" /></div>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const isExpanded = expandedIdx === row.rowIndex;
            return (
              <>
                <tr
                  key={row.rowIndex}
                  onClick={() => setExpandedIdx(isExpanded ? null : row.rowIndex)}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                  } hover:bg-blue-50/40`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{row.prompt_id}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-[220px] truncate" title={row.audio_file}>
                    {row.audio_file.length > 40 ? row.audio_file.slice(0, 40) + "…" : row.audio_file}
                  </td>
                  <td className="px-4 py-3">
                    <WerBadge wer={row.wer} threshold={werThreshold} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <StatusBadge status={row.status} />
                      {isExpanded
                        ? <ChevronUp size={14} className="text-gray-400 ml-2" />
                        : <ChevronDown size={14} className="text-gray-300 ml-2" />
                      }
                    </div>
                  </td>
                </tr>
                {isExpanded && <ExpandedRow key={`exp-${row.rowIndex}`} row={row} threshold={werThreshold} />}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
