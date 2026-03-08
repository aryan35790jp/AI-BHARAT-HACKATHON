import React from 'react';
import type { AnalyzeResponse, UnderstandingLevel } from '../types/models';
import { getNodeColor, getLevelLabel, formatConfidence } from '../utils/graphLayout';

interface DeltaComparisonProps {
  previous: AnalyzeResponse;
  current: AnalyzeResponse;
}

const LEVEL_INDEX: Record<UnderstandingLevel, number> = {
  unknown: 0,
  surface: 1,
  partial: 2,
  solid: 3,
  deep: 4,
};

export const DeltaComparison: React.FC<DeltaComparisonProps> = ({ previous, current }) => {
  const prevColor = getNodeColor(previous.understandingLevel);
  const currColor = getNodeColor(current.understandingLevel);
  const prevLabel = getLevelLabel(previous.understandingLevel);
  const currLabel = getLevelLabel(current.understandingLevel);
  const prevIdx = LEVEL_INDEX[previous.understandingLevel];
  const currIdx = LEVEL_INDEX[current.understandingLevel];

  const levelDelta = currIdx - prevIdx;
  const confidenceDelta = current.confidence - previous.confidence;
  const debtDelta = current.debtIndicators.length - previous.debtIndicators.length;

  const improved = levelDelta > 0 || (levelDelta === 0 && confidenceDelta > 0);
  const regressed = levelDelta < 0;

  return (
    <div
      className={`glass rounded-2xl border p-5 transition-all ${
        improved
          ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
          : regressed
            ? 'border-red-500/30 bg-red-500/[0.03]'
            : 'border-surface-border/50'
      }`}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        {improved ? (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15">
            <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          </div>
        ) : regressed ? (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15">
            <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 015.814 5.519l2.74 1.22m0 0l-5.94 2.28m5.94-2.28l-2.28-5.941" />
            </svg>
          </div>
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15">
            <svg className="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15" />
            </svg>
          </div>
        )}
        <h3 className="text-sm font-semibold text-text-primary">
          {improved ? 'Improvement Detected' : regressed ? 'Regression Detected' : 'No Change'}
        </h3>
      </div>

      {/* Level transition */}
      <div className="flex items-center gap-3 rounded-xl bg-canvas-subtle/60 px-4 py-3">
        {/* Previous */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-faint">Previous</span>
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ backgroundColor: `${prevColor}15`, color: prevColor }}
          >
            {prevLabel}
          </span>
          <span className="text-[11px] tabular-nums text-text-faint">{formatConfidence(previous.confidence)}</span>
        </div>

        {/* Arrow */}
        <div className="flex flex-1 items-center justify-center">
          <div className="h-px flex-1 bg-surface-border/40" />
          <svg
            className={`mx-2 h-5 w-5 ${improved ? 'text-emerald-400' : regressed ? 'text-red-400' : 'text-text-faint'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <div className="h-px flex-1 bg-surface-border/40" />
        </div>

        {/* Current */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-faint">Now</span>
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ backgroundColor: `${currColor}15`, color: currColor }}
          >
            {currLabel}
          </span>
          <span className="text-[11px] tabular-nums text-text-faint">{formatConfidence(current.confidence)}</span>
        </div>
      </div>

      {/* Delta metrics */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-canvas-subtle/40 px-3 py-2 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-faint">Level</p>
          <p className={`text-sm font-bold tabular-nums ${levelDelta > 0 ? 'text-emerald-400' : levelDelta < 0 ? 'text-red-400' : 'text-text-faint'}`}>
            {levelDelta > 0 ? `+${levelDelta}` : levelDelta === 0 ? '—' : levelDelta}
          </p>
        </div>
        <div className="rounded-lg bg-canvas-subtle/40 px-3 py-2 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-faint">Confidence</p>
          <p className={`text-sm font-bold tabular-nums ${confidenceDelta > 0 ? 'text-emerald-400' : confidenceDelta < 0 ? 'text-red-400' : 'text-text-faint'}`}>
            {confidenceDelta > 0 ? '+' : ''}{Math.round(confidenceDelta * 100)}%
          </p>
        </div>
        <div className="rounded-lg bg-canvas-subtle/40 px-3 py-2 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-faint">Debts</p>
          <p className={`text-sm font-bold tabular-nums ${debtDelta < 0 ? 'text-emerald-400' : debtDelta > 0 ? 'text-red-400' : 'text-text-faint'}`}>
            {debtDelta < 0 ? debtDelta : debtDelta > 0 ? `+${debtDelta}` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
};
