import React, { useState } from 'react';
import type { MicroIntervention } from '../types/models';

interface MicroInterventionCardProps {
  intervention: MicroIntervention;
  onMarkUnderstood: () => void;
}

const TYPE_LABELS: Record<MicroIntervention['type'], string> = {
  clarification: 'Clarification',
  counter_example: 'Counter Example',
  mental_model: 'Mental Model',
  aha_bridge: 'Aha Bridge',
};

const TYPE_ICONS: Record<MicroIntervention['type'], string> = {
  clarification: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  counter_example: 'M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  mental_model: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  aha_bridge: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
};

const TYPE_COLORS: Record<MicroIntervention['type'], string> = {
  clarification: '#3B82F6',
  counter_example: '#F97316',
  mental_model: '#10B981',
  aha_bridge: '#A855F7',
};

export const MicroInterventionCard: React.FC<MicroInterventionCardProps> = ({
  intervention,
  onMarkUnderstood,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [marking, setMarking] = useState(false);
  const color = TYPE_COLORS[intervention.type];

  const handleMarkUnderstood = async () => {
    setMarking(true);
    onMarkUnderstood();
  };

  return (
    <div
      className="overflow-hidden rounded-xl border transition-colors"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}06` }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}18` }}
          >
            <svg
              className="h-4 w-4"
              style={{ color }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={TYPE_ICONS[intervention.type]}
              />
            </svg>
          </div>
          <div>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color }}
            >
              {TYPE_LABELS[intervention.type]}
            </span>
            <h4 className="text-sm font-semibold text-slate-200">
              {intervention.content.title}
            </h4>
          </div>
        </div>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: `${color}15` }}>
          <p className="text-sm leading-relaxed text-slate-300">
            {intervention.content.explanation}
          </p>

          {intervention.content.examples.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Examples
              </p>
              <ul className="mt-2 space-y-2">
                {intervention.content.examples.map((example, idx) => (
                  <li
                    key={idx}
                    className="flex gap-2.5 rounded-lg bg-slate-800/40 px-3 py-2 text-sm text-slate-400"
                  >
                    <span className="mt-0.5 flex-shrink-0 text-slate-600">
                      {idx + 1}.
                    </span>
                    <span>{example}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {intervention.content.followUpQuestions.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Think About
              </p>
              <ul className="mt-2 space-y-1.5">
                {intervention.content.followUpQuestions.map((q, idx) => (
                  <li
                    key={idx}
                    className="flex gap-2 text-sm text-slate-400"
                  >
                    <span className="flex-shrink-0 text-blue-400">?</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={handleMarkUnderstood}
            disabled={marking}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            {marking ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Updating...</span>
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                <span>Mark as Understood</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
