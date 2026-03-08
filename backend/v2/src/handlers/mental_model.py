"""
GET /v1/mental-model/{userId} handler.

Returns the user's current mental model (concepts, edges, progress).
Creates an empty model if none exists.
"""

import logging

from errors import MissingParameterError
from middleware.auth import AuthContext
from middleware.observability import RequestLogger
from models.domain import MentalModel
from repository.dynamodb import DynamoDBRepository

logger = logging.getLogger("cognivault.handlers.mental_model")


def handle_get_mental_model(
    event: dict,
    auth: AuthContext,
    repository: DynamoDBRepository,
    request_logger: RequestLogger,
) -> dict:
    """
    Process GET /v1/mental-model/{userId}.

    Returns the current mental model, creating an empty one if needed.
    """
    path_params = event.get("pathParameters") or {}
    user_id = path_params.get("userId")

    if not user_id:
        raise MissingParameterError("userId")

    request_logger.set_user_id(user_id)

    model = repository.get_mental_model(user_id)
    if model is None:
        model = MentalModel(userId=user_id)
        repository.save_mental_model(model)
        logger.info("Created empty mental model for user=%s", user_id)

    return model.to_dict()
