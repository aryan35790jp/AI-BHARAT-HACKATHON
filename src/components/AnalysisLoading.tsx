import React from 'react';

export const AnalysisLoading: React.FC = () => (
  <div className="animate-fade-in space-y-4">
    {/* Hero skeleton */}
    <div className="glass rounded-2xl border border-surface-border/50 p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="h-3 w-24 animate-shimmer rounded bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
          <div className="h-6 w-40 animate-shimmer rounded-lg bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
          <div className="h-7 w-28 animate-shimmer rounded-full bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
        </div>
        <div className="h-14 w-14 animate-shimmer rounded-full bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
      </div>
      <div className="mt-5 h-1.5 w-full animate-shimmer rounded-full bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
    </div>

    {/* Debt skeleton */}
    <div className="glass rounded-2xl border border-surface-border/50 p-5">
      <div className="mb-4 h-4 w-32 animate-shimmer rounded bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-surface-border/20 p-4">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-28 animate-shimmer rounded bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
              <div className="h-3 w-12 animate-shimmer rounded bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
            </div>
            <div className="mt-3 h-3 w-full animate-shimmer rounded bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
            <div className="mt-2 h-3 w-3/4 animate-shimmer rounded bg-gradient-to-r from-surface-border/40 via-surface-border/60 to-surface-border/40 bg-[length:200%_100%]" />
          </div>
        ))}
      </div>
    </div>

    {/* Thinking indicator */}
    <div className="flex items-center justify-center gap-3 py-4">
      <div className="flex gap-1">
        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60" style={{ animationDelay: '0ms' }} />
        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60" style={{ animationDelay: '150ms' }} />
        <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs font-medium text-text-faint">Analyzing your understanding...</span>
    </div>
  </div>
);
