"""
POST /v1/analyze handler.

Accepts a concept + explanation, runs AI analysis, persists results,
and returns the analysis with optional micro-intervention.
"""

import json
import logging

from errors import ValidationError, InvalidJsonError
from middleware.auth import AuthContext
from middleware.cost_guard import CostGuard
from middleware.observability import RequestLogger, emit_metric
from models.requests import AnalyzeRequest
from repository.dynamodb import DynamoDBRepository
from services.analysis import AnalysisService
from services.intervention import build_intervention

logger = logging.getLogger("cognivault.handlers.analyze")


def handle_analyze(
    event: dict,
    auth: AuthContext,
    analysis_service: AnalysisService,
    repository: DynamoDBRepository,
    cost_guard: CostGuard,
    request_logger: RequestLogger,
) -> dict:
    """
    Process POST /v1/analyze.

    Flow:
      1. Parse and validate request body
      2. Check cost guardrails
      3. Run AI analysis (with fallback chain)
      4. Build intervention (if needed)
      5. Persist evidence + update mental model + save intervention
      6. Record cost
      7. Return response
    """
    # Parse body
    try:
        raw_body = event.get("body", "")
        if not raw_body:
            raise InvalidJsonError("Empty request body")
        body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
    except (json.JSONDecodeError, TypeError) as exc:
        raise InvalidJsonError(str(exc))

    # Validate
    req = AnalyzeRequest.from_dict(body)
    errors = req.validate()
    if errors:
        raise ValidationError("; ".join(errors))

    concept = req.concept.strip()
    explanation = req.explanation.strip()
    user_id = auth.user_id or req.userId.strip()

    request_logger.set_user_id(user_id)
    request_logger.add_context(concept=concept, evidenceType="explanation")

    # Cost guardrails
    cost_guard.check_daily_budget()

    # Run analysis
    result = analysis_service.analyze(concept, explanation, "explanation")

    # Record model cost
    cost_guard.record_invocation(
        user_id=user_id,
        model_id=result.modelUsed,
        input_tokens=0,  # Already tracked in AnalysisService
        output_tokens=0,
        cost_usd=result.estimatedCostUsd,
        latency_ms=result.latencyMs,
    )

    # Build intervention
    intervention = build_intervention(concept, result)

    # Persist
    repository.save_evidence(
        user_id=user_id,
        evidence_type="explanation",
        content=explanation,
        concept_id=concept,
        analysis_result=result.to_dict(),
    )

    edge_dicts = [e.to_dict() for e in result.edges]
    debt_dicts = [d.to_dict() for d in result.debtIndicators]

    repository.update_model_with_analysis(
        user_id=user_id,
        concept_id=concept,
        level=result.understandingLevel,
        confidence=result.confidence,
        debt_indicators=debt_dicts,
        new_edges=edge_dicts,
    )

    if intervention:
        repository.save_intervention(user_id, concept, intervention.to_dict())

    # Emit metrics
    emit_metric(
        request_logger.namespace, "AnalysisCount", 1, "Count",
        {"Level": result.understandingLevel},
    )
    if result.latencyMs > 0:
        emit_metric(
            request_logger.namespace, "ModelLatency", result.latencyMs, "Milliseconds",
            {"Model": result.modelUsed.split(":")[0] if ":" in result.modelUsed else result.modelUsed},
        )

    # Build response
    return {
        "conceptId": concept,
        "understandingLevel": result.understandingLevel,
        "confidence": result.confidence,
        "debtIndicators": debt_dicts,
        "microIntervention": intervention.to_dict() if intervention else None,
        "missingConcepts": result.missingConcepts or [],
        "suggestedExplanation": result.suggestedExplanation,
        "nextQuestion": result.nextQuestion,
        "modelUsed": result.modelUsed,
        "relatedConcepts": result.relatedConcepts or [],
        "prerequisites": result.prerequisites or [e.source for e in result.edges if e.relationship == "prerequisite"],
    }
