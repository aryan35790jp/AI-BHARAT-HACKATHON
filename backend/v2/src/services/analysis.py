"""
Analysis service — orchestrates model invocation, parsing, and fallback.

Architecture Decision:
  This is the core business logic layer. It:
  1. Builds the prompt
  2. Tries each model in the fallback chain
  3. Parses the JSON response
  4. Falls back to rule-based analysis if all models fail
  5. Enriches results with domain knowledge edges
  6. Tracks cost and latency

  The service is stateless — all state goes through the repository layer.
  This makes it easy to test in isolation.
"""

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

from config.constants import (
    CONCEPT_DIFFICULTY,
    DEBT_KEYWORDS,
    DEPTH_KEYWORDS,
    DOMAIN_KNOWLEDGE,
    LEVEL_WEIGHTS,
    MECHANISM_INDICATORS,
    UNCERTAINTY_SIGNALS,
    VALID_DEBT_TYPES,
    VALID_INTERVENTION_TYPES,
    VALID_UNDERSTANDING_LEVELS,
)
from config.settings import Settings
from errors import AnalysisFailedError
from models.domain import (
    AnalysisResult,
    DebtIndicator,
    Edge,
    InterventionContent,
)
from services.bedrock.base import BaseModelProvider
from services.bedrock.prompts import build_analysis_prompt

logger = logging.getLogger("cognivault.services.analysis")


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------
def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, float(v)))


def _normalize_concept(concept: str) -> str:
    return concept.strip().lower().replace(" ", "_").replace("-", "_")


def _get_prerequisites(concept: str) -> List[str]:
    return DOMAIN_KNOWLEDGE.get(_normalize_concept(concept), [])


def _get_domain_edges(concept: str) -> List[Edge]:
    norm = _normalize_concept(concept)
    prereqs = DOMAIN_KNOWLEDGE.get(norm, [])
    return [Edge(source=p, target=norm, relationship="prerequisite") for p in prereqs]


# ---------------------------------------------------------------------------
# Response parser — shared by all model providers
# ---------------------------------------------------------------------------
def _extract_json_string(raw: str) -> str:
    """
    Extract a clean JSON string from raw model output.

    Models (Llama 4, Llama 3, etc.) commonly wrap JSON in:
      - ```json ... ```
      - ``` ... ```
      - Leading/trailing prose or whitespace
      - Trailing backticks without a closing fence

    This function strips all of that and returns the bare JSON substring.
    Centralized here so every provider benefits from the same cleaning.
    """
    text = raw.strip()

    # ── Strategy 1: Extract from ```json ... ``` or ``` ... ``` fences ──
    # Match the CONTENT between fences, ignoring the language tag.
    fence_pattern = re.compile(
        r"```(?:json|JSON)?\s*\n?(.*?)\n?\s*```", re.DOTALL
    )
    m = fence_pattern.search(text)
    if m:
        text = m.group(1).strip()

    # ── Strategy 2: Strip orphan leading/trailing backticks ──
    # Handles cases where the model emits ``` at the start but not the end,
    # or vice-versa.
    if text.startswith("```"):
        first_nl = text.find("\n")
        text = text[first_nl + 1:] if first_nl != -1 else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip().rstrip("`").strip()

    # ── Strategy 3: Locate first `{` and last `}` ──
    # Handles leading/trailing prose like "Here is the analysis:\n{...}"
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        text = text[start:end + 1]

    return text


def parse_model_response(raw_text: str) -> Dict[str, Any]:
    """
    Parse the JSON response from any Bedrock model.

    Pipeline:
      1. Clean markdown fences and surrounding prose (_extract_json_string)
      2. Try json.loads on the cleaned string
      3. If that fails, try bracket-matching extraction
      4. Validate and normalize the parsed data

    Architecture Decision:
      Parsing is intentionally lenient because LLMs are unpredictable
      in their output formatting. However, we log failures at ERROR
      level so we can tune prompts if a model consistently misbehaves.
    """
    # Step 1: Clean
    cleaned = _extract_json_string(raw_text)
    logger.debug("Cleaned JSON candidate (%d chars): %.300s", len(cleaned), cleaned)

    # Step 2: Direct parse
    try:
        data = json.loads(cleaned)
        return _validate_parsed_data(data)
    except json.JSONDecodeError as exc:
        logger.debug("Direct parse failed: %s", exc)

    # Step 3: Bracket-balanced extraction
    # Walk forward from each '{' and count braces to find the complete object.
    # This handles cases where cleaning left trailing garbage after '}'.
    for i, ch in enumerate(cleaned):
        if ch == "{":
            depth = 0
            for j in range(i, len(cleaned)):
                if cleaned[j] == "{":
                    depth += 1
                elif cleaned[j] == "}":
                    depth -= 1
                if depth == 0:
                    candidate = cleaned[i:j + 1]
                    try:
                        data = json.loads(candidate)
                        if isinstance(data, dict) and "understandingLevel" in data:
                            return _validate_parsed_data(data)
                    except json.JSONDecodeError:
                        break  # This opening brace didn't lead to valid JSON
            break  # Only try the first top-level '{'

    # Step 4: Last-ditch — try the raw text itself (maybe cleanup was destructive)
    raw_cleaned = raw_text.strip()
    raw_start = raw_cleaned.find("{")
    raw_end = raw_cleaned.rfind("}")
    if raw_start != -1 and raw_end > raw_start:
        try:
            data = json.loads(raw_cleaned[raw_start:raw_end + 1])
            return _validate_parsed_data(data)
        except json.JSONDecodeError:
            pass

    # Nothing worked — log the raw output for debugging, then raise
    logger.error(
        "JSON parse failed after all strategies. Raw response (%d chars): %.500s",
        len(raw_text), raw_text,
    )
    raise ValueError("Could not parse JSON from model response")


def _validate_parsed_data(data: dict) -> dict:
    """Validate and normalize parsed model output."""
    level = data.get("understandingLevel", "unknown")
    if level not in VALID_UNDERSTANDING_LEVELS:
        level = "unknown"

    confidence = _clamp(data.get("confidence", 0.0))

    debt_indicators = []
    for d in data.get("debtIndicators", []):
        dt = d.get("type", "")
        if dt in VALID_DEBT_TYPES:
            debt_indicators.append({
                "type": dt,
                "severity": _clamp(d.get("severity", 0.5)),
                "evidence": str(d.get("evidence", "")),
                "explanation": str(d.get("explanation", "")),
            })

    intervention_type = data.get("interventionType")
    intervention_content = None
    if (
        intervention_type
        and intervention_type in VALID_INTERVENTION_TYPES
        and data.get("interventionContent")
    ):
        ic = data["interventionContent"]
        intervention_content = {
            "title": str(ic.get("title", "")),
            "explanation": str(ic.get("explanation", "")),
            "examples": [str(e) for e in ic.get("examples", [])],
            "followUpQuestions": [str(q) for q in ic.get("followUpQuestions", [])],
        }
    else:
        intervention_type = None

    # New semantic evaluation fields
    missing_concepts = [str(c) for c in data.get("missingConcepts", [])]
    suggested_explanation = data.get("suggestedExplanation")
    if suggested_explanation is not None:
        suggested_explanation = str(suggested_explanation)
    next_question = data.get("nextQuestion")
    if next_question is not None:
        next_question = str(next_question)

    related = [str(c) for c in data.get("relatedConcepts", [])]
    prerequisites = [str(p) for p in data.get("prerequisites", [])]

    edges = []
    for e in data.get("edges", []):
        if e.get("source") and e.get("target"):
            edges.append({
                "source": str(e["source"]),
                "target": str(e["target"]),
                "relationship": str(e.get("relationship", "prerequisite")),
            })

    return {
        "understandingLevel": level,
        "confidence": confidence,
        "debtIndicators": debt_indicators,
        "interventionType": intervention_type,
        "interventionContent": intervention_content,
        "missingConcepts": missing_concepts,
        "suggestedExplanation": suggested_explanation,
        "nextQuestion": next_question,
        "relatedConcepts": related,
        "prerequisites": prerequisites,
        "edges": edges,
    }


# ---------------------------------------------------------------------------
# Rule-based fallback analysis
# ---------------------------------------------------------------------------
def rule_based_fallback(
    concept: str, explanation: str, evidence_type: str
) -> Dict[str, Any]:
    """
    Deterministic analysis when all Bedrock models are unavailable.

    Architecture Decision:
      This ensures the API ALWAYS returns a valid response.
      The rule-based system uses semantic-approximation heuristics:
      1. Uncertainty detection — checks many ways a student might express
         "I don't know" rather than matching a single phrase.
      2. Substance analysis — measures how much real content vs filler.
      3. Mechanism detection — checks if the student explains how/why.
      4. Depth keyword scoring — supplementary signal from vocabulary.

      Quality is lower than LLM analysis, but:
      - Zero cost
      - Zero latency (< 5ms)
      - 100% availability
      - Consistent results (good for testing)
    """
    norm = _normalize_concept(concept)
    text_lower = explanation.lower().strip()
    word_count = len(explanation.split())
    char_count = len(explanation)
    concept_label = concept.replace("_", " ").title()

    # ── Dimension 1: Detect uncertainty / "I don't know" intent ──
    # Check broad set of uncertainty signals (semantic approximation)
    uncertainty_hits = sum(1 for sig in UNCERTAINTY_SIGNALS if sig in text_lower)
    is_uncertain = uncertainty_hits >= 1

    # Very short responses (< 8 words) with no substance are also uncertain
    filler_words = {"the", "a", "an", "is", "it", "its", "this", "that", "i", "um", "uh", "well", "like", "so"}
    substantive_words = [w for w in text_lower.split() if w not in filler_words and len(w) > 2]
    substantive_count = len(substantive_words)

    if word_count <= 5 and substantive_count <= 2:
        is_uncertain = True

    # ── Dimension 2: Mechanism presence ──
    mechanism_hits = sum(1 for ind in MECHANISM_INDICATORS if ind in text_lower)
    has_mechanism = mechanism_hits >= 2

    # ── Dimension 3: Explanation depth (substance ratio) ──
    substance_ratio = substantive_count / max(word_count, 1)

    # ── Dimension 4: Keyword depth scoring (supplementary) ──
    level_scores: Dict[str, int] = {"unknown": 0, "surface": 0, "partial": 0, "solid": 0, "deep": 0}

    if is_uncertain:
        level_scores["unknown"] += 5

    for level, keywords in DEPTH_KEYWORDS.items():
        for kw in keywords:
            if kw in text_lower:
                level_scores[level] += 1

    # Length-based substance heuristics
    if word_count < 8:
        level_scores["unknown"] += 3
    elif word_count < 20:
        level_scores["surface"] += 2
    elif word_count < 50:
        level_scores["partial"] += 2
    elif word_count < 120:
        if has_mechanism:
            level_scores["solid"] += 3
        else:
            level_scores["partial"] += 2
    else:
        if has_mechanism:
            level_scores["deep"] += 3
        else:
            level_scores["solid"] += 2

    # Mechanism bonus
    if has_mechanism:
        level_scores["solid"] += mechanism_hits
        if mechanism_hits >= 3:
            level_scores["deep"] += 2

    # Low substance ratio penalizes
    if substance_ratio < 0.4 and word_count > 5:
        level_scores["surface"] += 2

    # Concept difficulty adjustment
    difficulty = CONCEPT_DIFFICULTY.get(norm, 3)
    if word_count < difficulty * 8:
        level_scores["surface"] += 1

    # ── Determine level ──
    level = max(level_scores, key=level_scores.get)  # type: ignore[arg-type]

    # ── Compute confidence ──
    if level == "unknown":
        confidence = _clamp(0.05 + (substantive_count * 0.02), 0.05, 0.20)
    elif level == "surface":
        confidence = _clamp(0.20 + (word_count / 300) + (substance_ratio * 0.1), 0.20, 0.40)
    elif level == "partial":
        confidence = _clamp(0.40 + (word_count / 400) + (mechanism_hits * 0.05), 0.40, 0.70)
    elif level == "solid":
        confidence = _clamp(0.70 + (mechanism_hits * 0.04) + (word_count / 800), 0.70, 0.90)
    else:  # deep
        confidence = _clamp(0.90 + (mechanism_hits * 0.02), 0.90, 0.98)

    # --- Detect debt indicators ---
    debt_indicators = []

    # Circular definition detection
    concept_words = norm.replace("_", " ").split()
    concept_in_explanation = sum(1 for w in concept_words if w in text_lower)
    if concept_in_explanation >= len(concept_words) and word_count < 30 and substantive_count < 10:
        debt_indicators.append({
            "type": "circular",
            "severity": 0.6,
            "evidence": explanation[:100],
            "explanation": f"The explanation may define '{concept}' using the concept itself without adding clarity.",
        })

    # Parroting detection
    parroting_count = sum(1 for kw in DEBT_KEYWORDS.get("parroting", []) if kw in text_lower)
    if parroting_count >= 2 and not has_mechanism:
        debt_indicators.append({
            "type": "parroting",
            "severity": 0.5,
            "evidence": explanation[:100],
            "explanation": "The explanation reads like a textbook definition without demonstrating personal understanding.",
        })

    # Logical jump detection
    jump_count = sum(1 for kw in DEBT_KEYWORDS.get("logical_jump", []) if kw in text_lower)
    if jump_count >= 1 and word_count < 40 and not has_mechanism:
        debt_indicators.append({
            "type": "logical_jump",
            "severity": 0.4,
            "evidence": explanation[:100],
            "explanation": "The explanation may skip important reasoning steps between ideas.",
        })

    # Confidence mismatch — short but uses confident language without substance
    if word_count < 20 and not is_uncertain and substantive_count < 6:
        debt_indicators.append({
            "type": "confidence_mismatch",
            "severity": 0.3,
            "evidence": explanation[:100],
            "explanation": "The explanation is very brief, which may indicate surface-level understanding despite apparent confidence.",
        })

    # --- Build missing concepts list ---
    missing_concepts: List[str] = []
    prereqs = _get_prerequisites(concept)
    if level in ("unknown", "surface", "partial"):
        # For known concepts, suggest key prerequisites as missing
        for p in prereqs[:3]:
            p_label = p.replace("_", " ")
            if p_label not in text_lower:
                missing_concepts.append(p_label)
        if not missing_concepts:
            missing_concepts = ["core mechanism", "practical examples"]

    # --- Build suggested explanation for low confidence ---
    suggested_explanation: Optional[str] = None
    next_question: Optional[str] = None

    if confidence < 0.30:
        suggested_explanation = (
            f"{concept_label} is an important concept to understand. "
            f"{'It builds on: ' + ', '.join(p.replace('_', ' ') for p in prereqs[:3]) + '. ' if prereqs else ''}"
            f"Understanding it requires knowing both what it is and how it works in practice. "
            f"Try to think about a concrete example where you've seen or encountered it."
        )
        next_question = (
            f"Can you describe a simple example of {concept_label.lower()} "
            f"and explain what it does step by step?"
        )
    elif confidence < 0.70:
        next_question = (
            f"You've got the basics — can you now explain *why* {concept_label.lower()} "
            f"works the way it does, or what would happen without it?"
        )

    # --- Build intervention ---
    intervention_type = None
    intervention_content = None

    if level in ("unknown", "surface", "partial") or debt_indicators:
        if level == "unknown":
            intervention_type = "mental_model"
            intervention_content = {
                "title": f"Let's learn about {concept_label}",
                "explanation": (
                    f"It sounds like you may not be familiar with {concept_label.lower()} yet. "
                    f"{'It builds on: ' + ', '.join(p.replace('_', ' ') for p in prereqs[:3]) + '. ' if prereqs else ''}"
                    f"Let me help you build a mental model of this concept."
                ),
                "examples": [
                    f"Think of {concept_label.lower()} as a building block — "
                    f"it's something that more advanced concepts depend on.",
                    f"Try relating {concept_label.lower()} to something you already know.",
                ],
                "followUpQuestions": [
                    next_question or f"What do you think {concept_label.lower()} might be used for?",
                ],
            }
        elif debt_indicators and debt_indicators[0]["type"] == "circular":
            intervention_type = "clarification"
        elif debt_indicators and debt_indicators[0]["type"] == "parroting":
            intervention_type = "counter_example"
        elif level == "surface":
            intervention_type = "mental_model"
        else:
            intervention_type = "aha_bridge"

        if not intervention_content:
            intervention_content = {
                "title": f"Deepen your understanding of {concept_label}",
                "explanation": (
                    f"Your explanation of {concept_label.lower()} shows "
                    f"{level}-level understanding. "
                    f"Try explaining it using a concrete example or analogy. "
                    f"{'Consider reviewing prerequisites: ' + ', '.join(p.replace('_', ' ') for p in prereqs) + '. ' if prereqs else ''}"
                    f"Focus on the 'why' and 'how', not just the 'what'."
                ),
                "examples": [
                    f"Try thinking of a concrete example that demonstrates {concept_label.lower()}.",
                    f"Explain {concept_label.lower()} as if teaching a classmate who knows "
                    + (prereqs[0].replace('_', ' ') if prereqs else 'the basics')
                    + " but not this concept.",
                ],
                "followUpQuestions": [
                    next_question or f"What would happen if {concept_label.lower()} didn't exist or wasn't used?",
                    f"Can you give a real-world analogy for {concept_label.lower()}?",
                ],
            }

    # --- Build edges ---
    edges = [
        {"source": p, "target": norm, "relationship": "prerequisite"}
        for p in prereqs
    ]

    # --- Build rich relatedConcepts ---
    related = set(prereqs)

    for other_concept, other_prereqs in DOMAIN_KNOWLEDGE.items():
        if norm in other_prereqs and other_concept != norm:
            related.add(other_concept)

    if prereqs:
        for other_concept, other_prereqs in DOMAIN_KNOWLEDGE.items():
            if other_concept == norm:
                continue
            shared = set(prereqs) & set(other_prereqs)
            if len(shared) >= 1 and other_concept not in related:
                related.add(other_concept)
            if len(related) >= 8:
                break

    if not related:
        concept_words_set = set(norm.replace("_", " ").split())
        for dk_concept in DOMAIN_KNOWLEDGE:
            dk_words = set(dk_concept.replace("_", " ").split())
            if concept_words_set & dk_words:
                related.add(dk_concept)
            if len(related) >= 6:
                break

    if not related:
        # No domain graph match — return empty rather than assume programming
        related_list: list = []
    else:
        related_list = sorted(related - {norm})[:8]

    return {
        "understandingLevel": level,
        "confidence": round(confidence, 4),
        "debtIndicators": debt_indicators,
        "interventionType": intervention_type,
        "interventionContent": intervention_content,
        "missingConcepts": missing_concepts,
        "suggestedExplanation": suggested_explanation,
        "nextQuestion": next_question,
        "relatedConcepts": related_list,
        "prerequisites": prereqs[:5],
        "edges": edges,
    }


# ---------------------------------------------------------------------------
# Analysis orchestrator
# ---------------------------------------------------------------------------
class AnalysisService:
    """
    Orchestrates concept understanding analysis.
    Tries model chain then falls back to rule-based.
    """

    def __init__(
        self,
        model_chain: List[BaseModelProvider],
        settings: Settings,
    ):
        self.model_chain = model_chain
        self.settings = settings

    def analyze(
        self,
        concept: str,
        explanation: str,
        evidence_type: str = "explanation",
    ) -> AnalysisResult:
        """
        Analyze a student's understanding of a concept.

        Execution order:
          1. Build prompt
          2. Check cost guardrails (token estimate)
          3. Try each model in the chain
          4. Parse JSON response
          5. Fall back to rule-based if all models fail
          6. Enrich with domain knowledge edges
          7. Return AnalysisResult
        """
        norm_concept = _normalize_concept(concept)
        prereqs = _get_prerequisites(concept)

        # Truncate explanation to max chars (cost guardrail)
        truncated = explanation[: self.settings.max_explanation_chars]
        if len(explanation) > self.settings.max_explanation_chars:
            logger.warning(
                "Explanation truncated from %d to %d chars",
                len(explanation), self.settings.max_explanation_chars,
            )

        prompt = build_analysis_prompt(
            concept=concept,
            explanation=truncated,
            evidence_type=evidence_type,
            prerequisites=prereqs,
        )

        # Cost guardrail: check token estimate before calling model
        est_tokens = len(prompt) // 4
        if est_tokens > self.settings.max_input_tokens:
            logger.warning(
                "Prompt exceeds max input tokens: est=%d max=%d. Using rule-based fallback.",
                est_tokens, self.settings.max_input_tokens,
            )
            return self._build_result(
                rule_based_fallback(concept, truncated, evidence_type),
                model_used="rule-based-token-limit",
                latency_ms=0,
            )

        # Try each model in the fallback chain
        last_error = None
        for provider in self.model_chain:
            try:
                logger.info(
                    "Attempting analysis with %s (%s)",
                    provider.provider_name, provider.model_id,
                )
                result = provider.invoke(prompt)
                logger.info(
                    "Raw model response from %s (%d chars): %.1000s",
                    provider.provider_name, len(result["text"]), result["text"],
                )
                parsed = parse_model_response(result["text"])

                return self._build_result(
                    parsed,
                    model_used=f"{provider.provider_name}:{provider.model_id}",
                    latency_ms=result["latency_ms"],
                    cost_usd=result["estimated_cost_usd"],
                )

            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Model %s failed: %s. Trying next in chain.",
                    provider.provider_name, str(exc),
                )
                continue

        # All models failed — rule-based fallback
        if self.settings.enable_rule_based_fallback:
            logger.warning(
                "All models failed. Using rule-based fallback. Last error: %s",
                str(last_error),
            )
            return self._build_result(
                rule_based_fallback(concept, truncated, evidence_type),
                model_used="rule-based-fallback",
                latency_ms=0,
            )

        # No fallback enabled — raise error
        raise AnalysisFailedError(
            f"All models failed and rule-based fallback is disabled. Last error: {last_error}"
        )

    def expand_concept(self, concept: str) -> Dict[str, Any]:
        """
        Call the LLM to generate domain-specific related concepts for the graph.

        Returns {"domain": str, "concepts": [str, ...]}
        Falls back to empty list if all models fail — graph will use satellite stubs.
        """
        from services.bedrock.prompts import build_expand_prompt

        prompt = build_expand_prompt(concept)
        for provider in self.model_chain:
            try:
                result = provider.invoke(prompt)
                logger.info(
                    "expand_concept raw response from %s (%d chars): %.500s",
                    provider.provider_name, len(result["text"]), result["text"],
                )
                cleaned = _extract_json_string(result["text"])
                data = json.loads(cleaned)
                concepts = [str(c).strip() for c in data.get("concepts", []) if c]
                domain = str(data.get("domain", "general")).strip()
                if concepts:
                    return {"domain": domain, "concepts": concepts[:12]}
            except Exception as exc:
                logger.warning(
                    "expand_concept model %s failed: %s", provider.provider_name, exc
                )
                continue

        logger.warning("expand_concept: all models failed for concept=%s", concept)
        return {"domain": "general", "concepts": []}

    def _build_result(
        self,
        parsed: Dict[str, Any],
        model_used: str,
        latency_ms: float,
        cost_usd: float = 0.0,
    ) -> AnalysisResult:
        """Convert parsed dict to AnalysisResult with domain edge enrichment."""
        # Build debt indicators
        debt_indicators = [
            DebtIndicator.from_dict(d)
            for d in parsed.get("debtIndicators", [])
        ]

        # Build intervention content
        intervention_content = None
        if parsed.get("interventionContent"):
            intervention_content = InterventionContent.from_dict(
                parsed["interventionContent"]
            )

        # Build edges
        edges = [Edge.from_dict(e) for e in parsed.get("edges", [])]

        # Enrich with domain knowledge edges
        domain_edges = _get_domain_edges(parsed.get("concept", ""))
        # Also try enriching via any concept we can derive
        existing_pairs = {(e.source, e.target) for e in edges}
        for de in _get_domain_edges(""):  # Will be empty, but keeping pattern
            if (de.source, de.target) not in existing_pairs:
                edges.append(de)
                existing_pairs.add((de.source, de.target))

        result = AnalysisResult(
            understandingLevel=parsed.get("understandingLevel", "unknown"),
            confidence=parsed.get("confidence", 0.0),
            debtIndicators=debt_indicators,
            interventionType=parsed.get("interventionType"),
            interventionContent=intervention_content,
            missingConcepts=parsed.get("missingConcepts", []),
            suggestedExplanation=parsed.get("suggestedExplanation"),
            nextQuestion=parsed.get("nextQuestion"),
            relatedConcepts=parsed.get("relatedConcepts", []),
            prerequisites=parsed.get("prerequisites", []),
            edges=edges,
            modelUsed=model_used,
            latencyMs=latency_ms,
            estimatedCostUsd=cost_usd,
        )

        return result
