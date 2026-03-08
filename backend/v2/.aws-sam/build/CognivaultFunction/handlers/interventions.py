"""
GET /v1/interventions/{conceptId} handler.

Returns pending micro-interventions for a specific concept.
"""

import logging

from errors import MissingParameterError
from middleware.auth import AuthContext
from middleware.observability import RequestLogger
from repository.dynamodb import DynamoDBRepository

logger = logging.getLogger("cognivault.handlers.interventions")


def handle_get_interventions(
    event: dict,
    auth: AuthContext,
    repository: DynamoDBRepository,
    request_logger: RequestLogger,
) -> list:
    """
    Process GET /v1/interventions/{conceptId}?userId=<userId>.

    Returns a list of pending interventions.
    """
    path_params = event.get("pathParameters") or {}
    query_params = event.get("queryStringParameters") or {}

    concept_id = path_params.get("conceptId")
    user_id = query_params.get("userId") or auth.user_id

    if not concept_id:
        raise MissingParameterError("conceptId")
    if not user_id:
        raise MissingParameterError("userId")

    request_logger.set_user_id(user_id)
    request_logger.add_context(concept=concept_id)

    interventions = repository.get_interventions_for_concept(user_id, concept_id)
    return interventions
