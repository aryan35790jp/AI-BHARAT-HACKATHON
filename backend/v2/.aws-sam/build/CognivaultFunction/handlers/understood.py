"""
PUT /v1/mental-model/{userId}/concepts/{conceptId}/understood handler.

Marks a concept as understood, bumping confidence and clearing debt indicators.
"""

import logging

from errors import MissingParameterError
from middleware.auth import AuthContext
from middleware.observability import RequestLogger, emit_metric
from models.domain import MentalModel
from repository.dynamodb import DynamoDBRepository

logger = logging.getLogger("cognivault.handlers.understood")


def handle_mark_understood(
    event: dict,
    auth: AuthContext,
    repository: DynamoDBRepository,
    request_logger: RequestLogger,
) -> dict:
    """
    Process PUT /v1/mental-model/{userId}/concepts/{conceptId}/understood.

    Marks a concept as "solid" understanding and clears debt indicators.
    """
    path_params = event.get("pathParameters") or {}
    user_id = path_params.get("userId")
    concept_id = path_params.get("conceptId")

    if not user_id:
        raise MissingParameterError("userId")
    if not concept_id:
        raise MissingParameterError("conceptId")

    request_logger.set_user_id(user_id)
    request_logger.add_context(concept=concept_id)

    model = repository.update_concept_understood(user_id, concept_id)

    if model is None:
        # No model exists yet — create empty and return
        model = MentalModel(userId=user_id)
        repository.save_mental_model(model)

    # Emit metric
    emit_metric(
        request_logger.namespace, "ConceptUnderstood", 1, "Count",
        {"Concept": concept_id},
    )

    return model.to_dict()
