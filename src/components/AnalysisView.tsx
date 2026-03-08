import React, { useState, useEffect } from 'react';
import type { AnalyzeResponse, InterventionType, DebtType } from '../types/models';
import { getNodeColor, getLevelLabel, getDebtTypeColor, getDebtTypeLabel, formatConfidence } from '../utils/graphLayout';
import { DepthModel } from './DepthModel';
import { WhyThisScore } from './WhyThisScore';
import { ImprovementRoadmap } from './ImprovementRoadmap';
import { DeltaComparison } from './DeltaComparison';

interface AnalysisViewProps {
  result: AnalyzeResponse;
  previousResult?: AnalyzeResponse | null;
  onDismiss: () => void;
  onReAnalyze?: () => void;
}

const INTERVENTION_LABELS: Record<InterventionType, string> = {
  clarification: 'Clarification',
  counter_example: 'Counter Example',
  mental_model: 'Mental Model',
  aha_bridge: 'Aha Bridge',
};

const INTERVENTION_ICONS: Record<InterventionType, React.ReactNode> = {
  clarification: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  ),
  counter_example: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  ),
  mental_model: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" />
    </svg>
  ),
  aha_bridge: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  ),
};

/* ────────────────────────── Confidence Ring ────────────────────────── */

const ConfidenceRing: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const pct = Math.round(value * 100);
  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (value * circumference);

  return (
    <div className="relative flex items-center justify-center">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="20" fill="none" strokeWidth="2.5" className="stroke-surface-border/30" />
        <circle
          cx="22"
          cy="22"
          r="20"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="absolute text-sm font-bold tabular-nums" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
};

/* ────────────────────────── Main Component ────────────────────────── */

/* ── Progressive reveal hook ── */
const SECTION_DELAY_MS = 350; // gap between each card appearing

function useProgressiveReveal(sectionCount: number, resultKey: string) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < sectionCount; i++) {
      timers.push(
        setTimeout(() => setVisibleCount(i + 1), i * SECTION_DELAY_MS),
      );
    }
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  return visibleCount;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({
  result,
  previousResult,
  onDismiss,
  onReAnalyze,
}) => {
  const levelColor = getNodeColor(result.understandingLevel);
  const levelLabel = getLevelLabel(result.understandingLevel);
  const confidencePct = formatConfidence(result.confidence);

  // Number of progressive sections (delta always shows instantly, not counted)
  const hasIntervention = !!result.microIntervention;
  const totalSections = 5 + (hasIntervention ? 1 : 0);
  // hero=0, depth=1, why=2, debt=3, intervention=4(opt), roadmap=4 or 5

  const visibleCount = useProgressiveReveal(
    totalSections,
    `${result.conceptId}-${result.confidence}-${result.understandingLevel}`,
  );

  // Maps each logical section index → DOM visibility (0-based)
  let sectionIdx = 0;
  const isVisible = () => visibleCount > sectionIdx++;

  return (
    <div className="space-y-4">
      {/* ── Delta comparison — appears instantly alongside hero ── */}
      {previousResult && (
        <div className="animate-fade-up">
          <DeltaComparison previous={previousResult} current={result} />
        </div>
      )}

      {/* ── Hero card — concept + level + confidence ── */}
      {isVisible() && <div className="animate-fade-up glass rounded-2xl border border-surface-border/50 p-6">
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-text-faint">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
              <span className="text-xs font-medium uppercase tracking-wider">Cognitive Analysis</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-text-primary">
              {result.conceptId}
            </h2>
            <div className="flex items-center gap-3">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: `${levelColor}15`, color: levelColor }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: levelColor, boxShadow: `0 0 8px ${levelColor}60` }}
                />
                {levelLabel}
              </div>
              {onReAnalyze && (
                <button
                  onClick={onReAnalyze}
                  className="flex items-center gap-1.5 rounded-lg border border-surface-border/50 px-2.5 py-1 text-[11px] font-medium text-text-muted transition-all hover:border-accent/30 hover:bg-accent-subtle/50 hover:text-accent"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  Re-analyze
                </button>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <ConfidenceRing value={result.confidence} color={levelColor} />
            <button
              onClick={onDismiss}
              className="rounded-lg p-1.5 text-text-faint transition-colors hover:bg-surface hover:text-text-secondary"
              title="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-5 flex items-center gap-3">
          <span className="text-[11px] font-medium text-text-faint">Confidence</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-border/40">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ width: confidencePct, backgroundColor: levelColor }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-text-secondary">{confidencePct}</span>
        </div>
      </div>}

      {/* ── Understanding Depth Model ── */}
      {isVisible() && (
        <div className="animate-fade-up">
          <DepthModel currentLevel={result.understandingLevel} confidence={result.confidence} />
        </div>
      )}

      {/* ── Why This Score (collapsible) ── */}
      {isVisible() && (
        <div className="animate-fade-up">
          <WhyThisScore result={result} />
        </div>
      )}

      {/* ── Debt indicators ── */}
      {isVisible() && <div className="animate-fade-up">
        {result.debtIndicators.length > 0 ? (
          <div className="glass rounded-2xl border border-surface-border/50 p-5">
            <div className="mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <h3 className="text-sm font-semibold text-text-primary">
                Cognitive Debt
                <span className="ml-2 rounded-full bg-orange-400/10 px-2 py-0.5 text-[11px] font-bold text-orange-400">
                  {result.debtIndicators.length}
                </span>
              </h3>
            </div>
            <div className="space-y-3">
              {result.debtIndicators.map((debt, i) => {
                const debtColor = getDebtTypeColor(debt.type as DebtType);
                const debtLabel = getDebtTypeLabel(debt.type as DebtType);
                const severity = Math.round(debt.severity * 100);
                return (
                  <div
                    key={i}
                    className="rounded-xl border p-4 transition-colors"
                    style={{ borderColor: `${debtColor}20`, backgroundColor: `${debtColor}06` }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: debtColor }} />
                        <span className="text-sm font-medium" style={{ color: debtColor }}>
                          {debtLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-surface-border/30">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${severity}%`, backgroundColor: debtColor }}
                          />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: debtColor }}>
                          {severity}%
                        </span>
                      </div>
                    </div>
                    {debt.explanation && (
                      <p className="mt-2.5 text-xs leading-relaxed text-text-muted">
                        {debt.explanation}
                      </p>
                    )}
                    {debt.evidence && (
                      <p className="mt-2 rounded-lg bg-canvas-subtle/50 px-3 py-2 text-[11px] italic leading-relaxed text-text-faint">
                        &ldquo;{debt.evidence}&rdquo;
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="glass flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
              <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-400">Clean bill of health</p>
              <p className="text-xs text-emerald-400/60">No cognitive debt patterns detected.</p>
            </div>
          </div>
        )}
      </div>}

      {/* ── Micro intervention ── */}
      {hasIntervention && isVisible() && (() => {
        const iv = result.microIntervention!;
        const ivLabel = INTERVENTION_LABELS[iv.type] ?? iv.type;
        const ivIcon = INTERVENTION_ICONS[iv.type] ?? null;

        return (
          <div className="animate-fade-up glass rounded-2xl border border-accent/20 p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                {ivIcon}
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-accent/70">{ivLabel}</span>
                <h3 className="text-sm font-semibold text-text-primary">{iv.content.title}</h3>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-text-secondary">
              {iv.content.explanation}
            </p>

            {iv.content.examples.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                  Try this
                </p>
                <ul className="space-y-2">
                  {iv.content.examples.map((ex, j) => (
                    <li key={j} className="flex gap-2.5 text-sm leading-relaxed text-text-muted">
                      <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-accent/50" />
                      <span>{ex}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {iv.content.followUpQuestions.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                  Reflect on
                </p>
                <ul className="space-y-2">
                  {iv.content.followUpQuestions.map((q, j) => (
                    <li key={j} className="flex gap-2.5 text-sm leading-relaxed text-text-muted">
                      <span className="mt-0.5 flex-shrink-0 text-amber-400/60">?</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Improvement Roadmap ── */}
      {isVisible() && (
        <div className="animate-fade-up">
          <ImprovementRoadmap
            currentLevel={result.understandingLevel}
            conceptId={result.conceptId}
          />
        </div>
      )}

    </div>
  );
};
