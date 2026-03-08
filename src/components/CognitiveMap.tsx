import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { ConceptNode } from './ConceptNode';
import type { KnowledgeNodeData } from './ConceptNode';
import type { AnalyzeResponse } from '../types/models';
import { buildKnowledgeGraph, needsExpansion } from '../utils/knowledgeGraph';
import { expandConcept } from '../api/endpoints';
import { useState } from 'react';

/* ─── Custom node type registry ─── */
const nodeTypes = { concept: ConceptNode };

/* ─── Props ─── */
interface CognitiveMapProps {
  history: AnalyzeResponse[];
  /** Domain placeholder nodes seeded at chat creation (initial graph skeleton) */
  domainNodes?: string[];
  /** Single-click on an analyzed node → inspect it */
  onSelectConcept: (result: AnalyzeResponse) => void;
  /** Single-click on a satellite node → inspect it */
  onSatelliteClick?: (conceptName: string) => void;
  /** Double-click on any node → navigate to chat to explore */
  onExploreConcept?: (conceptName: string) => void;
  selectedConceptId?: string | null;
}

/* ─── Main Component ─── */
export const CognitiveMap: React.FC<CognitiveMapProps> = ({
  history,
  domainNodes = [],
  onSelectConcept,
  onSatelliteClick,
  onExploreConcept,
  selectedConceptId,
}) => {
  /* ── LLM concept expansions: conceptId → list of related concept names ── */
  const [expansions, setExpansions] = useState<Record<string, string[]>>({});
  const expandingRef = useRef<Set<string>>(new Set());

  /** Persistent map of node positions — survives graph rebuilds, prevents scrambling */
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  /* Fetch LLM-generated concepts for analyses with sparse AI returns */
  useEffect(() => {
    const toExpand = history.filter(
      (a) => needsExpansion(a) && !expansions[a.conceptId] && !expandingRef.current.has(a.conceptId),
    );
    if (toExpand.length === 0) return;

    toExpand.forEach((a) => expandingRef.current.add(a.conceptId));

    Promise.allSettled(
      toExpand.map((a) =>
        expandConcept(a.conceptId).then((r) => ({ conceptId: a.conceptId, concepts: r.concepts })),
      ),
    ).then((results) => {
      const newExpansions: Record<string, string[]> = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.concepts.length > 0) {
          newExpansions[r.value.conceptId] = r.value.concepts;
        }
      });
      if (Object.keys(newExpansions).length > 0) {
        setExpansions((prev) => ({ ...prev, ...newExpansions }));
      }
    });
  }, [history, expansions]);
  // Step 1: Run force layout ONLY when data changes — not on node click.
  // Pass existing positions so nodes don't scramble after interaction.
  const { graphNodes, layoutEdges, analyzedIds } = useMemo(() => {
    const graph = buildKnowledgeGraph(
      history,
      domainNodes,
      expansions,
      nodePositionsRef.current,
    );
    // Seed any new nodes into the position ref so subsequent rebuilds lock them
    for (const n of graph.nodes) {
      if (!nodePositionsRef.current.has(n.id)) {
        nodePositionsRef.current.set(n.id, n.position);
      }
    }
    return { graphNodes: graph.nodes, layoutEdges: graph.edges, analyzedIds: graph.analyzedIds };
  }, [history, domainNodes, expansions]);

  // Step 2: Apply the selected flag in a separate memo that does NOT re-run the layout.
  const layoutNodes = useMemo(() => {
    const sel = (selectedConceptId ?? '').toLowerCase();
    return graphNodes.map((n) => {
      const nId = n.id.toLowerCase();
      const isSelected = nId === sel || nId === `sat_${sel.replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`;
      return { ...n, selected: isSelected };
    });
  }, [graphNodes, selectedConceptId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // Replace the full node + edge lists whenever the layout changes.
  // setNodes/setEdges (not incremental replace) guarantees stale nodes/edges
  // are removed so blue threads never ghost-linger after graph updates.
  React.useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  /** Track drag positions so subsequent graph rebuilds don't scramble the map */
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          nodePositionsRef.current.set(change.id, change.position);
        }
      }
    },
    [onNodesChange],
  );

  /* ── Single-click: always inspect, never navigate ── */
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const isSatellite = node.id.startsWith('sat_');
      if (isSatellite) {
        // Satellite node click → inspect satellite
        const data = node.data as KnowledgeNodeData;
        onSatelliteClick?.(data.label);
        return;
      }
      // Analyzed node click → inspect analysis
      const match = history.find(
        (h) => h.conceptId.toLowerCase() === node.id.toLowerCase(),
      );
      if (match) onSelectConcept(match);
    },
    [history, onSelectConcept, onSatelliteClick],
  );

  /* ── Double-click: navigate to chat to explore ── */
  const handleNodeDoubleClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const data = node.data as KnowledgeNodeData;
      onExploreConcept?.(data.label);
    },
    [onExploreConcept],
  );

  /* ─── Empty state ─── */
  if (history.length === 0 && domainNodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
        {/* Animated constellation placeholder */}
        <div className="relative h-36 w-36">
          <div className="absolute inset-0 animate-pulse rounded-full bg-accent/5" />
          <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/40 shadow-lg shadow-accent/20" />
          <div className="absolute left-1/4 top-1/4 h-2.5 w-2.5 rounded-full bg-red-400/40 animate-bounce" style={{ animationDelay: '0.2s' }} />
          <div className="absolute right-1/4 top-1/3 h-2.5 w-2.5 rounded-full bg-amber-400/40 animate-bounce" style={{ animationDelay: '0.5s' }} />
          <div className="absolute bottom-1/4 left-1/3 h-2.5 w-2.5 rounded-full bg-emerald-400/40 animate-bounce" style={{ animationDelay: '0.8s' }} />
          <div className="absolute right-1/3 bottom-1/3 h-2 w-2 rounded-full bg-blue-400/30 animate-bounce" style={{ animationDelay: '1.1s' }} />
          {/* Connecting lines */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 144 144">
            <line x1="72" y1="72" x2="36" y2="36" stroke="rgba(99,102,241,0.12)" strokeWidth="1" />
            <line x1="72" y1="72" x2="108" y2="48" stroke="rgba(99,102,241,0.12)" strokeWidth="1" />
            <line x1="72" y1="72" x2="48" y2="108" stroke="rgba(99,102,241,0.12)" strokeWidth="1" />
            <line x1="72" y1="72" x2="96" y2="96" stroke="rgba(99,102,241,0.10)" strokeWidth="1" />
            <line x1="36" y1="36" x2="108" y2="48" stroke="rgba(99,102,241,0.06)" strokeWidth="0.5" strokeDasharray="4 4" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-semibold text-text-primary">Your knowledge graph is empty</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-text-muted">
            Analyze concepts to build your knowledge graph. Each concept becomes a node
            — related concepts appear as satellites, growing your map organically.
          </p>
        </div>
      </div>
    );
  }

  // Stats for the header
  const satelliteCount = layoutNodes.filter((n) => (n.data as KnowledgeNodeData).nodeKind === 'satellite').length;

  return (
    <div className="relative h-full w-full">
      {/* Graph stats overlay */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg border border-surface-border/40 bg-surface/60 backdrop-blur-xl px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-accent" />
          <span className="text-[11px] font-medium text-text-secondary">
            {analyzedIds.size} analyzed
          </span>
        </div>
        {satelliteCount > 0 && (
          <>
            <div className="h-3 w-px bg-surface-border/50" />
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full border border-dashed border-zinc-500" />
              <span className="text-[11px] font-medium text-text-muted">
                {satelliteCount} related
              </span>
            </div>
          </>
        )}
        <div className="h-3 w-px bg-surface-border/50" />
        <span className="text-[11px] font-medium text-text-muted">
          {layoutEdges.length} connections
        </span>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.35, maxZoom: 1.1 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(113,113,122,0.10)"
        />
        <Controls
          className="!bg-surface/90 !border-surface-border/50 !rounded-xl !shadow-2xl [&>button]:!bg-surface [&>button]:!border-surface-border/50 [&>button]:!text-text-secondary [&>button:hover]:!bg-surface-hover [&>button:hover]:!text-text-primary [&>button]:!rounded-lg"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-surface/80 !border-surface-border/50 !rounded-xl !shadow-xl"
          nodeColor={(node) => {
            const d = node.data as KnowledgeNodeData;
            if (d.nodeKind === 'satellite') return 'rgba(113,113,122,0.3)';
            const colors: Record<string, string> = {
              surface: '#EF4444',
              partial: '#F59E0B',
              solid: '#10B981',
              deep: '#3B82F6',
            };
            return colors[d.level] ?? '#71717A';
          }}
          maskColor="rgba(0,0,0,0.55)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
};
