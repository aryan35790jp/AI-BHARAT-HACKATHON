import React from 'react';
import type { DebtIndicator } from '../types/models';
import { getDebtTypeLabel, getDebtTypeColor } from '../utils/graphLayout';

interface DebtBadgeProps {
  indicator: DebtIndicator;
  compact?: boolean;
}

export const DebtBadge: React.FC<DebtBadgeProps> = ({
  indicator,
  compact = false,
}) => {
  const color = getDebtTypeColor(indicator.type);
  const label = getDebtTypeLabel(indicator.type);

  if (compact) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: `${color}20`, color }}
        title={`${label} — Severity: ${Math.round(indicator.severity * 100)}%`}
      >
        {label}
      </span>
    );
  }

  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: `${color}40`, backgroundColor: `${color}08` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium" style={{ color }}>
          {label}
        </span>
        <span
          className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {Math.round(indicator.severity * 100)}%
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        {indicator.explanation}
      </p>
      {indicator.evidence && (
        <p className="mt-1.5 rounded bg-slate-800/50 px-2 py-1 text-xs italic text-slate-500">
          &ldquo;{indicator.evidence}&rdquo;
        </p>
      )}
    </div>
  );
};
