import type {
  UnderstandingLevel,
  ConceptUnderstanding,
  ConceptEdge,
  DebtType,
} from '../types/models';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3';

export interface GraphNode extends SimulationNodeDatum {
  conceptId: string;
  level: UnderstandingLevel;
  confidence: number;
  debtIndicators: ConceptUnderstanding['debtIndicators'];
  lastAssessed: string;
  evidenceCount: number;
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  relationship: string;
}

const LEVEL_COLORS: Record<UnderstandingLevel, string> = {
  unknown: '#6B7280',
  surface: '#EF4444',
  partial: '#F59E0B',
  solid: '#10B981',
  deep: '#3B82F6',
};

const LEVEL_GLOW_COLORS: Record<UnderstandingLevel, string> = {
  unknown: 'rgba(107, 114, 128, 0.4)',
  surface: 'rgba(239, 68, 68, 0.4)',
  partial: 'rgba(245, 158, 11, 0.4)',
  solid: 'rgba(16, 185, 129, 0.4)',
  deep: 'rgba(59, 130, 246, 0.4)',
};

const LEVEL_LABELS: Record<UnderstandingLevel, string> = {
  unknown: 'Unknown',
  surface: 'Surface',
  partial: 'Partial',
  solid: 'Solid',
  deep: 'Deep',
};

const DEBT_TYPE_LABELS: Record<DebtType, string> = {
  circular: 'Circular Reasoning',
  parroting: 'Keyword Parroting',
  logical_jump: 'Logical Jump',
  confidence_mismatch: 'Confidence Mismatch',
  wrong_reasoning: 'Wrong Reasoning',
};

const DEBT_TYPE_COLORS: Record<DebtType, string> = {
  circular: '#F97316',
  parroting: '#A855F7',
  logical_jump: '#EC4899',
  confidence_mismatch: '#F59E0B',
  wrong_reasoning: '#EF4444',
};

export const getNodeColor = (level: UnderstandingLevel): string =>
  LEVEL_COLORS[level];

export const getNodeGlowColor = (level: UnderstandingLevel): string =>
  LEVEL_GLOW_COLORS[level];

export const getLevelLabel = (level: UnderstandingLevel): string =>
  LEVEL_LABELS[level];

export const getDebtTypeLabel = (type: DebtType): string =>
  DEBT_TYPE_LABELS[type];

export const getDebtTypeColor = (type: DebtType): string =>
  DEBT_TYPE_COLORS[type];

export const getNodeRadius = (confidence: number): number => {
  return 18 + Math.round(confidence * 22);
};

export const prepareGraphNodes = (
  concepts: ConceptUnderstanding[]
): GraphNode[] => {
  return concepts.map((concept) => ({
    conceptId: concept.conceptId,
    level: concept.level,
    confidence: concept.confidence,
    debtIndicators: [...concept.debtIndicators],
    lastAssessed: concept.lastAssessed,
    evidenceCount: concept.evidenceCount,
  }));
};

export const prepareGraphLinks = (
  edges: ConceptEdge[],
  nodes: GraphNode[]
): GraphLink[] => {
  const nodeIds = new Set(nodes.map((n) => n.conceptId));
  return edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      relationship: edge.relationship,
    }));
};

export const formatConfidence = (confidence: number): string => {
  return `${Math.round(confidence * 100)}%`;
};

export const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
