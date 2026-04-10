import { useState } from "react";
import { Shield, Activity, CheckCircle2, XCircle, Loader2, Clock, Info } from "lucide-react";
import { RowResult, AppStep } from "../lib/types";
import RowDetailsModal from "./RowDetailsModal";

interface Props {
  rows: RowResult[];
  currentStep: AppStep;
  totalRows: number;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Pass") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
      <CheckCircle2 size={10} />Pass
    </span>
  );
  if (status === "Warn") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
      Warn
    </span>
  );
  if (status === "Fail") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
      <XCircle size={10} />Fail
    </span>
  );
  if (status === "Processing") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full animate-pulse">
      <Loader2 size={10} className="animate-spin" />Processing
    </span>
  );
  if (status === "Skipped") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Skipped</span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
      <Clock size={10} />Pending
    </span>
  );
}

export default function ProcessingView({ rows, currentStep, totalRows }: Props) {
  const [selectedRow, setSelectedRow] = useState<RowResult | null>(null);

  const processedStructural = rows.filter((r) => r.structural_check === "Pass" || r.structural_check === "Fail").length;
  const structuralProgress  = totalRows > 0 ? (processedStructural / totalRows) * 100 : 0;

  const accuracyEligible = rows.filter((r) => r.structural_check === "Pass").length;
  const accuracyDone     = rows.filter((r) => r.accuracy_status === "Pass" || r.accuracy_status === "Fail" || r.accuracy_status === "Skipped").length;
  const accuracyProgress = accuracyEligible > 0 ? (accuracyDone / accuracyEligible) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`rounded-2xl p-4 border transition-all ${currentStep === "structural" ? "border-blue-200 bg-blue-50/50" : "border-gray-200 bg-white"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${currentStep === "structural" ? "bg-blue-100" : "bg-gray-100"}`}>
                <Shield size={13} className={currentStep === "structural" ? "text-blue-600" : "text-gray-500"} />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-800">Structural QC</p>
                <p className="text-xs text-gray-500">{processedStructural} / {totalRows}</p>
              </div>
            </div>
            {currentStep === "structural" && <Loader2 size={14} className="text-blue-500 animate-spin" />}
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${structuralProgress}%` }} />
          </div>
        </div>

        <div className={`rounded-2xl p-4 border transition-all ${accuracyEligible > 0 ? "border-amber-200 bg-amber-50/50" : "border-gray-200 bg-white"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accuracyEligible > 0 ? "bg-amber-100" : "bg-gray-100"}`}>
                <Activity size={13} className={accuracyEligible > 0 ? "text-amber-600" : "text-gray-500"} />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-800">Accuracy QC (WER)</p>
                <p className="text-xs text-gray-500">
                  {accuracyEligible === 0 ? "Waiting for passing rows..." : `${accuracyDone} / ${accuracyEligible}`}
                </p>
              </div>
            </div>
            {accuracyEligible > 0 && accuracyDone < accuracyEligible && <Loader2 size={14} className="text-amber-500 animate-spin" />}
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${accuracyProgress}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Live Results</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {["Audio", "Structural QC", "Accuracy QC", "WER", ""].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.audio_id + i} className={`border-b border-gray-50 last:border-0 transition-colors ${row.structural_check === "Fail" ? "bg-red-50/30" : ""}`}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{row.audio_id}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      <StatusBadge status={row.structural_check} />
                      {row.transcript_qc && (
                        <p className="text-xs text-gray-400">QC: {row.transcript_qc.verdict} · {row.transcript_qc.segment_count} segs</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={row.accuracy_status} /></td>
                  <td className="px-4 py-3 text-sm">
                    {row.accuracy_wer !== null ? (
                      <span className={`font-semibold ${row.accuracy_wer <= 0.15 ? "text-emerald-600" : "text-red-600"}`}>
                        {(row.accuracy_wer * 100).toFixed(1)}%
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => setSelectedRow(row)}
                      className="text-gray-400 hover:text-blue-600 transition-colors p-1 rounded-lg hover:bg-blue-50"
                      title="View details"
                    >
                      <Info size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRow && <RowDetailsModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}
