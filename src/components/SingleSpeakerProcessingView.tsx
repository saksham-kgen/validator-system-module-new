import { CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { SingleSpeakerResult } from "../lib/types";

interface Props {
  rows: SingleSpeakerResult[];
  totalRows: number;
}

export default function SingleSpeakerProcessingView({ rows, totalRows }: Props) {
  const done = rows.filter((r) => r.status !== "Pending" && r.status !== "Processing").length;
  const processing = rows.filter((r) => r.status === "Processing").length;
  const failed = rows.filter((r) => r.status === "Fail").length;
  const pct = totalRows > 0 ? Math.round((done / totalRows) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">Transcribing &amp; computing WER</span>
          <span className="text-gray-500">{done} / {totalRows}</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin text-blue-500" />{processing} processing</span>
          <span className="flex items-center gap-1"><CheckCircle2 size={11} className="text-emerald-500" />{done - failed} passed</span>
          <span className="flex items-center gap-1"><XCircle size={11} className="text-red-500" />{failed} failed</span>
        </div>
      </div>

      <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
        {rows.map((row) => (
          <div
            key={row.rowIndex}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-colors ${
              row.status === "Processing" ? "bg-blue-50" :
              row.status === "Pass"       ? "bg-emerald-50" :
              row.status === "Fail"       ? "bg-red-50" :
              row.status === "Skipped"    ? "bg-gray-50" :
              "bg-white"
            }`}
          >
            <span className="shrink-0">
              {row.status === "Processing" && <Loader2 size={13} className="animate-spin text-blue-500" />}
              {row.status === "Pass"       && <CheckCircle2 size={13} className="text-emerald-500" />}
              {row.status === "Fail"       && <XCircle size={13} className="text-red-500" />}
              {row.status === "Skipped"    && <XCircle size={13} className="text-gray-400" />}
              {row.status === "Pending"    && <Clock size={13} className="text-gray-300" />}
            </span>
            <span className="font-medium text-gray-700 min-w-0 truncate">{row.prompt_id}</span>
            {row.wer !== null && (
              <span className={`ml-auto shrink-0 font-bold ${row.wer > 0.15 ? "text-red-600" : "text-emerald-600"}`}>
                {(row.wer * 100).toFixed(1)}%
              </span>
            )}
            {row.status === "Skipped" && row.error && (
              <span className="ml-auto text-gray-400 truncate max-w-[200px]">{row.error}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
