import { CheckCircle2, XCircle, BarChart2, Percent } from "lucide-react";
import { SingleSpeakerResult } from "../lib/types";

interface Props {
  rows: SingleSpeakerResult[];
  werThreshold: number;
}

export default function SingleSpeakerSummary({ rows, werThreshold }: Props) {
  const total = rows.length;
  const passed = rows.filter((r) => r.status === "Pass").length;
  const failed = rows.filter((r) => r.status === "Fail").length;
  const skipped = rows.filter((r) => r.status === "Skipped").length;
  const werRows = rows.filter((r) => r.wer !== null);
  const avgWer = werRows.length > 0
    ? werRows.reduce((s, r) => s + (r.wer ?? 0), 0) / werRows.length
    : null;
  const passRate = total > 0 ? (passed / total) * 100 : 0;

  const metrics = [
    {
      label: "Pass Rate",
      value: total > 0 ? passRate.toFixed(1) + "%" : "—",
      sub: `${passed} / ${total} rows`,
      icon: CheckCircle2,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
    },
    {
      label: "Failed",
      value: failed.toString(),
      sub: `WER > ${(werThreshold * 100).toFixed(0)}%`,
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-100",
    },
    {
      label: "Avg WER",
      value: avgWer !== null ? (avgWer * 100).toFixed(1) + "%" : "—",
      sub: `across ${werRows.length} rows`,
      icon: BarChart2,
      color: avgWer !== null && avgWer > werThreshold ? "text-red-600" : "text-gray-700",
      bg: "bg-gray-50",
      border: "border-gray-100",
    },
    {
      label: "Skipped",
      value: skipped.toString(),
      sub: "ASR unavailable",
      icon: Percent,
      color: "text-gray-500",
      bg: "bg-gray-50",
      border: "border-gray-100",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div key={m.label} className={`rounded-xl border ${m.border} ${m.bg} p-4 space-y-2`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{m.label}</p>
            <m.icon size={15} className={m.color} />
          </div>
          <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
          <p className="text-xs text-gray-400">{m.sub}</p>
        </div>
      ))}
    </div>
  );
}
