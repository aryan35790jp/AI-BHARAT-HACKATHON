import React from 'react';

interface WelcomeHeroProps {
  hasHistory: boolean;
}

export const WelcomeHero: React.FC<WelcomeHeroProps> = ({ hasHistory }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
    {/* Icon */}
    <div className="relative mb-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-subtle">
        <svg className="h-8 w-8 text-accent animate-pulse-glow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
        </svg>
      </div>
      <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-accent/40 animate-pulse" />
    </div>

    {/* Text */}
    <h2 className="text-lg font-semibold tracking-tight text-text-primary">
      {hasHistory ? 'Ready for another analysis' : 'Map your understanding'}
    </h2>
    <p className="mt-2 max-w-xs text-sm leading-relaxed text-text-muted">
      {hasHistory
        ? 'Enter a concept above to continue building your cognitive map.'
        : 'Explain a concept, paste code, or reason through a question. The AI will analyze your understanding and surface cognitive debt.'}
    </p>

    {/* Feature pills */}
    {!hasHistory && (
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {[
          { icon: '🧠', label: 'Detect knowledge gaps' },
          { icon: '🔄', label: 'Find circular reasoning' },
          { icon: '⚡', label: 'Get micro-interventions' },
        ].map((feature) => (
          <span
            key={feature.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-surface-border/40 bg-canvas-subtle px-3 py-1.5 text-xs text-text-muted"
          >
            <span>{feature.icon}</span>
            {feature.label}
          </span>
        ))}
      </div>
    )}
  </div>
);
