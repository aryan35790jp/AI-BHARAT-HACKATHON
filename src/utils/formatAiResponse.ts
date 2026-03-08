/**
 * Converts a raw AnalyzeResponse into the human-readable chat message text
 * shown in both the main chat and the ConceptChat side panel.
 *
 * Mirrors the Python `_format_response_text()` in stream_analyze.py so that
 * the text produced is identical whether coming from the streaming Lambda
 * endpoint or formatted client-side after a regular /v1/analyze call.
 */
import type { AnalyzeResponse } from '../types/models';

export function formatAiResponse(result: AnalyzeResponse, conceptName: string): string {
  const pct = Math.round(result.confidence * 100);
  const intervention = result.microIntervention;
  const examples = intervention?.content?.examples ?? [];
  const debtIndicators = result.debtIndicators ?? [];
  const missingConcepts = result.missingConcepts ?? [];

  // ── TEACHING MODE: confidence < 30 % ──────────────────────────────────
  if (pct < 30) {
    const lines: string[] = [];

    if (pct < 5) {
      lines.push(`**No explanation detected.** Let me introduce you to **${conceptName}**.`);
    } else {
      lines.push(`**${pct}% confidence** — It looks like you're not familiar with **${conceptName}** yet. Let me explain it.`);
    }
    lines.push('');

    const explanationText = result.suggestedExplanation || intervention?.content?.explanation;
    if (explanationText) {
      lines.push(`**What is ${conceptName}?**`);
      lines.push(explanationText);
      lines.push('');
    }

    if (examples.length > 0) {
      lines.push('**Example:**');
      lines.push(examples[0]);
      lines.push('');
    }

    if (examples.length > 1) {
      lines.push('**Think of it like this:**');
      lines.push(examples[1]);
      lines.push('');
    }

    const followUp =
      result.nextQuestion ??
      intervention?.content?.followUpQuestions?.[0];
    if (followUp) {
      lines.push('**Quick question for you:**');
      lines.push(followUp);
    }

    return lines.join('\n');
  }

  // ── IMPROVEMENT MODE: 30–60 % ─────────────────────────────────────────
  if (pct < 60) {
    let content = `**${pct}% confidence** — You have a **${result.understandingLevel}**-level grasp of **${conceptName}**. Let's strengthen it.`;

    if (intervention?.content?.explanation) {
      content += `\n\n${intervention.content.explanation}`;
    }
    if (examples.length > 0) {
      content += `\n\n**Example:** ${examples[0]}`;
    }
    if (missingConcepts.length > 0) {
      content += `\n\n**Key gaps:** ${missingConcepts.join(', ')}`;
    } else if (debtIndicators.length > 0) {
      content += `\n\n**Gaps to address:**\n${debtIndicators.map((d) => `• ${d.explanation}`).join('\n')}`;
    }
    const followUp = result.nextQuestion ?? intervention?.content?.followUpQuestions?.[0];
    if (followUp) content += `\n\n→ ${followUp}`;
    content += '\n\nTry explaining again — I track your progress!';
    return content;
  }

  // ── REINFORCEMENT MODE: > 60 % ────────────────────────────────────────
  let content = `**${pct}% confidence** — Great job! Your **${result.understandingLevel}**-level understanding of **${conceptName}** is solid.`;

  if (debtIndicators.length > 0) {
    content += `\n\n**Areas to strengthen:**\n${debtIndicators.map((d) => `• ${d.explanation}`).join('\n')}`;
  }
  if (missingConcepts.length > 0) {
    content += `\n\n**Consider covering:** ${missingConcepts.join(', ')}`;
  }
  const followUp = result.nextQuestion ?? intervention?.content?.followUpQuestions?.[0];
  if (followUp) content += `\n\n→ ${followUp}`;
  return content;
}
