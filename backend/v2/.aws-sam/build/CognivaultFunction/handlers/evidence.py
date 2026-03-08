"""
POST /v1/evidence handler.

Accepts evidence (explanation, code, or QA reasoning) for a concept,
analyzes it, and updates the mental model.
"""

import json
import logging

from errors import ValidationError, InvalidJsonError
from middleware.auth import AuthContext
from middleware.cost_guard import CostGuard
from middleware.observability import RequestLogger, emit_metric
from models.requests import EvidenceRequest
from repository.dynamodb import DynamoDBRepository
from services.analysis import AnalysisService
from services.intervention import build_intervention

logger = logging.getLogger("cognivault.handlers.evidence")


def handle_submit_evidence(
    event: dict,
    auth: AuthContext,
    analysis_service: AnalysisService,
    repository: DynamoDBRepository,
    cost_guard: CostGuard,
    request_logger: RequestLogger,
) -> dict:
    """
    Process POST /v1/evidence.

    Flow:
      1. Parse and validate request body
      2. Check cost guardrails
      3. Run AI analysis
      4. Persist evidence + update mental model
      5. Return updated model + interventions
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
    req = EvidenceRequest.from_dict(body)
    errors = req.validate()
    if errors:
        raise ValidationError("; ".join(errors))

    user_id = auth.user_id or req.userId.strip()
    ev_type = req.type
    content = req.content.strip()
    concept_id = req.conceptId

    request_logger.set_user_id(user_id)
    request_logger.add_context(concept=concept_id, evidenceType=ev_type)

    # Cost guardrails
    cost_guard.check_daily_budget()

    # Run analysis
    result = analysis_service.analyze(concept_id, content, ev_type)

    # Record cost
    cost_guard.record_invocation(
        user_id=user_id,
        model_id=result.modelUsed,
        input_tokens=0,
        output_tokens=0,
        cost_usd=result.estimatedCostUsd,
        latency_ms=result.latencyMs,
    )

    # Build intervention
    intervention = build_intervention(concept_id, result)

    # Persist evidence
    repository.save_evidence(
        user_id=user_id,
        evidence_type=ev_type,
        content=content,
        concept_id=concept_id,
        analysis_result=result.to_dict(),
    )

    # Update mental model
    edge_dicts = [e.to_dict() for e in result.edges]
    debt_dicts = [d.to_dict() for d in result.debtIndicators]

    updated_model = repository.update_model_with_analysis(
        user_id=user_id,
        concept_id=concept_id,
        level=result.understandingLevel,
        confidence=result.confidence,
        debt_indicators=debt_dicts,
        new_edges=edge_dicts,
    )

    # Save intervention
    interventions = []
    if intervention:
        repository.save_intervention(user_id, concept_id, intervention.to_dict())
        interventions.append(intervention.to_dict())

    # Emit metrics
    emit_metric(
        request_logger.namespace, "EvidenceSubmitted", 1, "Count",
        {"Type": ev_type},
    )

    return {
        "updatedModel": updated_model.to_dict(),
        "interventions": interventions,
    }
