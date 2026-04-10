import { Settings, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { ValidationConfig } from "../lib/types";

interface Props {
  config: ValidationConfig;
  onChange: (config: ValidationConfig) => void;
}

export default function ConfigPanel({ config, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  const update = (key: keyof ValidationConfig, value: number | string) => {
    onChange({ ...config, [key]: value });
  };

  const LANGUAGES = [
    { code: "", label: "Auto-detect" },
    { code: "en", label: "English" },
    { code: "hi", label: "Hindi" },
    { code: "ta", label: "Tamil" },
    { code: "te", label: "Telugu" },
    { code: "kn", label: "Kannada" },
    { code: "ml", label: "Malayalam" },
    { code: "mr", label: "Marathi" },
    { code: "bn", label: "Bengali" },
    { code: "gu", label: "Gujarati" },
    { code: "pa", label: "Punjabi" },
    { code: "ur", label: "Urdu" },
    { code: "zh", label: "Chinese" },
    { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" },
    { code: "ar", label: "Arabic" },
    { code: "fr", label: "French" },
    { code: "de", label: "German" },
    { code: "es", label: "Spanish" },
    { code: "pt", label: "Portuguese" },
    { code: "ru", label: "Russian" },
    { code: "it", label: "Italian" },
    { code: "tr", label: "Turkish" },
    { code: "vi", label: "Vietnamese" },
    { code: "id", label: "Indonesian" },
    { code: "ms", label: "Malay" },
    { code: "th", label: "Thai" },
  ];

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings size={15} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Validation Settings</span>
        </div>
        {expanded ? (
          <ChevronUp size={15} className="text-gray-400" />
        ) : (
          <ChevronDown size={15} className="text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="px-5 py-4 bg-white grid grid-cols-2 md:grid-cols-5 gap-5 border-t border-gray-100">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Min Duration (s)
            </label>
            <input
              type="number"
              min={0}
              max={config.maxDurationSec - 1}
              value={config.minDurationSec}
              onChange={(e) => update("minDurationSec", Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
            />
            <p className="text-xs text-gray-400">Minimum audio length</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Max Duration (s)
            </label>
            <input
              type="number"
              min={config.minDurationSec + 1}
              value={config.maxDurationSec}
              onChange={(e) => update("maxDurationSec", Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
            />
            <p className="text-xs text-gray-400">Maximum audio length</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              WER Threshold
            </label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={config.werThreshold}
              onChange={(e) => update("werThreshold", Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
            />
            <p className="text-xs text-gray-400">Max WER to pass (0–1)</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Concurrency
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={config.concurrency}
              onChange={(e) => update("concurrency", Math.max(1, Math.min(50, Number(e.target.value))))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
            />
            <p className="text-xs text-gray-400">Parallel rows (1–50)</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              ASR Language
            </label>
            <select
              value={config.languageCode}
              onChange={(e) => update("languageCode", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all bg-white"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400">Language for transcription</p>
          </div>
        </div>
      )}
    </div>
  );
}
