"""
POST /v1/expand-concept handler.

Accepts a concept name and returns domain-specific related concepts
for building the cognitive map. This powers dynamic, domain-aware
graph node generation.
"""

import json
import logging

from errors import ValidationError, InvalidJsonError
from middleware.auth import AuthContext
from middleware.observability import RequestLogger
from services.analysis import AnalysisService

logger = logging.getLogger("cognivault.handlers.expand_concept")


def handle_expand_concept(
    event: dict,
    auth: AuthContext,
    analysis_service: AnalysisService,
    request_logger: RequestLogger,
) -> dict:
    """
    Process POST /v1/expand-concept.

    Flow:
      1. Parse and validate request body
      2. Call LLM to generate domain-specific related concepts
      3. Return domain + concept list
    """
    try:
        raw_body = event.get("body", "")
        if not raw_body:
            raise InvalidJsonError("Empty request body")
        body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
    except (json.JSONDecodeError, TypeError) as exc:
        raise InvalidJsonError(str(exc))

    concept = str(body.get("concept", "")).strip()
    if not concept:
        raise ValidationError("concept is required")

    request_logger.add_context(concept=concept)

    result = analysis_service.expand_concept(concept)

    return {
        "concept": concept,
        "domain": result.get("domain", "general"),
        "concepts": result.get("concepts", []),
    }
