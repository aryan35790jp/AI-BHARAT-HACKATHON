import React, { useState } from 'react';
import type { AnalyzeResponse, DebtType } from '../types/models';
import { getNodeColor, getLevelLabel, getDebtTypeLabel } from '../utils/graphLayout';

interface WhyThisScoreProps {
  result: AnalyzeResponse;
}

/** Derive AI reasoning insights from the analysis result */
function deriveInsights(result: AnalyzeResponse) {
  const level = result.understandingLevel;
  const confidence = result.confidence;
  const debts = result.debtIndicators;

  const patterns: string[] = [];
  const gaps: string[] = [];
  const strengths: string[] = [];

  // Patterns detected
  if (debts.length === 0) {
    patterns.push('No circular or shallow reasoning patterns detected.');
    patterns.push('Explanation demonstrates structural understanding beyond keyword matching.');
  } else {
    debts.forEach((d) => {
      const label = getDebtTypeLabel(d.type as DebtType);
      patterns.push(`${label} pattern at ${Math.round(d.severity * 100)}% severity.`);
    });
  }

  // Gaps
  if (level === 'unknown') {
    gaps.push('No understanding demonstrated — the concept appears unfamiliar.');
    gaps.push('The response lacks any substantive content about the topic.');
  } else if (level === 'surface') {
    gaps.push('Missing causal explanations — "why" and "how" are absent.');
    gaps.push('No examples or practical applications provided.');
    gaps.push('Definition restates the term without unpacking the mechanism.');
  } else if (level === 'partial') {
    gaps.push('Edge cases and boundary conditions not addressed.');
    gaps.push('Connections to related concepts are thin or missing.');
    if (confidence < 0.6) gaps.push('Explanation confidence does not match claim strength.');
  } else if (level === 'solid') {
    gaps.push('Advanced applications and extensions could be explored.');
    if (debts.length > 0) gaps.push('Minor reasoning patterns still present.');
  }

  // Strengths
  if (level === 'deep') {
    strengths.push('Demonstrates structural understanding of the mechanism.');
    strengths.push('Connected to broader concepts and practical applications.');
    strengths.push('Edge cases and limitations are addressed.');
  } else if (level === 'solid') {
    strengths.push('Core mechanism is correctly explained.');
    strengths.push('Practical examples strengthen the explanation.');
  } else if (level === 'partial') {
    strengths.push('Fundamental definition is present.');
    strengths.push('Shows awareness of key components.');
  } else if (level === 'unknown') {
    strengths.push('Willingness to engage with the topic.');
  } else {
    strengths.push('Concept identification is correct.');
  }

  return { patterns, gaps, strengths };
}

export const WhyThisScore: React.FC<WhyThisScoreProps> = ({ result }) => {
  const [open, setOpen] = useState(false);
  const levelColor = getNodeColor(result.understandingLevel);
  const levelLabel = getLevelLabel(result.understandingLevel);
  const { patterns, gaps, strengths } = deriveInsights(result);

  return (
    <div className="glass rounded-2xl border border-surface-border/50 overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface/30"
      >
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
          <span className="text-sm font-semibold text-text-primary">
            Why <span style={{ color: levelColor }}>{levelLabel}</span>?
          </span>
          <span className="text-[11px] text-text-faint">AI Reasoning Transparency</span>
        </div>
        <svg
          className={`h-4 w-4 text-text-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Collapsible content */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-4 border-t border-surface-border/30 px-5 py-4">
          {/* Patterns detected */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Patterns Detected
            </h4>
            <ul className="space-y-1.5">
              {patterns.map((p, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-text-muted">
                  <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-amber-400/40" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Gaps identified */}
          {gaps.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Gaps Identified
              </h4>
              <ul className="space-y-1.5">
                {gaps.map((g, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-text-muted">
                    <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-red-400/40" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Strengths */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Strengths Found
            </h4>
            <ul className="space-y-1.5">
              {strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-text-muted">
                  <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-emerald-400/40" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
