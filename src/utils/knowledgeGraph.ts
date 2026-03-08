/**
 * Knowledge Graph Builder — v2
 *
 * Architecture:
 *  - Each chat has exactly ONE isolated graph (never mixed with other chats/domains)
 *  - Analyzed nodes are created ONLY when confidence ≥ 70%
 *  - Domain placeholder nodes are seeded at chat creation time
 *  - The root node (chat topic) is always pinned to the visual center
 *  - Existing node positions are preserved across rebuilds (no scrambling)
 *  - Edge IDs are stable content-based strings (never positional indexes)
 */

import type { Node, Edge } from '@xyflow/react';
import * as d3 from 'd3';
import type { AnalyzeResponse } from '../types/models';
import type { KnowledgeNodeData } from '../components/ConceptNode';
import { inferRelationships } from './conceptRelationships';

/* ─── Constants ─── */
// All analyses are shown — confidence is communicated via node visual style (level/glow)
// rather than by hiding nodes entirely.
const CONFIDENCE_THRESHOLD = 0; // show every analysis (was 0.70, caused empty graphs)

const ANALYZED_WIDTH = 160;
const ANALYZED_HEIGHT = 160;
const SATELLITE_WIDTH = 100;
const SATELLITE_HEIGHT = 80;

/* ─── Normalization ─── */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/* ─── Format display names ─── */
function formatConceptName(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Deduplicate: keep latest occurrence per concept ─── */
function deduplicateLatest(analyses: AnalyzeResponse[]): AnalyzeResponse[] {
  const map = new Map<string, AnalyzeResponse>();
  for (const a of analyses) map.set(normalize(a.conceptId), a);
  return Array.from(map.values());
}

/**
 * Determine if an analysis needs LLM concept expansion.
 */
export function needsExpansion(a: AnalyzeResponse): boolean {
  return (a.relatedConcepts?.length ?? 0) < 3;
}

/**
 * Get related/prerequisite concepts for a given analysis.
 * Uses AI-returned data when available, falls back to LLM expansions.
 */
function getConceptsForNode(
  a: AnalyzeResponse,
  expansions: Record<string, string[]>,
): { related: string[]; prereqs: string[] } {
  const hasAIRelated = (a.relatedConcepts?.length ?? 0) >= 3;
  const hasAIPrereqs = (a.prerequisites?.length ?? 0) >= 2;

  if (hasAIRelated && hasAIPrereqs) {
    return { related: a.relatedConcepts ?? [], prereqs: a.prerequisites ?? [] };
  }

  const expanded = expansions[a.conceptId] ?? [];
  if (expanded.length > 0) {
    const mid = Math.ceil(expanded.length / 2);
    return {
      related: hasAIRelated ? (a.relatedConcepts ?? []) : expanded.slice(0, mid),
      prereqs: hasAIPrereqs ? (a.prerequisites ?? []) : expanded.slice(mid),
    };
  }

  return {
    related: a.relatedConcepts ?? [],
    prereqs: a.prerequisites ?? [],
  };
}

/* ─── Public graph result type ─── */
export interface KnowledgeGraph {
  nodes: Node[];
  edges: Edge[];
  analyzedIds: Set<string>;
}

/**
 * Build the knowledge graph for a SINGLE CHAT (domain-isolated).
 *
 * @param allAnalyses        All analyses from this chat’s messages
 * @param domainNodes        Initial domain placeholder concept names (seeded at chat creation)
 * @param expansions         LLM-generated concept expansions keyed by conceptId
 * @param existingPositions  Known positions from previous renders (preserves layout stability)
 */
export function buildKnowledgeGraph(
  allAnalyses: AnalyzeResponse[],
  domainNodes: string[] = [],
  expansions: Record<string, string[]> = {},
  existingPositions: Map<string, { x: number; y: number }> = new Map(),
): KnowledgeGraph {
  const unique = deduplicateLatest(allAnalyses);

  // All analyses become analyzed nodes (confidence communicated visually via level)
  const highConf = unique.filter((a) => a.confidence >= CONFIDENCE_THRESHOLD);
  const highNorm = new Map<string, AnalyzeResponse>();
  for (const a of highConf) highNorm.set(normalize(a.conceptId), a);

  const analyzedIdSet = new Set<string>(highConf.map((a) => a.conceptId));

  // Enrich high-confidence analyses with related/prerequisite concept lists
  const enriched = highConf.map((a) => {
    const { related, prereqs } = getConceptsForNode(a, expansions);
    return { ...a, relatedConcepts: related, prerequisites: prereqs };
  });

  // ── Collect satellite node names ──
  // Source 1: domain placeholder nodes (always included)
  const satelliteNames = new Map<string, string>();
  for (const name of domainNodes) {
    const norm = normalize(name);
    if (!highNorm.has(norm)) satelliteNames.set(norm, name);
  }
  // Source 2: AI-returned concepts from high-confidence analyses
  for (const a of enriched) {
    for (const rc of a.relatedConcepts ?? []) {
      const norm = normalize(rc);
      if (!highNorm.has(norm) && !satelliteNames.has(norm))
        satelliteNames.set(norm, formatConceptName(rc));
    }
    for (const p of a.prerequisites ?? []) {
      const norm = normalize(p);
      if (!highNorm.has(norm) && !satelliteNames.has(norm))
        satelliteNames.set(norm, formatConceptName(p));
    }
  }

  // ── Build nodes ──
  const nodes: Node[] = [];

  // 1. Analyzed nodes (confidence ≥ 70%)
  for (const a of enriched) {
    nodes.push({
      id: a.conceptId,
      type: 'concept',
      position: { x: 0, y: 0 },
      data: {
        label: a.conceptId,
        level: a.understandingLevel,
        confidence: a.confidence,
        debtCount: a.debtIndicators.length,
        nodeKind: 'analyzed',
        relatedCount: (a.relatedConcepts?.length ?? 0) + (a.prerequisites?.length ?? 0),
      } satisfies KnowledgeNodeData,
    });
  }

  // 2. Satellite / placeholder nodes
  for (const [norm, displayName] of satelliteNames) {
    nodes.push({
      id: `sat_${norm}`,
      type: 'concept',
      position: { x: 0, y: 0 },
      data: {
        label: displayName,
        level: 'surface',
        confidence: 0,
        debtCount: 0,
        nodeKind: 'satellite',
        relatedCount: 0,
      } satisfies KnowledgeNodeData,
    });
  }

  if (nodes.length === 0) return { nodes: [], edges: [], analyzedIds: analyzedIdSet };

  // ── Build edges ──
  const edges: Edge[] = [];
  const edgeSeen = new Set<string>();

  function addEdge(source: string, target: string, kind: 'ai' | 'inferred') {
    if (source === target) return;
    const key = `${source}::${target}`;
    const rev = `${target}::${source}`;
    if (edgeSeen.has(key) || edgeSeen.has(rev)) return;
    edgeSeen.add(key);
    const isAI = kind === 'ai';
    edges.push({
      id: `e::${source}::${target}`,
      source,
      target,
      label: undefined,
      animated: isAI,
      type: 'default',
      zIndex: 10,
      style: {
        stroke: isAI ? 'rgba(99,102,241,0.80)' : 'rgba(113,113,122,0.35)',
        strokeWidth: isAI ? 2.5 : 1.5,
      },
    });
  }

  // Edges from relatedConcepts
  for (const a of enriched) {
    for (const rc of a.relatedConcepts ?? []) {
      const norm = normalize(rc);
      const targetId = highNorm.has(norm)
        ? highNorm.get(norm)!.conceptId
        : satelliteNames.has(norm) ? `sat_${norm}` : null;
      if (targetId) addEdge(a.conceptId, targetId, 'ai');
    }
    // Edges from prerequisites
    for (const p of a.prerequisites ?? []) {
      const norm = normalize(p);
      const sourceId = highNorm.has(norm)
        ? highNorm.get(norm)!.conceptId
        : satelliteNames.has(norm) ? `sat_${norm}` : null;
      if (sourceId) addEdge(sourceId, a.conceptId, 'ai');
    }
  }

  // Inferred edges between analyzed concepts
  const analyzedIds = highConf.map((a) => a.conceptId);
  const inferred = inferRelationships(analyzedIds);
  for (const e of inferred) addEdge(e.source, e.target, 'inferred');

  // Connect ORPHAN satellite nodes (those without any AI edge) to the root.
  // Satellites that already connect to their parent concept keep only that edge.
  if (highConf.length > 0) {
    const rootId = highConf[0].conceptId;
    const connectedSatellites = new Set<string>();
    for (const e of edges) {
      if (typeof e.source === 'string' && e.source.startsWith('sat_')) connectedSatellites.add(e.source);
      if (typeof e.target === 'string' && e.target.startsWith('sat_')) connectedSatellites.add(e.target);
    }
    for (const norm of satelliteNames.keys()) {
      const satId = `sat_${norm}`;
      if (!connectedSatellites.has(satId)) {
        addEdge(rootId, satId, 'ai');
      }
    }
  }

  // Apply force-directed layout with position memory
  const positioned = applyForceLayout(nodes, edges, existingPositions, highConf[0]?.conceptId);

  return { nodes: positioned, edges, analyzedIds: analyzedIdSet };
}

/* ─── D3 Force-Directed Layout ─── */

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  isSatellite: boolean;
  isRoot: boolean;
}

/**
 * Position nodes using D3 — root pinned at center, existing positions locked,
 * new nodes seeded near their neighbors to minimise jumps.
 */
function applyForceLayout(
  nodes: Node[],
  edges: Edge[],
  existingPositions: Map<string, { x: number; y: number }>,
  rootId: string | undefined,
): Node[] {
  if (nodes.length === 0) return nodes;

  function hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // Build neighbor map so new nodes can seed near connected nodes
  const neighbors = new Map<string, string[]>();
  for (const e of edges) {
    if (!neighbors.has(e.source)) neighbors.set(e.source, []);
    if (!neighbors.has(e.target)) neighbors.set(e.target, []);
    neighbors.get(e.source)!.push(e.target);
    neighbors.get(e.target)!.push(e.source);
  }

  // Convert a stored top-left position to the center coordinate D3 expects
  function toCenter(nodeId: string, pos: { x: number; y: number }) {
    const isSat = nodeId.startsWith('sat_');
    return {
      x: pos.x + (isSat ? SATELLITE_WIDTH : ANALYZED_WIDTH) / 2,
      y: pos.y + (isSat ? SATELLITE_HEIGHT : ANALYZED_HEIGHT) / 2,
    };
  }

  const simNodes: SimNode[] = nodes.map((n, i) => {
    const isSat = (n.data as KnowledgeNodeData).nodeKind === 'satellite';
    const isRoot = n.id === rootId;

    if (isRoot) {
      // Always pin root to visual center
      return { id: n.id, isSatellite: isSat, isRoot: true, x: 0, y: 0, fx: 0, fy: 0 };
    }

    const existing = existingPositions.get(n.id);
    if (existing) {
      const center = toCenter(n.id, existing);
      return {
        id: n.id, isSatellite: isSat, isRoot: false,
        x: center.x, y: center.y,
        fx: center.x, fy: center.y, // lock in place
      };
    }

    // New node — seed near centroid of known neighbours
    const nbs = neighbors.get(n.id) ?? [];
    const knownNbPos = nbs
      .map((nbId) => existingPositions.get(nbId))
      .filter((p): p is { x: number; y: number } => !!p);

    if (knownNbPos.length > 0) {
      const cx = knownNbPos.reduce((s, p) => s + p.x, 0) / knownNbPos.length;
      const cy = knownNbPos.reduce((s, p) => s + p.y, 0) / knownNbPos.length;
      const jitter = 60 + (hashCode(n.id) % 80);
      const angle = (2 * Math.PI * hashCode(n.id)) / 1000;
      return { id: n.id, isSatellite: isSat, isRoot: false, x: cx + Math.cos(angle) * jitter, y: cy + Math.sin(angle) * jitter };
    }

    // Completely new — spread in a ring around origin
    const angle = (2 * Math.PI * i) / nodes.length;
    const radius = 200 + (hashCode(n.id) % 120);
    return { id: n.id, isSatellite: isSat, isRoot: false, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
  const simLinks = edges
    .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }));

  const simulation = d3
    .forceSimulation<SimNode>(simNodes)
    .force(
      'link',
      d3.forceLink<SimNode, { source: string; target: string }>(simLinks)
        .id((d) => d.id).distance(190).strength(0.5),
    )
    .force('charge', d3.forceManyBody<SimNode>().strength(-600))
    .force('center', d3.forceCenter(0, 0).strength(0.03))
    .force(
      'collision',
      d3.forceCollide<SimNode>()
        .radius((d) => (d.isSatellite ? SATELLITE_WIDTH / 2 + 35 : ANALYZED_WIDTH / 2 + 45))
        .strength(0.85),
    )
    .force('x', d3.forceX<SimNode>(0).strength(0.03))
    .force('y', d3.forceY<SimNode>(0).strength(0.03))
    .stop();

  // Only simulate if there are unlocked (new) nodes
  if (simNodes.some((n) => n.fx === undefined)) {
    simulation.tick(Math.max(250, nodes.length * 4));
  }

  const posMap = new Map(simNodes.map((sn) => [sn.id, { x: sn.x ?? 0, y: sn.y ?? 0 }]));

  return nodes.map((node) => {
    const pos = posMap.get(node.id) ?? { x: 0, y: 0 };
    const isSatellite = (node.data as KnowledgeNodeData).nodeKind === 'satellite';
    const w = isSatellite ? SATELLITE_WIDTH : ANALYZED_WIDTH;
    const h = isSatellite ? SATELLITE_HEIGHT : ANALYZED_HEIGHT;
    return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}
