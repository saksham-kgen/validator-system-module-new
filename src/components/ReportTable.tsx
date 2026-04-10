import { useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp, Info, Filter, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { RowResult } from "../lib/types";
import RowDetailsModal from "./RowDetailsModal";

interface Props {
  rows: RowResult[];
  werThreshold: number;
}

type FilterMode = "all" | "failed" | "passed" | "qcfail";

function WerBar({ wer, threshold }: { wer: number; threshold: number }) {
  const pct     = Math.min(wer * 100, 100);
  const passing = wer <= threshold;
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${passing ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold ${passing ? "text-emerald-700" : "text-red-700"}`}>
        {(wer * 100).toFixed(1)}%
      </span>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  if (status === "Processing") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full animate-pulse">
      <Loader2 size={11} className="animate-spin" />Processing
    </span>
  );
  if (status === "Pending") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 bg-gray-50 px-2.5 py-0.5 rounded-full">
      <Clock size={11} />Pending
    </span>
  );
  const map: Record<string, string> = {
    Pass:    "bg-emerald-100 text-emerald-700",
    Warn:    "bg-amber-100 text-amber-700",
    Fail:    "bg-red-100 text-red-700",
    Skipped: "bg-gray-100 text-gray-500",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-400";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      {status === "Pass" && <CheckCircle2 size={11} />}
      {status === "Fail" && <XCircle size={11} />}
      {status === "Warn" && <AlertTriangle size={11} />}
      {status}
    </span>
  );
}

function QcCell({ row }: { row: RowResult }) {
  const qc = row.transcript_qc;
  if (!qc) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="space-y-0.5">
      <Badge status={qc.verdict} />
      <p className="text-xs text-gray-400">{qc.segment_count} segs</p>
    </div>
  );
}

export default function ReportTable({ rows, werThreshold }: Props) {
  const [selectedRow, setSelectedRow] = useState<RowResult | null>(null);
  const [filterMode, setFilterMode]   = useState<FilterMode>("all");
  const [sortBy, setSortBy]           = useState<"index" | "wer">("index");
  const [sortAsc, setSortAsc]         = useState(true);

  const filteredRows = rows.filter((r) => {
    if (filterMode === "failed")  return r.structural_check === "Fail" || r.accuracy_status === "Fail" || r.transcript_qc?.verdict === "Fail";
    if (filterMode === "qcfail")  return r.transcript_qc?.verdict === "Fail" || r.transcript_qc?.verdict === "Warn";
    if (filterMode === "passed")  return r.structural_check === "Pass" && (r.accuracy_status === "Pass" || r.accuracy_status === "Skipped") && r.transcript_qc?.verdict !== "Fail";
    return true;
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (sortBy === "wer") {
      const aW = a.accuracy_wer ?? -1, bW = b.accuracy_wer ?? -1;
      return sortAsc ? aW - bW : bW - aW;
    }
    return sortAsc ? a.rowIndex - b.rowIndex : b.rowIndex - a.rowIndex;
  });

  const toggleSort = (col: "index" | "wer") => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(true); }
  };

  const SortIcon = ({ col }: { col: "index" | "wer" }) =>
    sortBy === col
      ? (sortAsc ? <ChevronUp size={13} className="text-blue-500" /> : <ChevronDown size={13} className="text-blue-500" />)
      : <ChevronDown size={13} className="text-gray-300" />;

  const FILTERS: { key: FilterMode; label: string }[] = [
    { key: "all",     label: "All" },
    { key: "passed",  label: "Passed" },
    { key: "failed",  label: "Any Failed" },
    { key: "qcfail",  label: "QC Issues" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-400" />
          <span className="text-xs text-gray-500 font-medium">Filter:</span>
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterMode(key)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                filterMode === key ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">Showing {sortedRows.length} of {rows.length} rows</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort("index")}>
                  <div className="flex items-center gap-1"># <SortIcon col="index" /></div>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Audio</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Structural QC</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Accuracy QC</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort("wer")}>
                  <div className="flex items-center gap-1">WER <SortIcon col="wer" /></div>
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => {
                const isFailRow = row.structural_check === "Fail" || row.accuracy_status === "Fail" || row.transcript_qc?.verdict === "Fail";
                const isWarnRow = !isFailRow && row.transcript_qc?.verdict === "Warn";
                return (
                  <tr
                    key={row.audio_id + i}
                    className={`border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50/80 ${
                      isFailRow ? "bg-red-50/30" : isWarnRow ? "bg-amber-50/20" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{row.rowIndex + 1}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-800">{row.audio_id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <Badge status={row.structural_check} />
                        {row.structural_errors.length > 0 && (
                          <p className="text-xs text-red-500 leading-tight">
                            {row.structural_errors[0].slice(0, 48)}
                            {row.structural_errors[0].length > 48 || row.structural_errors.length > 1 ? "…" : ""}
                          </p>
                        )}
                        {row.transcript_qc && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <QcCell row={row} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={row.accuracy_status} />
                    </td>
                    <td className="px-4 py-3">
                      {row.accuracy_wer !== null
                        ? <WerBar wer={row.accuracy_wer} threshold={werThreshold} />
                        : <span className="text-sm text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedRow(row)}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-1 rounded-lg hover:bg-blue-50"
                        title="View details"
                      >
                        <Info size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                    No rows match the current filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRow && <RowDetailsModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}
