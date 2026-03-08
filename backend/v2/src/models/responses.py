"""
Response builders.

Architecture Decision:
  All responses go through these builders to ensure consistent structure,
  CORS headers, and JSON serialization (including Decimal handling for DynamoDB).
"""

import json
from decimal import Decimal
from typing import Any, Optional


class _DecimalEncoder(json.JSONEncoder):
    """Handle DynamoDB Decimal types in JSON serialization."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, cls=_DecimalEncoder, default=str)


class SuccessResponse:
    """Build a standard success response for API Gateway proxy integration."""

    @staticmethod
    def build(body: Any, status: int = 200, cors_headers: dict = None) -> dict:
        headers = cors_headers or {}
        headers["Content-Type"] = "application/json"
        return {
            "statusCode": status,
            "headers": headers,
            "body": _json_dumps(body) if not isinstance(body, str) else body,
        }


class ErrorResponse:
    """Build a standard error response for API Gateway proxy integration."""

    @staticmethod
    def build(
        status: int,
        code: str,
        message: str,
        request_id: str = "",
        detail: Optional[str] = None,
        include_detail: bool = False,
        cors_headers: dict = None,
    ) -> dict:
        error_body = {
            "code": code,
            "message": message,
            "requestId": request_id,
        }
        if include_detail and detail:
            error_body["detail"] = detail

        headers = cors_headers or {}
        headers["Content-Type"] = "application/json"

        return {
            "statusCode": status,
            "headers": headers,
            "body": json.dumps({"error": error_body}),
        }
