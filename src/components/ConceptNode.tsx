import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { UnderstandingLevel } from '../types/models';

export type NodeKind = 'analyzed' | 'satellite';

export interface KnowledgeNodeData {
  label: string;
  level: UnderstandingLevel;
  confidence: number;
  debtCount: number;
  nodeKind: NodeKind;
  relatedCount: number;
  [key: string]: unknown;
}

// Legacy alias for backwards compat
export type ConceptNodeData = KnowledgeNodeData;

const LEVEL_CONFIG: Record<
  UnderstandingLevel,
  { color: string; glow: string; bg: string; label: string }
> = {
  unknown: {
    color: '#6B7280',
    glow: 'rgba(107,114,128,0.35)',
    bg: 'rgba(107,114,128,0.12)',
    label: 'Unknown',
  },
  surface: {
    color: '#EF4444',
    glow: 'rgba(239,68,68,0.35)',
    bg: 'rgba(239,68,68,0.12)',
    label: 'Surface',
  },
  partial: {
    color: '#F59E0B',
    glow: 'rgba(245,158,11,0.35)',
    bg: 'rgba(245,158,11,0.12)',
    label: 'Partial',
  },
  solid: {
    color: '#10B981',
    glow: 'rgba(16,185,129,0.35)',
    bg: 'rgba(16,185,129,0.12)',
    label: 'Solid',
  },
  deep: {
    color: '#3B82F6',
    glow: 'rgba(59,130,246,0.35)',
    bg: 'rgba(59,130,246,0.12)',
    label: 'Deep',
  },
};

/* ━━━━━━━━━━━━━━━━ Satellite Node ━━━━━━━━━━━━━━━━ */
const SatelliteNode: React.FC<{ d: KnowledgeNodeData; selected: boolean }> = ({ d, selected }) => (
  <>
    <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
    <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    <div
      className="group relative flex flex-col items-center cursor-pointer"
      style={{ filter: selected ? 'drop-shadow(0 0 10px rgba(99,102,241,0.4))' : undefined }}
    >
      {/* Dashed ring */}
      <div
        className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-dashed transition-all duration-300 group-hover:scale-110"
        style={{
          borderColor: 'rgba(113,113,122,0.4)',
          background: 'rgba(24,24,27,0.5)',
          boxShadow: selected ? '0 0 16px rgba(99,102,241,0.2)' : undefined,
        }}
      >
        {/* Question mark or explore icon */}
        <svg className="h-4 w-4 text-text-faint group-hover:text-accent transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </div>
      {/* Label */}
      <div className="mt-1.5 max-w-[90px] text-center">
        <span className="text-[10px] font-medium leading-tight text-text-muted line-clamp-2 group-hover:text-text-secondary transition-colors">
          {d.label}
        </span>
      </div>
      {/* Explore hint on hover */}
      <span className="mt-0.5 rounded-full px-1.5 py-px text-[8px] font-medium text-text-faint opacity-0 group-hover:opacity-100 transition-opacity">
        explore
      </span>
    </div>
  </>
);

/* ━━━━━━━━━━━━━━━━ Analyzed (Full) Node ━━━━━━━━━━━━━━━━ */
const AnalyzedNode: React.FC<{ d: KnowledgeNodeData; selected: boolean }> = ({ d, selected }) => {
  const cfg = LEVEL_CONFIG[d.level] ?? LEVEL_CONFIG.surface;
  const pct = Math.round(d.confidence * 100);
  const isSurface = d.level === 'surface';
  // Circle size: 80px for main analyzed node
  const SIZE = 80;
  const R = 36; // SVG circle radius
  const CIRC = 2 * Math.PI * R;
  const dashLen = (pct / 100) * CIRC;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />

      <div
        className="group relative flex flex-col items-center cursor-pointer"
        style={{ filter: selected ? `drop-shadow(0 0 18px ${cfg.glow})` : undefined }}
      >
        {/* Ambient glow */}
        <div
          className={`absolute rounded-full transition-opacity duration-500 ${isSurface ? 'animate-pulse' : ''}`}
          style={{
            inset: '-12px',
            background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 70%)`,
            opacity: selected ? 0.85 : 0.3,
          }}
        />

        {/* Main circle */}
        <div
          className="relative z-10 flex items-center justify-center rounded-full border-2 transition-all duration-300 group-hover:scale-105"
          style={{
            width: SIZE,
            height: SIZE,
            borderColor: cfg.color,
            background: cfg.bg,
            boxShadow: `0 0 24px ${cfg.glow}, inset 0 0 16px ${cfg.bg}`,
          }}
        >
          {/* Confidence arc */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
            <circle
              cx="40" cy="40" r={R}
              fill="none" stroke={cfg.color} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${dashLen} ${CIRC - dashLen}`}
              className="transition-all duration-700"
            />
          </svg>

          {/* Center content */}
          <div className="relative z-10 flex flex-col items-center">
            <span className="text-sm font-bold text-text-primary">{pct}%</span>
          </div>
        </div>

        {/* Concept name */}
        <div className="mt-2.5 max-w-[130px] text-center">
          <span className="text-[12px] font-semibold leading-tight text-text-primary line-clamp-2">
            {d.label}
          </span>
        </div>

        {/* Level badge */}
        <span
          className="mt-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ color: cfg.color, background: cfg.bg }}
        >
          {cfg.label}
        </span>

        {/* Debt count badge */}
        {d.debtCount > 0 && (
          <div className="absolute -top-1 -right-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-lg shadow-red-500/30 ring-2 ring-canvas">
            {d.debtCount}
          </div>
        )}

        {/* Related count badge */}
        {d.relatedCount > 0 && (
          <div className="absolute -bottom-0.5 -right-1 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-accent/80 text-[8px] font-bold text-white shadow-sm">
            {d.relatedCount}
          </div>
        )}
      </div>
    </>
  );
};

/* ━━━━━━━━━━━━━━━━ Main Component ━━━━━━━━━━━━━━━━ */
const ConceptNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as KnowledgeNodeData;
  const isSatellite = d.nodeKind === 'satellite';

  if (isSatellite) {
    return <SatelliteNode d={d} selected={!!selected} />;
  }
  return <AnalyzedNode d={d} selected={!!selected} />;
};

export const ConceptNode = memo(ConceptNodeComponent);
