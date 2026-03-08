import React from 'react';
import type { AnalyzeResponse, InterventionType } from '../types/models';
import { getNodeColor, getLevelLabel, getDebtTypeColor, getDebtTypeLabel, formatConfidence } from '../utils/graphLayout';
import type { DebtType } from '../types/models';

interface AnalysisResultPanelProps {
  result: AnalyzeResponse;
  onClose: () => void;
}

const INTERVENTION_LABELS: Record<InterventionType, string> = {
  clarification: 'Clarification',
  counter_example: 'Counter Example',
  mental_model: 'Mental Model',
  aha_bridge: 'Aha Bridge',
};

const INTERVENTION_COLORS: Record<InterventionType, string> = {
  clarification: '#3B82F6',
  counter_example: '#F97316',
  mental_model: '#10B981',
  aha_bridge: '#A855F7',
};

export const AnalysisResultPanel: React.FC<AnalysisResultPanelProps> = ({
  result,
  onClose,
}) => {
  const levelColor = getNodeColor(result.understandingLevel);
  const levelLabel = getLevelLabel(result.understandingLevel);
  const confidencePct = formatConfidence(result.confidence);

  return (
    <div className="flex max-h-[80vh] flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-800/90 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: levelColor, boxShadow: `0 0 8px ${levelColor}60` }}
          />
          <h3 className="text-base font-semibold text-slate-100">
            Analysis: <span className="text-blue-400">{result.conceptId}</span>
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* Understanding Level + Confidence */}
        <div className="flex items-center gap-4">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold"
            style={{ backgroundColor: `${levelColor}20`, color: levelColor }}
          >
            {levelLabel}
          </span>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: confidencePct, backgroundColor: levelColor }}
              />
            </div>
            <span className="text-sm font-medium text-slate-300">{confidencePct}</span>
          </div>
        </div>

        {/* Model Used */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
          <span>Model: {result.modelUsed.split(':')[0]}</span>
        </div>

        {/* Debt Indicators */}
        {result.debtIndicators.length > 0 && (
          <div>
            <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Cognitive Debt Detected
            </h4>
            <div className="space-y-2.5">
              {result.debtIndicators.map((debt, i) => {
                const debtColor = getDebtTypeColor(debt.type as DebtType);
                const debtLabel = getDebtTypeLabel(debt.type as DebtType);
                return (
                  <div
                    key={i}
                    className="rounded-lg border p-3"
                    style={{ borderColor: `${debtColor}40`, backgroundColor: `${debtColor}08` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium" style={{ color: debtColor }}>
                        {debtLabel}
                      </span>
                      <span
                        className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{ backgroundColor: `${debtColor}20`, color: debtColor }}
                      >
                        {Math.round(debt.severity * 100)}%
                      </span>
                    </div>
                    {debt.explanation && (
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">
                        {debt.explanation}
                      </p>
                    )}
                    {debt.evidence && (
                      <p className="mt-1.5 rounded bg-slate-800/50 px-2 py-1 text-xs italic text-slate-500">
                        &ldquo;{debt.evidence}&rdquo;
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {result.debtIndicators.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-400">
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>No cognitive debt detected</span>
          </div>
        )}

        {/* Micro Intervention */}
        {result.microIntervention && (
          <div>
            <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Micro-Intervention
            </h4>
            {(() => {
              const iv = result.microIntervention;
              const ivColor = INTERVENTION_COLORS[iv.type] ?? '#3B82F6';
              const ivLabel = INTERVENTION_LABELS[iv.type] ?? iv.type;
              return (
                <div
                  className="space-y-3 rounded-xl border p-4"
                  style={{ borderColor: `${ivColor}30`, backgroundColor: `${ivColor}06` }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ backgroundColor: `${ivColor}18`, color: ivColor }}
                    >
                      {ivLabel}
                    </span>
                  </div>
                  <h5 className="text-sm font-semibold text-slate-200">
                    {iv.content.title}
                  </h5>
                  <p className="text-xs leading-relaxed text-slate-400">
                    {iv.content.explanation}
                  </p>

                  {iv.content.examples.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Try This
                      </p>
                      <ul className="space-y-1">
                        {iv.content.examples.map((ex, j) => (
                          <li
                            key={j}
                            className="flex gap-2 text-xs leading-relaxed text-slate-400"
                          >
                            <span className="mt-0.5 text-blue-500">•</span>
                            <span>{ex}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {iv.content.followUpQuestions.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Reflect On
                      </p>
                      <ul className="space-y-1">
                        {iv.content.followUpQuestions.map((q, j) => (
                          <li
                            key={j}
                            className="flex gap-2 text-xs leading-relaxed text-slate-400"
                          >
                            <span className="mt-0.5 text-amber-500">?</span>
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
