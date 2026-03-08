"""
Custom exception hierarchy and centralized error handling.

Architecture Decision:
  All application errors extend CognivaultError. Each error carries:
  - HTTP status code
  - Machine-readable error code (for frontend switch statements)
  - Human-readable message
  - Optional detail (debug info, hidden in prod)

  This enables a single error handler in the entrypoint that catches
  CognivaultError and formats the standard error response.
  Unknown exceptions become 500 INTERNAL_ERROR.
"""

import json
import logging
import traceback
from typing import Optional

logger = logging.getLogger("cognivault.errors")


# ---------------------------------------------------------------------------
# Error Codes — machine-readable, used by frontend
# ---------------------------------------------------------------------------
class ErrorCode:
    # 4xx Client Errors
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_JSON = "INVALID_JSON"
    MISSING_PARAMETER = "MISSING_PARAMETER"
    NOT_FOUND = "NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    RATE_LIMITED = "RATE_LIMITED"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"

    # 5xx Server Errors
    INTERNAL_ERROR = "INTERNAL_ERROR"
    MODEL_ERROR = "MODEL_ERROR"
    MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
    DATABASE_ERROR = "DATABASE_ERROR"
    ANALYSIS_FAILED = "ANALYSIS_FAILED"
    BUDGET_EXCEEDED = "BUDGET_EXCEEDED"


# ---------------------------------------------------------------------------
# Exception Hierarchy
# ---------------------------------------------------------------------------
class CognivaultError(Exception):
    """Base exception for all Cognivault errors."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        detail: Optional[str] = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)


class ValidationError(CognivaultError):
    def __init__(self, message: str, detail: Optional[str] = None):
        super().__init__(422, ErrorCode.VALIDATION_ERROR, message, detail)


class InvalidJsonError(CognivaultError):
    def __init__(self, detail: Optional[str] = None):
        super().__init__(400, ErrorCode.INVALID_JSON, "Invalid JSON body", detail)


class MissingParameterError(CognivaultError):
    def __init__(self, param_name: str):
        super().__init__(
            400, ErrorCode.MISSING_PARAMETER,
            f"Missing required parameter: {param_name}"
        )


class NotFoundError(CognivaultError):
    def __init__(self, resource: str):
        super().__init__(404, ErrorCode.NOT_FOUND, f"Not found: {resource}")


class UnauthorizedError(CognivaultError):
    def __init__(self, detail: Optional[str] = None):
        super().__init__(401, ErrorCode.UNAUTHORIZED, "Authentication required", detail)


class ForbiddenError(CognivaultError):
    def __init__(self, detail: Optional[str] = None):
        super().__init__(403, ErrorCode.FORBIDDEN, "Access denied", detail)


class RateLimitedError(CognivaultError):
    def __init__(self, retry_after: int = 60):
        super().__init__(
            429, ErrorCode.RATE_LIMITED,
            f"Rate limit exceeded. Retry after {retry_after} seconds",
            detail=str(retry_after),
        )


class PayloadTooLargeError(CognivaultError):
    def __init__(self, max_bytes: int):
        super().__init__(
            413, ErrorCode.PAYLOAD_TOO_LARGE,
            f"Request payload exceeds maximum size of {max_bytes} bytes",
        )


class ModelError(CognivaultError):
    def __init__(self, message: str, detail: Optional[str] = None):
        super().__init__(502, ErrorCode.MODEL_ERROR, message, detail)


class ModelUnavailableError(CognivaultError):
    def __init__(self, detail: Optional[str] = None):
        super().__init__(
            503, ErrorCode.MODEL_UNAVAILABLE,
            "AI model temporarily unavailable", detail
        )


class DatabaseError(CognivaultError):
    def __init__(self, detail: Optional[str] = None):
        super().__init__(500, ErrorCode.DATABASE_ERROR, "Database operation failed", detail)


class AnalysisFailedError(CognivaultError):
    def __init__(self, detail: Optional[str] = None):
        super().__init__(500, ErrorCode.ANALYSIS_FAILED, "Analysis failed", detail)


class BudgetExceededError(CognivaultError):
    def __init__(self):
        super().__init__(
            503, ErrorCode.BUDGET_EXCEEDED,
            "Daily budget limit reached. Service will resume tomorrow.",
        )


# ---------------------------------------------------------------------------
# Standard Error Response Builder
# ---------------------------------------------------------------------------
def build_error_response(
    status_code: int,
    code: str,
    message: str,
    request_id: str = "",
    detail: Optional[str] = None,
    include_detail: bool = False,
) -> dict:
    """
    Build the standard error response envelope.

    {
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "concept is required",
            "requestId": "abc123"
        }
    }

    Architecture Decision: `detail` is only included when include_detail=True
    (dev/staging). In prod, details may leak internal info.
    """
    error_body = {
        "code": code,
        "message": message,
        "requestId": request_id,
    }
    if include_detail and detail:
        error_body["detail"] = detail

    return {
        "error": error_body,
    }


def handle_exception(
    exc: Exception,
    request_id: str = "",
    environment: str = "prod",
) -> tuple:
    """
    Central exception handler. Returns (status_code, response_body_dict).
    Called from the entrypoint for any unhandled exception.
    """
    include_detail = environment in ("dev", "staging")

    if isinstance(exc, CognivaultError):
        logger.warning(
            "Application error: code=%s message=%s detail=%s",
            exc.code, exc.message, exc.detail,
        )
        body = build_error_response(
            exc.status_code, exc.code, exc.message,
            request_id=request_id,
            detail=exc.detail,
            include_detail=include_detail,
        )
        return exc.status_code, body

    # Unknown exception — log full traceback
    logger.error(
        "Unhandled exception: %s\n%s",
        str(exc), traceback.format_exc(),
    )
    body = build_error_response(
        500, ErrorCode.INTERNAL_ERROR, "Internal server error",
        request_id=request_id,
        detail=str(exc) if include_detail else None,
        include_detail=include_detail,
    )
    return 500, body
