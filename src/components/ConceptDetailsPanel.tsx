import React from 'react';
import type { ConceptUnderstanding, MicroIntervention } from '../types/models';
import { DebtBadge } from './DebtBadge';
import { MicroInterventionCard } from './MicroInterventionCard';
import { LoadingSpinner } from './LoadingSpinner';
import {
  getNodeColor,
  getLevelLabel,
  formatConfidence,
  formatDate,
} from '../utils/graphLayout';

interface ConceptDetailsPanelProps {
  concept: ConceptUnderstanding | null;
  interventions: MicroIntervention[];
  interventionsLoading: boolean;
  onClose: () => void;
  onMarkUnderstood: (conceptId: string) => void;
}

export const ConceptDetailsPanel: React.FC<ConceptDetailsPanelProps> = ({
  concept,
  interventions,
  interventionsLoading,
  onClose,
  onMarkUnderstood,
}) => {
  if (!concept) return null;

  const levelColor = getNodeColor(concept.level);
  const hasDebt = concept.debtIndicators.length > 0;

  return (
    <div className="flex h-full flex-col border-l border-slate-700 bg-slate-800/90 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-slate-100">
            {concept.conceptId}
          </h2>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${levelColor}20`, color: levelColor }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: levelColor }}
              />
              {getLevelLabel(concept.level)}
            </span>
            {hasDebt && (
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-400">
                {concept.debtIndicators.length} debt{concept.debtIndicators.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-2 flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
          aria-label="Close panel"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-lg bg-slate-900/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Confidence
            </p>
            <p className="mt-1 text-lg font-bold text-slate-200">
              {formatConfidence(concept.confidence)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-900/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Evidence
            </p>
            <p className="mt-1 text-lg font-bold text-slate-200">
              {concept.evidenceCount}
            </p>
          </div>
          <div className="col-span-2 rounded-lg bg-slate-900/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Last Assessed
            </p>
            <p className="mt-1 text-sm font-medium text-slate-300">
              {formatDate(concept.lastAssessed)}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${concept.confidence * 100}%`,
                backgroundColor: levelColor,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {hasDebt && (
          <section className="mt-6">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <svg
                className="h-3.5 w-3.5 text-orange-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              Cognitive Debt
            </h3>
            <div className="space-y-2">
              {concept.debtIndicators.map((indicator, idx) => (
                <DebtBadge
                  key={`${indicator.type}-${idx}`}
                  indicator={indicator}
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-6">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <svg
              className="h-3.5 w-3.5 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
              />
            </svg>
            Micro-Interventions
          </h3>

          {interventionsLoading ? (
            <LoadingSpinner size="sm" message="Loading interventions..." />
          ) : interventions.length > 0 ? (
            <div className="space-y-3">
              {interventions.map((intervention) => (
                <MicroInterventionCard
                  key={intervention.id}
                  intervention={intervention}
                  onMarkUnderstood={() =>
                    onMarkUnderstood(concept.conceptId)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center">
              <p className="text-sm text-slate-500">
                {hasDebt
                  ? 'Click "Submit Evidence" to receive targeted interventions.'
                  : 'No cognitive debt detected. Great understanding!'}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
