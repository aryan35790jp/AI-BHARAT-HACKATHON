import React from 'react';
import type { UnderstandingLevel } from '../types/models';
import { getNodeColor, getLevelLabel } from '../utils/graphLayout';

interface ImprovementRoadmapProps {
  currentLevel: UnderstandingLevel;
  conceptId: string;
}

interface RoadmapStep {
  action: string;
  description: string;
  icon: string;
}

const ROADMAP_STEPS: Record<UnderstandingLevel, RoadmapStep[]> = {
  unknown: [
    {
      action: 'Start with the basics',
      description: 'Read a beginner-friendly introduction and try to summarize what the concept is about.',
      icon: '📖',
    },
    {
      action: 'Try a simple example',
      description: 'Look at code examples and try to explain what each line does.',
      icon: '💡',
    },
    {
      action: 'Explain in your own words',
      description: 'Don\'t worry about being perfect — just describe what you think the concept does.',
      icon: '💬',
    },
  ],
  surface: [
    {
      action: 'Explain the mechanism',
      description: 'Go beyond "what" to "how" — describe the internal process step by step.',
      icon: '🔍',
    },
    {
      action: 'Add a concrete example',
      description: 'Write a real code example or real-world analogy that demonstrates the concept.',
      icon: '💡',
    },
    {
      action: 'Identify edge cases',
      description: 'What happens at the boundaries? What are the failure modes?',
      icon: '⚠️',
    },
    {
      action: 'Connect to related concepts',
      description: 'How does this concept relate to others in the same domain?',
      icon: '🔗',
    },
  ],
  partial: [
    {
      action: 'Address the logical gaps',
      description: 'Fill in the causal chain — explain _why_ each step leads to the next.',
      icon: '🧩',
    },
    {
      action: 'Test with counterexamples',
      description: 'Try to break your own explanation. What doesn\'t it account for?',
      icon: '🔄',
    },
    {
      action: 'Add formal precision',
      description: 'Replace vague language with precise terminology and definitions.',
      icon: '📐',
    },
  ],
  solid: [
    {
      action: 'Explore advanced patterns',
      description: 'Look at how experts use this concept in production systems.',
      icon: '🚀',
    },
    {
      action: 'Teach it to someone else',
      description: 'Can you explain it at multiple levels of abstraction?',
      icon: '🎓',
    },
  ],
  deep: [
    {
      action: 'You\'re here! Maintain depth.',
      description: 'Revisit periodically. True mastery includes knowing what you don\'t know.',
      icon: '🏆',
    },
  ],
};

const NEXT_LEVEL: Record<UnderstandingLevel, UnderstandingLevel | null> = {
  unknown: 'surface',
  surface: 'partial',
  partial: 'solid',
  solid: 'deep',
  deep: null,
};

export const ImprovementRoadmap: React.FC<ImprovementRoadmapProps> = ({
  currentLevel,
  conceptId,
}) => {
  const steps = ROADMAP_STEPS[currentLevel];
  const nextLevel = NEXT_LEVEL[currentLevel];
  const nextColor = nextLevel ? getNodeColor(nextLevel) : null;
  const nextLabel = nextLevel ? getLevelLabel(nextLevel) : null;
  const currentColor = getNodeColor(currentLevel);

  return (
    <div className="glass rounded-2xl border border-surface-border/50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
          <h3 className="text-sm font-semibold text-text-primary">Improvement Roadmap</h3>
        </div>
        {nextLevel && nextColor && nextLabel && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: `${nextColor}15`, color: nextColor }}
          >
            Target: {nextLabel}
          </span>
        )}
      </div>

      {nextLevel && (
        <p className="mb-4 text-xs leading-relaxed text-text-muted">
          To improve your understanding of <span className="font-medium text-text-secondary">{conceptId}</span> from{' '}
          <span style={{ color: currentColor }} className="font-semibold">{getLevelLabel(currentLevel)}</span> to{' '}
          <span style={{ color: nextColor! }} className="font-semibold">{nextLabel}</span>:
        </p>
      )}

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div
            key={i}
            className="flex gap-3 rounded-xl border border-surface-border/30 bg-canvas-subtle/40 p-3 transition-colors hover:border-surface-border/50 hover:bg-canvas-subtle/60"
          >
            <span className="mt-0.5 text-base">{step.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-text-primary">{step.action}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{step.description}</p>
            </div>
            <span className="mt-0.5 text-[10px] font-medium text-text-faint">Step {i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
