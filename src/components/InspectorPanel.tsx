import React from 'react';
import type { InspectedNode } from '../types/models';
import { getNodeColor, getLevelLabel, getDebtTypeLabel } from '../utils/graphLayout';

interface InspectorPanelProps {
  inspected: InspectedNode | null;
  onClose: () => void;
  onConceptClick?: (conceptName: string) => void;
}

const LEVEL_DESCRIPTIONS: Record<string, string> = {
  unknown: 'Has not yet demonstrated understanding of this concept. Try explaining it in your own words.',
  surface: 'Can restate definitions but lacks causal understanding. Knowledge is fragile and easily disrupted.',
  partial: 'Grasps core ideas but has gaps in edge cases and connections. Needs targeted practice.',
  solid: 'Strong conceptual understanding with few gaps. Can apply knowledge to new situations.',
  deep: 'Expert-level understanding. Can teach, debug, and create novel applications.',
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  inspected,
  onClose,
  onConceptClick,
}) => {
  /* ─── Empty state ─── */
  if (!inspected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-14 items-center justify-between border-b border-surface-border/30 px-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-faint">Inspector</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface/50 ring-1 ring-surface-border/50">
            <svg className="h-6 w-6 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
            </svg>
          </div>
          <p className="text-xs text-text-muted">Click a node to inspect</p>
          <p className="text-[10px] text-text-faint">Double-click to explore in chat</p>
        </div>
      </div>
    );
  }

  /* ─── Satellite node view ─── */
  if (inspected.kind === 'satellite') {
    return (
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-surface-border/30 px-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-faint">Inspector</span>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-faint transition-colors hover:bg-surface hover:text-text-secondary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Concept identity — title + connection only */}
        <div className="px-4 pt-4 pb-3">
          <h3 className="text-base font-bold text-text-primary">{inspected.conceptName}</h3>
          {inspected.parentConcept && (
            <p className="mt-1.5 text-[11px] text-text-muted">
              Connected to{' '}
              <span className="font-semibold text-accent">{inspected.parentConcept}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ─── Analyzed node view (full details) ─── */
  const result = inspected.data;
  const color = getNodeColor(result.understandingLevel);
  const label = getLevelLabel(result.understandingLevel);
  const pct = Math.round(result.confidence * 100);
  const description = LEVEL_DESCRIPTIONS[result.understandingLevel] ?? '';
  const intervention = result.microIntervention;
  const relatedConcepts = result.relatedConcepts ?? [];
  const prerequisites = result.prerequisites ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-surface-border/30 px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-faint">Inspector</span>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-text-faint transition-colors hover:bg-surface hover:text-text-secondary"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Concept header */}
        <div className="border-b border-surface-border/20 px-4 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-bold text-text-primary">{result.conceptId}</h3>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color, background: `${color}18` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              </div>
            </div>

            {/* Confidence ring */}
            <div className="relative flex items-center justify-center">
              <svg className="h-14 w-14 -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="19" fill="none" strokeWidth="2.5" stroke="rgba(255,255,255,0.06)" />
                <circle
                  cx="22" cy="22" r="19" fill="none" strokeWidth="2.5" strokeLinecap="round"
                  stroke={color}
                  strokeDasharray={`${pct * 1.19} ${119 - pct * 1.19}`}
                  className="transition-all duration-700"
                />
              </svg>
              <span className="absolute text-xs font-bold" style={{ color }}>{pct}%</span>
            </div>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">{description}</p>
        </div>

        {/* Prerequisites */}
        {prerequisites.length > 0 && (
          <div className="border-b border-surface-border/20 px-4 py-4">
            <h4 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
              <svg className="h-3.5 w-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              Prerequisites ({prerequisites.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {prerequisites.map((p, i) => (
                <button
                  key={i}
                  onClick={() => onConceptClick?.(p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20 hover:text-amber-300"
                >
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  {p.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Related Concepts */}
        {relatedConcepts.length > 0 && (
          <div className="border-b border-surface-border/20 px-4 py-4">
            <h4 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
              <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
              Related Concepts ({relatedConcepts.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {relatedConcepts.map((rc, i) => (
                <button
                  key={i}
                  onClick={() => onConceptClick?.(rc.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}
                  className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent transition-colors hover:bg-accent/20 hover:text-accent-light"
                >
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  {rc.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cognitive Debt */}
        {result.debtIndicators.length > 0 && (
          <div className="border-b border-surface-border/20 px-4 py-4">
            <h4 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
              <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              Cognitive Debt ({result.debtIndicators.length})
            </h4>
            <div className="space-y-2">
              {result.debtIndicators.map((debt, i) => (
                <div key={i} className="rounded-lg bg-surface/30 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-text-primary">{getDebtTypeLabel(debt.type)}</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <div
                          key={j}
                          className="h-1 w-3 rounded-full"
                          style={{
                            background: j < Math.ceil(debt.severity * 5) ? '#EF4444' : 'rgba(255,255,255,0.08)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-text-muted">{debt.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Micro Intervention */}
        {intervention && (
          <div className="border-b border-surface-border/20 px-4 py-4">
            <h4 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
              <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              {intervention.content.title}
            </h4>
            <p className="text-[11px] leading-relaxed text-text-muted">{intervention.content.explanation}</p>

            {intervention.content.examples.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {intervention.content.examples.map((ex, i) => (
                  <div key={i} className="rounded-md bg-accent-subtle/20 px-3 py-2 text-[10px] text-text-secondary font-mono leading-relaxed">
                    {ex}
                  </div>
                ))}
              </div>
            )}

            {intervention.content.followUpQuestions.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-semibold text-text-faint">Think about:</p>
                <ul className="space-y-1">
                  {intervention.content.followUpQuestions.map((q, i) => (
                    <li key={i} className="flex gap-1.5 text-[10px] text-text-muted">
                      <span className="mt-0.5 text-accent">\u2192</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}


      </div>
    </div>
  );
};
