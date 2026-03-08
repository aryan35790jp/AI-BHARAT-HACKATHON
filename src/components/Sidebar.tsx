import React, { useState } from 'react';
import type { AnalyzeResponse } from '../types/models';
import { getNodeColor, getLevelLabel } from '../utils/graphLayout';

interface SidebarProps {
  history: AnalyzeResponse[];
  collapsed: boolean;
  onToggle: () => void;
  onSelectItem: (item: AnalyzeResponse) => void;
  onNewChat: () => void;
  selectedConceptId?: string | null;
}

/** Deduplicate history to latest per concept */
function getUniqueConcepts(history: AnalyzeResponse[]): AnalyzeResponse[] {
  const map = new Map<string, AnalyzeResponse>();
  for (const h of history) {
    const key = h.conceptId.toLowerCase();
    if (!map.has(key)) map.set(key, h);
  }
  return Array.from(map.values());
}

export const Sidebar: React.FC<SidebarProps> = ({
  history,
  collapsed,
  onToggle,
  onSelectItem,
  onNewChat,
  selectedConceptId,
}) => {
  const [search, setSearch] = useState('');
  const concepts = getUniqueConcepts(history);
  const filtered = search
    ? concepts.filter((c) =>
        c.conceptId.toLowerCase().includes(search.toLowerCase()),
      )
    : concepts;

  return (
    <aside
      className={`relative z-30 flex flex-shrink-0 flex-col border-r border-surface-border/40 bg-canvas-subtle/60 backdrop-blur-xl transition-all duration-300 ease-out ${
        collapsed ? 'w-14' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-surface-border/30 px-3">
        {!collapsed && (
          <span className="text-xs font-semibold uppercase tracking-wider text-text-faint">
            Sessions
          </span>
        )}
        <button
          onClick={onToggle}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-surface hover:text-text-secondary"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className={`h-4 w-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* New Chat button */}
      <div className={`flex-shrink-0 p-2 ${collapsed ? 'px-1.5' : ''}`}>
        <button
          onClick={onNewChat}
          className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-surface-border/50 py-2 text-xs font-medium text-text-muted transition-all hover:border-accent/40 hover:bg-accent-subtle/30 hover:text-accent ${
            collapsed ? 'px-0' : 'px-3'
          }`}
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {!collapsed && <span>New Analysis</span>}
        </button>
      </div>

      {/* Search (only expanded) */}
      {!collapsed && (
        <div className="flex-shrink-0 px-2 pb-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search concepts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-surface-border/40 bg-surface/30 py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder-text-faint outline-none transition-colors focus:border-accent/50 focus:bg-surface/50"
            />
          </div>
        </div>
      )}

      {/* Concept list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && !collapsed ? (
          <div className="flex flex-col items-center py-8 text-center">
            <p className="text-[11px] text-text-faint">
              {history.length === 0
                ? 'Analyze your first concept to begin'
                : 'No matches'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((item) => {
              const color = getNodeColor(item.understandingLevel);
              const label = getLevelLabel(item.understandingLevel);
              const isActive =
                selectedConceptId?.toLowerCase() === item.conceptId.toLowerCase();

              return (
                <button
                  key={item.conceptId}
                  onClick={() => onSelectItem(item)}
                  className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all ${
                    isActive
                      ? 'bg-accent-subtle/40 text-text-primary'
                      : 'text-text-secondary hover:bg-surface/40 hover:text-text-primary'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  {/* Level dot */}
                  <div
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: color, boxShadow: `0 0 6px ${color}40` }}
                  />

                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium leading-tight">
                        {item.conceptId}
                      </p>
                      <p className="text-[10px] text-text-faint">
                        {label} · {Math.round(item.confidence * 100)}%
                      </p>
                    </div>
                  )}

                  {!collapsed && item.debtIndicators.length > 0 && (
                    <span className="flex-shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-400">
                      {item.debtIndicators.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {!collapsed && history.length > 0 && (
        <div className="flex-shrink-0 border-t border-surface-border/30 px-3 py-2.5">
          <div className="flex items-center justify-between text-[10px] text-text-faint">
            <span>{concepts.length} concept{concepts.length !== 1 ? 's' : ''}</span>
            <span>{history.length} total analyses</span>
          </div>
        </div>
      )}
    </aside>
  );
};
