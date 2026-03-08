from __future__ import annotations

import json
import logging
import os
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from models import (
    BedrockAnalysisResult,
    ConceptEdge,
    DebtIndicator,
    DebtType,
    EvidenceType,
    InterventionContent,
    InterventionType,
    MicroIntervention,
    UnderstandingLevel,
    get_domain_edges_for_concept,
    get_prerequisites,
)
from retry import retry_with_backoff

logger = logging.getLogger(__name__)

BEDROCK_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0"
)
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")

_client = None


def _get_bedrock_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "bedrock-runtime",
            region_name=BEDROCK_REGION,
        )
    return _client


ANALYSIS_SYSTEM_PROMPT = """You are an expert cognitive science tutor specializing in identifying
understanding gaps, cognitive debt, and misconceptions in student explanations.

Given a student's explanation of a programming/ML concept, analyze it and return a
JSON object with EXACTLY this schema:

{
  "understandingLevel": "surface" | "partial" | "solid" | "deep",
  "confidence": <float 0.0 to 1.0>,
  "debtIndicators": [
    {
      "type": "circular" | "parroting" | "logical_jump" | "confidence_mismatch" | "wrong_reasoning",
      "severity": <float 0.0 to 1.0>,
      "evidence": "<quoted text from student>",
      "explanation": "<why this is cognitive debt>"
    }
  ],
  "interventionType": "clarification" | "counter_example" | "mental_model" | "aha_bridge" | null,
  "interventionContent": {
    "title": "<short title>",
    "explanation": "<targeted explanation addressing the gaps>",
    "examples": ["<concrete example 1>", "<concrete example 2>"],
    "followUpQuestions": ["<question to probe deeper>"]
  } or null,
  "relatedConcepts": ["<concept_name>"],
  "edges": [
    {"source": "<concept>", "target": "<concept>", "relationship": "prerequisite"}
  ]
}

Rules:
- "circular": Student defines a concept using itself (e.g. "recursion is when something recurses")
- "parroting": Student repeats textbook definition without demonstrating real understanding
- "logical_jump": Student skips important reasoning steps between ideas
- "confidence_mismatch": Student seems very confident about something incorrect, or uncertain about something correct
- "wrong_reasoning": Student arrives at a correct/incorrect conclusion via flawed reasoning
- If understanding is solid/deep with high confidence, interventionType and interventionContent may be null.
- relatedConcepts should list prerequisite concepts that appear weak or missing.
- edges should describe knowledge dependencies (source=prerequisite, target=concept).
- Concept names should use snake_case.
- Return ONLY valid JSON, no markdown fences.
"""


def _build_analysis_prompt(concept: str, explanation: str, evidence_type: str) -> str:
    prereqs = get_prerequisites(concept)
    prereqs_str = ", ".join(prereqs) if prereqs else "none known"

    return (
        f"Concept being assessed: {concept}\n"
        f"Known prerequisites: {prereqs_str}\n"
        f"Evidence type: {evidence_type}\n\n"
        f"Student's explanation/evidence:\n"
        f"---\n{explanation}\n---\n\n"
        f"Analyze the understanding demonstrated above and return the JSON analysis."
    )


@retry_with_backoff(max_retries=3, base_delay=1.0, max_delay=10.0)
def _invoke_bedrock(system_prompt: str, user_prompt: str) -> str:
    client = _get_bedrock_client()

    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "temperature": 0.3,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_prompt}
        ],
    })

    try:
        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )
    except ClientError as exc:
        logger.error("Bedrock invoke_model failed: %s", exc)
        raise

    response_body = json.loads(response["body"].read())
    content_blocks = response_body.get("content", [])

    text_parts = []
    for block in content_blocks:
        if block.get("type") == "text":
            text_parts.append(block["text"])

    return "".join(text_parts).strip()


def _parse_analysis_response(raw_text: str) -> BedrockAnalysisResult:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            cleaned = cleaned[start:end]
            data = json.loads(cleaned)
        else:
            logger.error("Could not parse Bedrock response as JSON: %s", raw_text[:200])
            raise ValueError("Invalid JSON from Bedrock")

    return BedrockAnalysisResult(
        understandingLevel=UnderstandingLevel(data["understandingLevel"]),
        confidence=max(0.0, min(1.0, float(data["confidence"]))),
        debtIndicators=[
            DebtIndicator(
                type=DebtType(d["type"]),
                severity=max(0.0, min(1.0, float(d["severity"]))),
                evidence=d["evidence"],
                explanation=d["explanation"],
            )
            for d in data.get("debtIndicators", [])
        ],
        interventionType=(
            InterventionType(data["interventionType"])
            if data.get("interventionType")
            else None
        ),
        interventionContent=(
            InterventionContent(**data["interventionContent"])
            if data.get("interventionContent")
            else None
        ),
        relatedConcepts=data.get("relatedConcepts", []),
        edges=[
            ConceptEdge(**e) for e in data.get("edges", [])
        ],
    )


def analyze_understanding(
    concept: str,
    explanation: str,
    evidence_type: str = "explanation",
) -> BedrockAnalysisResult:
    """Call Bedrock to analyze a student's understanding of a concept.

    Returns a structured BedrockAnalysisResult with understanding level,
    debt indicators, and optional intervention.
    """
    user_prompt = _build_analysis_prompt(concept, explanation, evidence_type)
    raw = _invoke_bedrock(ANALYSIS_SYSTEM_PROMPT, user_prompt)
    result = _parse_analysis_response(raw)

    domain_edges = get_domain_edges_for_concept(concept)
    existing = {(e.source, e.target) for e in result.edges}
    for edge in domain_edges:
        if (edge.source, edge.target) not in existing:
            result.edges.append(edge)

    return result


def build_intervention_from_result(
    concept_id: str,
    result: BedrockAnalysisResult,
) -> Optional[MicroIntervention]:
    """Build a MicroIntervention from the analysis result, if warranted."""
    if result.interventionType is None or result.interventionContent is None:
        return None

    return MicroIntervention(
        type=result.interventionType,
        targetConcept=concept_id,
        content=result.interventionContent,
    )


def generate_intervention_for_debt(
    concept: str,
    debt_indicator: DebtIndicator,
) -> Optional[MicroIntervention]:
    """Generate a targeted intervention for a specific cognitive debt pattern."""
    prompt = (
        f"A student is learning about '{concept}' and has the following "
        f"cognitive debt issue:\n\n"
        f"Type: {debt_indicator.type.value}\n"
        f"Severity: {debt_indicator.severity}\n"
        f"Evidence: {debt_indicator.evidence}\n"
        f"Explanation: {debt_indicator.explanation}\n\n"
        f"Generate a targeted micro-intervention to address this specific gap. "
        f"Return JSON with the same interventionType and interventionContent schema."
    )

    try:
        raw = _invoke_bedrock(ANALYSIS_SYSTEM_PROMPT, prompt)
        data = json.loads(raw.strip().lstrip("`").rstrip("`"))
        if data.get("interventionType") and data.get("interventionContent"):
            return MicroIntervention(
                type=InterventionType(data["interventionType"]),
                targetConcept=concept,
                content=InterventionContent(**data["interventionContent"]),
            )
    except Exception as exc:
        logger.warning("Failed to generate debt intervention: %s", exc)

    return None
