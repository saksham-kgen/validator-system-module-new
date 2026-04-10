import { Check, Upload, Shield, Activity, BarChart2 } from "lucide-react";
import { AppStep } from "../lib/types";

const STEPS: { key: AppStep; label: string; icon: React.ReactNode }[] = [
  { key: "upload", label: "Upload", icon: <Upload size={16} /> },
  { key: "structural", label: "Structural Check", icon: <Shield size={16} /> },
  { key: "accuracy", label: "Accuracy Check", icon: <Activity size={16} /> },
  { key: "report", label: "Report", icon: <BarChart2 size={16} /> },
];

const STEP_ORDER: AppStep[] = ["upload", "structural", "accuracy", "report"];

interface Props {
  currentStep: AppStep;
}

export default function StepIndicator({ currentStep }: Props) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isActive = idx === currentIdx;
        const isPending = idx > currentIdx;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`
                  w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300
                  ${isDone ? "bg-emerald-500 text-white shadow-md shadow-emerald-200" : ""}
                  ${isActive ? "bg-blue-600 text-white shadow-md shadow-blue-200 ring-4 ring-blue-100" : ""}
                  ${isPending ? "bg-gray-100 text-gray-400 border border-gray-200" : ""}
                `}
              >
                {isDone ? <Check size={16} strokeWidth={2.5} /> : step.icon}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap transition-colors duration-200 ${
                  isActive ? "text-blue-600" : isDone ? "text-emerald-600" : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>

            {idx < STEPS.length - 1 && (
              <div
                className={`w-16 h-0.5 mx-1 mb-5 transition-all duration-500 ${
                  idx < currentIdx ? "bg-emerald-400" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
