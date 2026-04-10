import { CheckCircle2, XCircle, Activity, BarChart2, FileSearch } from "lucide-react";
import { RunSummary } from "../lib/types";

interface Props {
  summary: RunSummary;
}

function Metric({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
        <p className="text-sm font-medium text-gray-600 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function SummaryMetrics({ summary }: Props) {
  const structuralPct = summary.totalRows > 0
    ? ((summary.structuralPassed / summary.totalRows) * 100).toFixed(1)
    : "0.0";

  const accuracyBase = summary.accuracyPassed + summary.accuracyFailed;
  const accuracyPct  = accuracyBase > 0
    ? ((summary.accuracyPassed / accuracyBase) * 100).toFixed(1)
    : "N/A";

  const avgWerDisplay = summary.avgWer !== null
    ? (summary.avgWer * 100).toFixed(1) + "%"
    : "N/A";

  const qcTotal  = summary.qcPassed + summary.qcWarned + summary.qcFailed;
  const qcPassPct = qcTotal > 0
    ? ((summary.qcPassed / qcTotal) * 100).toFixed(1)
    : "N/A";

  const qcSub = qcTotal > 0
    ? `${summary.qcPassed} pass · ${summary.qcWarned} warn · ${summary.qcFailed} fail`
    : "No transcripts checked";

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <Metric
        icon={<BarChart2 size={18} className="text-blue-600" />}
        label="Total Rows"
        value={String(summary.totalRows)}
        sub={`${summary.structuralPassed} passed structural`}
        color="bg-blue-50"
      />
      <Metric
        icon={<CheckCircle2 size={18} className="text-emerald-600" />}
        label="Structural Pass"
        value={`${structuralPct}%`}
        sub={`${summary.structuralPassed} / ${summary.totalRows} rows`}
        color="bg-emerald-50"
      />
      <Metric
        icon={<FileSearch size={18} className="text-slate-600" />}
        label="Transcript QC Pass"
        value={`${qcPassPct}${qcPassPct !== "N/A" ? "%" : ""}`}
        sub={qcSub}
        color="bg-slate-50"
      />
      <Metric
        icon={<Activity size={18} className="text-amber-600" />}
        label="Accuracy Pass"
        value={`${accuracyPct}${accuracyPct !== "N/A" ? "%" : ""}`}
        sub={`${summary.accuracyPassed} / ${accuracyBase} rows checked`}
        color="bg-amber-50"
      />
      <Metric
        icon={<XCircle size={18} className="text-rose-500" />}
        label="Avg WER"
        value={avgWerDisplay}
        sub={summary.avgWer !== null ? `threshold ≤ 15%` : "No rows checked"}
        color="bg-rose-50"
      />
    </div>
  );
}
