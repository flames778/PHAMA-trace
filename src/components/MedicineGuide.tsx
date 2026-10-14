import { useState } from "react";
import type { Product } from "../types";

export interface MedicineGuideProps {
  product: Product;
}

interface GuideSection {
  id: string;
  label: string;
  icon: string;
  content: string;
  tone: "info" | "warning" | "danger";
}

export function MedicineGuide({ product }: MedicineGuideProps) {
  const [expanded, setExpanded] = useState<string | null>("whatItsFor");

  const sections: GuideSection[] = [
    {
      id: "whatItsFor",
      label: "What is this for?",
      icon: "💊",
      content: product.whatItsFor,
      tone: "info",
    },
    {
      id: "howToTake",
      label: "How do I take it?",
      icon: "🕐",
      content: product.howToTake,
      tone: "info",
    },
    {
      id: "sideEffects",
      label: "What might go wrong?",
      icon: "⚠️",
      content: product.commonSideEffects,
      tone: "warning",
    },
    {
      id: "whoShouldNotTake",
      label: "Who should NOT take this?",
      icon: "🚫",
      content: product.whoShouldNotTake,
      tone: "danger",
    },
    {
      id: "storage",
      label: "How do I store it?",
      icon: "🏠",
      content: product.storage,
      tone: "info",
    },
    {
      id: "missedDose",
      label: "What if I miss a dose?",
      icon: "⏰",
      content: product.missedDose,
      tone: "info",
    },
  ];

  const toneClasses: Record<GuideSection["tone"], string> = {
    info: "border-sky-400/20 bg-sky-400/5",
    warning: "border-amber-400/20 bg-amber-400/5",
    danger: "border-rose-400/20 bg-rose-400/5",
  };

  return (
    <section className="rounded-xl border border-line bg-ink-soft/60">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-[13px] font-semibold text-slate-100">
          What is this medicine for?
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {product.brandName} ({product.genericName}) — explained in plain language
        </p>
      </div>
      <div className="divide-y divide-line">
        {sections.map((section) => {
          const isOpen = expanded === section.id;
          return (
            <div key={section.id}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : section.id)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition hover:bg-white/[0.03]"
              >
                <span className="text-[14px]">{section.icon}</span>
                <span className="flex-1 text-[12.5px] font-medium text-slate-200">
                  {section.label}
                </span>
                <span
                  className={`text-[11px] text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  ▾
                </span>
              </button>
              {isOpen && (
                <div className={`mx-4 mb-3 rounded-lg border px-3 py-2.5 ${toneClasses[section.tone]}`}>
                  <p className="text-[12px] leading-relaxed text-slate-300">{section.content}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-line px-4 py-2.5">
        <p className="text-[10.5px] leading-relaxed text-slate-500">
          This is general information for this type of medicine. It is not personal medical advice.
          Always follow the instructions on your pack or from your doctor or pharmacist.
        </p>
      </div>
    </section>
  );
}
