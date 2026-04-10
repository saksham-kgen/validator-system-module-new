import { RowResult, SingleSpeakerResult } from "./types";

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv(rows: RowResult[], filename: string): void {
  const headers = [
    "audio_id",
    "structural_check",
    "structural_errors",
    "transcript_qc_verdict",
    "transcript_qc_segments",
    "transcript_qc_issues",
    "accuracy_check_wer",
    "accuracy_status",
    "transcript_preview",
  ];

  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        escapeCsvCell(row.audio_id),
        escapeCsvCell(row.structural_check),
        escapeCsvCell(row.structural_errors.join("; ")),
        escapeCsvCell(row.transcript_qc?.verdict ?? ""),
        escapeCsvCell(row.transcript_qc?.segment_count ?? ""),
        escapeCsvCell(row.transcript_qc?.issues_summary ?? ""),
        escapeCsvCell(row.accuracy_wer !== null ? row.accuracy_wer.toFixed(4) : ""),
        escapeCsvCell(row.accuracy_status),
        escapeCsvCell(row.transcript_preview ?? ""),
      ].join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportSingleSpeakerToCsv(rows: SingleSpeakerResult[], filename: string): void {
  const headers = [
    "prompt_id",
    "audio_file",
    "wer",
    "status",
    "asr_transcript",
    "reference_script",
    "error",
  ];

  const csvLines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        escapeCsvCell(row.prompt_id),
        escapeCsvCell(row.audio_file),
        escapeCsvCell(row.wer !== null ? (row.wer * 100).toFixed(2) + "%" : ""),
        escapeCsvCell(row.status),
        escapeCsvCell(row.asr_transcript ?? ""),
        escapeCsvCell(row.script),
        escapeCsvCell(row.error ?? ""),
      ].join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
