import { Mic, Users } from "lucide-react";
import { QcMode } from "../lib/types";

interface Props {
  mode: QcMode;
  onChange: (mode: QcMode) => void;
}

export default function ModeSelector({ mode, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-700">Validation Mode</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onChange("dual")}
          className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
            mode === "dual"
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            mode === "dual" ? "bg-blue-100" : "bg-gray-100"
          }`}>
            <Users size={16} className={mode === "dual" ? "text-blue-600" : "text-gray-500"} />
          </div>
          <div>
            <p className={`text-sm font-bold ${mode === "dual" ? "text-blue-700" : "text-gray-700"}`}>
              Dual Speaker QC
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Structural, transcript QC, and WER checks for multi-speaker audio datasets
            </p>
          </div>
        </button>

        <button
          onClick={() => onChange("single")}
          className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
            mode === "single"
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            mode === "single" ? "bg-blue-100" : "bg-gray-100"
          }`}>
            <Mic size={16} className={mode === "single" ? "text-blue-600" : "text-gray-500"} />
          </div>
          <div>
            <p className={`text-sm font-bold ${mode === "single" ? "text-blue-700" : "text-gray-700"}`}>
              Single Speaker QC
            </p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Transcribe audio via ElevenLabs and compare against a reference script using WER
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
