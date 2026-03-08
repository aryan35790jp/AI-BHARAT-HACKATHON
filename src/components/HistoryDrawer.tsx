import React, { useEffect, useRef } from 'react';
import type { AnalyzeResponse } from '../types/models';
import { getNodeColor, getLevelLabel, formatConfidence } from '../utils/graphLayout';

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  history: AnalyzeResponse[];
  onSelect: (item: AnalyzeResponse) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  open,
  onClose,
  history,
  onSelect,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-surface-border/50 bg-canvas-subtle/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border/40 px-5 py-4">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-text-primary">Analysis History</h2>
            {history.length > 0 && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted">
                {history.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-faint transition-colors hover:bg-surface hover:text-text-secondary"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface">
                <svg className="h-5 w-5 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-sm text-text-muted">No analyses yet</p>
              <p className="mt-1 text-xs text-text-faint">Results will appear here as you analyze concepts.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {history.map((item, i) => {
                const color = getNodeColor(item.understandingLevel);
                const label = getLevelLabel(item.understandingLevel);
                const confidence = formatConfidence(item.confidence);
                const debtCount = item.debtIndicators.length;

                return (
                  <button
                    key={`${item.conceptId}-${i}`}
                    onClick={() => { onSelect(item); onClose(); }}
                    className="group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface/60"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-text-primary group-hover:text-accent">
                          {item.conceptId}
                        </span>
                        <span className="flex-shrink-0 text-[11px] font-medium tabular-nums text-text-faint">
                          {confidence}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: `${color}15`, color }}
                        >
                          {label}
                        </span>
                        {debtCount > 0 && (
                          <span className="rounded-full bg-orange-400/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-400">
                            {debtCount} debt{debtCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
