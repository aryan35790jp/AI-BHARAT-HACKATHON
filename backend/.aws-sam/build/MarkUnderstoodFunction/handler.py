"""AWS Lambda handlers for Cognivault Cognitive Debt Map API.

Each public ``handle_*`` function is wired as a Lambda handler in template.yaml.
All handlers return JSON with CORS headers and standardised error envelopes.
"""

from __future__ import annotations

import json
import logging
import os
import traceback
from typing import Any

from pydantic import ValidationError

from models import (
    AnalyzeRequest,
    AnalyzeResponse,
    ConceptEdge,
    EvidenceResponse,
    EvidenceSubmission,
    MentalModelGraph,
    MicroIntervention,
)
from repository import (
    get_interventions_for_concept,
    get_mental_model,
    save_evidence,
    save_intervention,
    save_mental_model,
    update_concept_understood,
    update_model_with_analysis,
)
from bedrock_service import (
    analyze_understanding,
    build_intervention_from_result,
)

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger(__name__)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-User-Id",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json",
}


# ---------------------------------------------------------------------------
# Response builders
# ---------------------------------------------------------------------------

def _ok(body: Any, status: int = 200) -> dict:
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, default=str) if not isinstance(body, str) else body,
    }


def _error(status: int, message: str, detail: str | None = None) -> dict:
    body: dict[str, Any] = {"error": message}
    if detail:
        body["detail"] = detail
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body),
    }


def _parse_body(event: dict) -> dict:
    raw = event.get("body", "")
    if not raw:
        return {}
    if isinstance(raw, str):
        return json.loads(raw)
    return raw


def _path_param(event: dict, name: str) -> str | None:
    return (event.get("pathParameters") or {}).get(name)


def _query_param(event: dict, name: str) -> str | None:
    return (event.get("queryStringParameters") or {}).get(name)


# ---------------------------------------------------------------------------
# POST /analyze
# ---------------------------------------------------------------------------

def handle_analyze(event: dict, context: Any) -> dict:
    """Analyze a concept explanation and detect cognitive debt.

    Body: { concept, explanation, userId }
    Returns: AnalyzeResponse JSON
    """
    logger.info("POST /analyze invoked")

    try:
        body = _parse_body(event)
    except (json.JSONDecodeError, TypeError) as exc:
        return _error(400, "Invalid JSON body", str(exc))

    try:
        req = AnalyzeRequest(**body)
    except ValidationError as exc:
        return _error(422, "Validation error", exc.errors()[0].get("msg", str(exc)))

    try:
        result = analyze_understanding(
            concept=req.concept,
            explanation=req.explanation,
            evidence_type="explanation",
        )

        intervention = build_intervention_from_result(req.concept, result)

        # Persist to DynamoDB
        save_evidence(
            user_id=req.userId,
            evidence_type="explanation",
            content=req.explanation,
            concept_id=req.concept,
            analysis_result=result.model_dump(),
        )

        # Update the user's mental model graph
        update_model_with_analysis(
            user_id=req.userId,
            concept_id=req.concept,
            level=result.understandingLevel,
            confidence=result.confidence,
            debt_indicators=result.debtIndicators,
            new_edges=result.edges,
        )

        if intervention:
            save_intervention(req.userId, req.concept, intervention)

        response = AnalyzeResponse(
            conceptId=req.concept,
            understandingLevel=result.understandingLevel,
            confidence=result.confidence,
            debtIndicators=result.debtIndicators,
            microIntervention=intervention,
        )

        return _ok(response.model_dump())

    except Exception as exc:
        logger.error("analyze failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Analysis failed", str(exc))


# ---------------------------------------------------------------------------
# POST /evidence
# ---------------------------------------------------------------------------

def handle_submit_evidence(event: dict, context: Any) -> dict:
    """Submit evidence for analysis (matches frontend contract).

    Body: { userId, type, content, conceptId? }
    Returns: { updatedModel: MentalModelGraph, interventions: MicroIntervention[] }
    """
    logger.info("POST /evidence invoked")

    try:
        body = _parse_body(event)
    except (json.JSONDecodeError, TypeError) as exc:
        return _error(400, "Invalid JSON body", str(exc))

    try:
        submission = EvidenceSubmission(**body)
    except ValidationError as exc:
        return _error(422, "Validation error", exc.errors()[0].get("msg", str(exc)))

    concept_id = submission.conceptId or "general"

    try:
        result = analyze_understanding(
            concept=concept_id,
            explanation=submission.content,
            evidence_type=submission.type.value,
        )

        intervention = build_intervention_from_result(concept_id, result)

        save_evidence(
            user_id=submission.userId,
            evidence_type=submission.type.value,
            content=submission.content,
            concept_id=concept_id,
            analysis_result=result.model_dump(),
        )

        updated_model = update_model_with_analysis(
            user_id=submission.userId,
            concept_id=concept_id,
            level=result.understandingLevel,
            confidence=result.confidence,
            debt_indicators=result.debtIndicators,
            new_edges=result.edges,
        )

        interventions: list[MicroIntervention] = []
        if intervention:
            save_intervention(submission.userId, concept_id, intervention)
            interventions.append(intervention)

        response = EvidenceResponse(
            updatedModel=updated_model,
            interventions=interventions,
        )

        return _ok(response.model_dump())

    except Exception as exc:
        logger.error("submit_evidence failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Evidence submission failed", str(exc))


# ---------------------------------------------------------------------------
# GET /mental-model/{userId}
# ---------------------------------------------------------------------------

def handle_get_mental_model(event: dict, context: Any) -> dict:
    """Retrieve the user's mental model graph.

    Path: /mental-model/{userId}
    Returns: MentalModelGraph JSON
    """
    user_id = _path_param(event, "userId")
    if not user_id:
        return _error(400, "Missing userId path parameter")

    logger.info("GET /mental-model/%s", user_id)

    try:
        model = get_mental_model(user_id)
        if model is None:
            # Return a fresh empty model for new users
            model = MentalModelGraph(userId=user_id)
            save_mental_model(model)

        return _ok(model.model_dump())

    except Exception as exc:
        logger.error("get_mental_model failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Failed to retrieve mental model", str(exc))


# ---------------------------------------------------------------------------
# GET /interventions/{conceptId}?userId=
# ---------------------------------------------------------------------------

def handle_get_interventions(event: dict, context: Any) -> dict:
    """Fetch micro-interventions for a concept.

    Path: /interventions/{conceptId}?userId=<userId>
    Returns: MicroIntervention[] JSON
    """
    concept_id = _path_param(event, "conceptId")
    user_id = _query_param(event, "userId")

    if not concept_id:
        return _error(400, "Missing conceptId path parameter")
    if not user_id:
        return _error(400, "Missing userId query parameter")

    logger.info("GET /interventions/%s?userId=%s", concept_id, user_id)

    try:
        interventions = get_interventions_for_concept(user_id, concept_id)
        return _ok([i.model_dump() for i in interventions])

    except Exception as exc:
        logger.error("get_interventions failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Failed to retrieve interventions", str(exc))


# ---------------------------------------------------------------------------
# PUT /mental-model/{userId}/concepts/{conceptId}/understood
# ---------------------------------------------------------------------------

def handle_mark_understood(event: dict, context: Any) -> dict:
    """Mark a concept as understood and update the model.

    Path: /mental-model/{userId}/concepts/{conceptId}/understood
    Returns: Updated MentalModelGraph JSON
    """
    user_id = _path_param(event, "userId")
    concept_id = _path_param(event, "conceptId")

    if not user_id:
        return _error(400, "Missing userId path parameter")
    if not concept_id:
        return _error(400, "Missing conceptId path parameter")

    logger.info("PUT /mental-model/%s/concepts/%s/understood", user_id, concept_id)

    try:
        model = update_concept_understood(user_id, concept_id)
        if model is None:
            model = MentalModelGraph(userId=user_id)
            save_mental_model(model)

        return _ok(model.model_dump())

    except Exception as exc:
        logger.error("mark_understood failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Failed to mark concept as understood", str(exc))
