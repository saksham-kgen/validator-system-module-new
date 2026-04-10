import { useRef, useState, useCallback } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, Eye } from "lucide-react";
import { CsvRow } from "../lib/types";
import { parseCsv, readFileAsText } from "../lib/csvParser";

interface Props {
  onParsed: (rows: CsvRow[], filename: string) => void;
}

const PREVIEW_COLS = ["audio_id", "speaker_A_audio", "speaker_B_audio", "combined_audio", "transcription"];

function truncate(str: string, max = 38): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export default function UploadStep({ onParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<CsvRow[] | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [allRows, setAllRows] = useState<CsvRow[]>([]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setParseErrors(["Please upload a CSV file (.csv extension required)"]);
      return;
    }
    const text = await readFileAsText(file);
    const { rows, errors } = parseCsv(text);
    setParseErrors(errors);
    setFilename(file.name);
    if (rows.length > 0) {
      setPreviewRows(rows.slice(0, 5));
      setAllRows(rows);
    } else {
      setPreviewRows(null);
      setAllRows([]);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const canProceed = allRows.length > 0 && parseErrors.filter((e) => e.startsWith("Missing required")).length === 0;

  return (
    <div className="space-y-6">
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200
          ${isDragging ? "border-blue-400 bg-blue-50 scale-[1.01]" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"}
        `}
      >
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onInputChange} />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? "bg-blue-100" : "bg-gray-100"}`}>
            <Upload size={24} className={isDragging ? "text-blue-500" : "text-gray-400"} />
          </div>
          <div>
            <p className="text-base font-semibold text-gray-700">
              {isDragging ? "Drop your CSV here" : "Drag & drop your CSV file"}
            </p>
            <p className="text-sm text-gray-400 mt-1">or click to browse</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {["audio_id", "speaker_A_audio", "speaker_B_audio", "combined_audio", "transcription"].map((col) => (
              <span key={col} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">
                {col}
              </span>
            ))}
          </div>
        </div>
      </div>

      {parseErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-red-700 font-medium mb-1">
            <AlertCircle size={16} />
            <span>Parse Errors</span>
          </div>
          {parseErrors.map((err, i) => (
            <p key={i} className="text-sm text-red-600 pl-6">• {err}</p>
          ))}
        </div>
      )}

      {previewRows && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={15} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{filename}</p>
                <p className="text-xs text-gray-500">{allRows.length} rows parsed</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Eye size={13} />
              <span>Showing first {previewRows.length} rows</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {PREVIEW_COLS.map((col) => (
                    <th key={col} className="text-left px-4 py-3 font-semibold text-gray-600 font-mono">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{row.audio_id}</td>
                    <td className="px-4 py-2.5 text-gray-500">
                      <a href={row.speaker_A_audio} target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors" title={row.speaker_A_audio}>
                        {truncate(row.speaker_A_audio)}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      <a href={row.speaker_B_audio} target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors" title={row.speaker_B_audio}>
                        {truncate(row.speaker_B_audio)}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      <a href={row.combined_audio} target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors" title={row.combined_audio}>
                        {truncate(row.combined_audio)}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      <a href={row.transcription} target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors" title={row.transcription}>
                        <div className="flex items-center gap-1">
                          <FileText size={11} />
                          {truncate(row.transcription)}
                        </div>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => canProceed && onParsed(allRows, filename)}
              disabled={!canProceed}
              className={`
                px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center gap-2
                ${canProceed
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-200 active:scale-95"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }
              `}
            >
              Continue to Validation
              <span className="text-blue-200">→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
