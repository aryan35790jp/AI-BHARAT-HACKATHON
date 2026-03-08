import React from 'react';
import type { UnderstandingLevel } from '../types/models';
import { getNodeColor, getLevelLabel } from '../utils/graphLayout';

interface DepthModelProps {
  currentLevel: UnderstandingLevel;
  confidence: number;
}

const LEVELS: UnderstandingLevel[] = ['unknown', 'surface', 'partial', 'solid', 'deep'];

const LEVEL_DESCRIPTIONS: Record<UnderstandingLevel, string> = {
  unknown: 'Has not yet demonstrated understanding of this concept',
  surface: 'Can restate definitions but lacks causal understanding',
  partial: 'Grasps core ideas but has gaps in edge cases and connections',
  solid: 'Connects concepts correctly with practical application ability',
  deep: 'Full structural understanding with ability to teach and extend',
};

const LEVEL_INDEX: Record<UnderstandingLevel, number> = {
  unknown: 0,
  surface: 1,
  partial: 2,
  solid: 3,
  deep: 4,
};

export const DepthModel: React.FC<DepthModelProps> = ({ currentLevel, confidence }) => {
  const currentIdx = LEVEL_INDEX[currentLevel];

  return (
    <div className="glass rounded-2xl border border-surface-border/50 p-5">
      <div className="mb-4 flex items-center gap-2">
        <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
        </svg>
        <h3 className="text-sm font-semibold text-text-primary">Understanding Depth Model</h3>
      </div>

      <div className="relative space-y-0">
        {LEVELS.map((level, i) => {
          const color = getNodeColor(level);
          const label = getLevelLabel(level);
          const desc = LEVEL_DESCRIPTIONS[level];
          const isActive = i === currentIdx;
          const isPast = i < currentIdx;
          const isFuture = i > currentIdx;

          return (
            <div key={level} className="relative flex gap-3">
              {/* Vertical connector line */}
              <div className="flex flex-col items-center">
                <div
                  className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                    isActive
                      ? 'scale-110'
                      : ''
                  }`}
                  style={{
                    borderColor: isActive || isPast ? color : 'rgba(46, 46, 50, 0.6)',
                    backgroundColor: isActive ? `${color}20` : isPast ? `${color}10` : 'transparent',
                    boxShadow: isActive ? `0 0 12px ${color}40` : 'none',
                  }}
                >
                  {isPast && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                  {isActive && (
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  )}
                </div>
                {i < LEVELS.length - 1 && (
                  <div
                    className="w-0.5 flex-1 min-h-[24px] transition-colors duration-500"
                    style={{
                      backgroundColor: isPast ? `${color}40` : 'rgba(46, 46, 50, 0.3)',
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div className={`pb-4 pt-0.5 transition-opacity ${isFuture ? 'opacity-40' : ''}`}>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: isActive || isPast ? color : undefined }}
                  >
                    {label}
                  </span>
                  {isActive && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: `${color}15`, color }}
                    >
                      {Math.round(confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className={`mt-0.5 text-[11px] leading-relaxed ${isActive ? 'text-text-secondary' : 'text-text-faint'}`}>
                  {desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
