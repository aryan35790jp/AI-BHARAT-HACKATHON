import React from 'react';
import type { DemoScenario } from '../data/demoScenarios';

interface DemoModeBarProps {
  enabled: boolean;
  onToggle: () => void;
  scenarios: DemoScenario[];
  onSelectScenario: (scenario: DemoScenario) => void;
}

export const DemoModeBar: React.FC<DemoModeBarProps> = ({
  enabled,
  onToggle,
  scenarios,
  onSelectScenario,
}) => {
  return (
    <div
      className={`border-b transition-all duration-300 ${
        enabled
          ? 'border-accent/20 bg-accent/[0.04]'
          : 'border-surface-border/30 bg-canvas-subtle/30'
      }`}
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-2">
        {/* Toggle */}
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-xs"
        >
          <div
            className={`relative h-4 w-7 rounded-full transition-colors duration-200 ${
              enabled ? 'bg-accent' : 'bg-surface-border'
            }`}
          >
            <div
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                enabled ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </div>
          <span className={`font-medium ${enabled ? 'text-accent' : 'text-text-faint'}`}>
            🎥 Demo Mode
          </span>
        </button>

        {/* Scenario pills */}
        {enabled && (
          <div className="flex items-center gap-1.5 animate-fade-in">
            <span className="mr-1 text-[10px] font-medium text-text-faint">Try:</span>
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelectScenario(s)}
                className="rounded-lg border border-accent/20 bg-accent-subtle/50 px-2.5 py-1 text-[11px] font-medium text-accent transition-all hover:border-accent/40 hover:bg-accent-subtle"
                title={s.description}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
