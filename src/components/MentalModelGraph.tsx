import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { ConceptUnderstanding, ConceptEdge, UnderstandingLevel, DebtIndicator } from '../types/models';
import {
  getNodeColor,
  getNodeGlowColor,
  getNodeRadius,
  getLevelLabel,
  getDebtTypeLabel,
  formatConfidence,
} from '../utils/graphLayout';

interface MentalModelGraphProps {
  concepts: ConceptUnderstanding[];
  edges: ConceptEdge[];
  selectedConceptId: string | null;
  onNodeClick: (conceptId: string) => void;
}

interface SimNode extends d3.SimulationNodeDatum {
  conceptId: string;
  level: UnderstandingLevel;
  confidence: number;
  debtIndicators: DebtIndicator[];
  lastAssessed: string;
  evidenceCount: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  relationship: string;
}

interface TooltipData {
  visible: boolean;
  x: number;
  y: number;
  concept: ConceptUnderstanding | null;
}

const ARROW_MARKER_ID = 'cognivault-arrow';
const GLOW_FILTER_ID = 'cognivault-glow';

export const MentalModelGraph: React.FC<MentalModelGraphProps> = ({
  concepts,
  edges,
  selectedConceptId,
  onNodeClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);

  const [tooltip, setTooltip] = useState<TooltipData>({
    visible: false,
    x: 0,
    y: 0,
    concept: null,
  });

  const stableOnNodeClick = useCallback(
    (id: string) => onNodeClick(id),
    [onNodeClick]
  );

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || concepts.length === 0)
      return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (simulationRef.current) {
      simulationRef.current.stop();
      simulationRef.current = null;
    }

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`);

    svg.selectAll('*').remove();

    const defs = svg.append('defs');

    defs
      .append('marker')
      .attr('id', ARROW_MARKER_ID)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#475569');

    const glowFilter = defs
      .append('filter')
      .attr('id', GLOW_FILTER_ID)
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    glowFilter
      .append('feGaussianBlur')
      .attr('stdDeviation', '3.5')
      .attr('result', 'blur');

    const glowMerge = glowFilter.append('feMerge');
    glowMerge.append('feMergeNode').attr('in', 'blur');
    glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    const g = svg.append('g').attr('class', 'graph-root');

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoomBehavior);

    const nodes: SimNode[] = concepts.map((c) => ({
      conceptId: c.conceptId,
      level: c.level,
      confidence: c.confidence,
      debtIndicators: [...c.debtIndicators],
      lastAssessed: c.lastAssessed,
      evidenceCount: c.evidenceCount,
    }));

    const nodeIdSet = new Set(nodes.map((n) => n.conceptId));
    const links: SimLink[] = edges
      .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relationship: e.relationship,
      }));

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.conceptId)
          .distance(160)
          .strength(0.7)
      )
      .force('charge', d3.forceManyBody<SimNode>().strength(-450))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collision',
        d3
          .forceCollide<SimNode>()
          .radius((d) => getNodeRadius(d.confidence) + 20)
      )
      .force('x', d3.forceX<SimNode>(width / 2).strength(0.05))
      .force('y', d3.forceY<SimNode>(height / 2).strength(0.05));

    simulationRef.current = simulation;

    const linkGroup = g.append('g').attr('class', 'links');
    const nodeGroup = g.append('g').attr('class', 'nodes');

    const linkSelection = linkGroup
      .selectAll<SVGLineElement, SimLink>('line')
      .data(links)
      .join('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.5)
      .attr('marker-end', `url(#${ARROW_MARKER_ID})`);

    const nodeSelection = nodeGroup
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes, (d) => d.conceptId)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on(
            'start',
            (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              event.subject.fx = event.subject.x;
              event.subject.fy = event.subject.y;
            }
          )
          .on(
            'drag',
            (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>) => {
              event.subject.fx = event.x;
              event.subject.fy = event.y;
            }
          )
          .on(
            'end',
            (event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>) => {
              if (!event.active) simulation.alphaTarget(0);
              event.subject.fx = null;
              event.subject.fy = null;
            }
          )
      );

    nodeSelection
      .append('circle')
      .attr('class', 'glow-ring')
      .attr('r', (d) => getNodeRadius(d.confidence) + 5)
      .attr('fill', 'none')
      .attr('stroke', (d) => getNodeGlowColor(d.level))
      .attr('stroke-width', 3)
      .attr('filter', `url(#${GLOW_FILTER_ID})`)
      .style('opacity', 0.4);

    nodeSelection
      .append('circle')
      .attr('class', 'main-circle')
      .attr('r', 0)
      .attr('fill', (d) => getNodeColor(d.level))
      .attr('stroke', (d) =>
        d.conceptId === selectedConceptId ? '#FFFFFF' : '#1E293B'
      )
      .attr('stroke-width', (d) =>
        d.conceptId === selectedConceptId ? 3 : 1.5
      )
      .transition()
      .duration(600)
      .ease(d3.easeElasticOut.amplitude(1).period(0.5))
      .attr('r', (d) => getNodeRadius(d.confidence));

    nodeSelection
      .append('text')
      .attr('class', 'node-label')
      .text((d) =>
        d.conceptId.length > 14
          ? d.conceptId.slice(0, 12) + '…'
          : d.conceptId
      )
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => getNodeRadius(d.confidence) + 16)
      .attr('fill', '#94A3B8')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('pointer-events', 'none')
      .style('opacity', 0)
      .transition()
      .delay(300)
      .duration(400)
      .style('opacity', 1);

    nodeSelection.each(function (d) {
      if (d.debtIndicators.length === 0) return;
      const group = d3.select(this);
      const r = getNodeRadius(d.confidence);
      const badgeX = r * 0.7;
      const badgeY = -r * 0.7;

      group
        .append('circle')
        .attr('class', 'debt-badge')
        .attr('cx', badgeX)
        .attr('cy', badgeY)
        .attr('r', 8)
        .attr('fill', '#F97316')
        .attr('stroke', '#0F172A')
        .attr('stroke-width', 2);

      group
        .append('text')
        .attr('class', 'debt-count')
        .attr('x', badgeX)
        .attr('y', badgeY)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'middle')
        .attr('fill', '#FFFFFF')
        .attr('font-size', '9px')
        .attr('font-weight', 'bold')
        .attr('pointer-events', 'none')
        .text(String(d.debtIndicators.length));
    });

    nodeSelection.on('click', (_event: MouseEvent, d: SimNode) => {
      stableOnNodeClick(d.conceptId);
    });

    nodeSelection.on('mouseenter', (event: MouseEvent, d: SimNode) => {
      const containerRect = container.getBoundingClientRect();
      d3.select(event.currentTarget as SVGGElement)
        .select('.glow-ring')
        .transition()
        .duration(200)
        .style('opacity', 0.8);

      setTooltip({
        visible: true,
        x: event.clientX - containerRect.left + 14,
        y: event.clientY - containerRect.top - 8,
        concept: {
          conceptId: d.conceptId,
          level: d.level,
          confidence: d.confidence,
          debtIndicators: d.debtIndicators,
          lastAssessed: d.lastAssessed,
          evidenceCount: d.evidenceCount,
        },
      });
    });

    nodeSelection.on('mousemove', (event: MouseEvent) => {
      const containerRect = container.getBoundingClientRect();
      setTooltip((prev) => ({
        ...prev,
        x: event.clientX - containerRect.left + 14,
        y: event.clientY - containerRect.top - 8,
      }));
    });

    nodeSelection.on('mouseleave', (event: MouseEvent) => {
      d3.select(event.currentTarget as SVGGElement)
        .select('.glow-ring')
        .transition()
        .duration(300)
        .style('opacity', 0.4);

      setTooltip((prev) => ({ ...prev, visible: false }));
    });

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      nodeSelection.attr(
        'transform',
        (d) => `translate(${d.x ?? 0},${d.y ?? 0})`
      );
    });

    const initialTransform = d3.zoomIdentity.translate(0, 0).scale(1);
    svg.call(zoomBehavior.transform, initialTransform);

    return () => {
      simulation.stop();
    };
  }, [concepts, edges, selectedConceptId, stableOnNodeClick]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-slate-900"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(30,41,59,0.5),transparent_70%)]" />

      <svg ref={svgRef} className="h-full w-full" />

      {tooltip.visible && tooltip.concept && (
        <div
          className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-slate-600/80 bg-slate-800/95 px-3 py-2.5 shadow-2xl backdrop-blur-sm"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="text-sm font-semibold text-slate-100">
            {tooltip.concept.conceptId}
          </p>
          <div className="mt-1.5 space-y-1 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Level</span>
              <span
                className="font-medium"
                style={{ color: getNodeColor(tooltip.concept.level) }}
              >
                {getLevelLabel(tooltip.concept.level)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Confidence</span>
              <span className="font-medium text-slate-200">
                {formatConfidence(tooltip.concept.confidence)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-400">Evidence</span>
              <span className="font-medium text-slate-200">
                {tooltip.concept.evidenceCount}
              </span>
            </div>
            {tooltip.concept.debtIndicators.length > 0 && (
              <div className="mt-1 border-t border-slate-700 pt-1">
                <span className="text-orange-400">
                  Debt:{' '}
                  {tooltip.concept.debtIndicators
                    .map((d) => getDebtTypeLabel(d.type))
                    .join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {concepts.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-slate-600">
            Submit evidence to start building your knowledge graph
          </p>
        </div>
      )}
    </div>
  );
};
