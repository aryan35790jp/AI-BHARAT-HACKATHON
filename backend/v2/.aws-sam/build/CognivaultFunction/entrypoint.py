"""
COGNIVAULT v2 — Lambda Entrypoint & Router

This is the ONLY file that AWS Lambda directly invokes.
It wires together all layers:
  1. Observability (request logging, correlation IDs, metrics)
  2. CORS (headers on every response)
  3. Authentication (JWT extraction)
  4. Rate limiting (per-user throttle)
  5. Cost guardrails (budget enforcement)
  6. Request routing (versioned API paths)
  7. Handler dispatch
  8. Error handling (centralized, standard format)

Architecture Decision:
  Single Lambda with internal routing (not per-endpoint Lambdas).
  Rationale:
    - Simpler deployment (one function to update)
    - Shared connection pool (DynamoDB, Bedrock clients)
    - Lower cold start count (one function warmed, not five)
    - Easy to split later if needed (handlers are independent modules)
  Trade-off:
    - Larger package size (but still < 10MB with zero external deps)
    - All-or-nothing deployment (mitigated by SAM canary deployments)
"""

import json
import logging
import os
import sys
import traceback

# ---------------------------------------------------------------------------
# Path setup — ensure src/ is on the Python path for Lambda
# ---------------------------------------------------------------------------
_SRC_DIR = os.path.dirname(os.path.abspath(__file__))
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

# ---------------------------------------------------------------------------
# Imports (after path setup)
# ---------------------------------------------------------------------------
from config.settings import get_settings
from errors import (
    CognivaultError, ErrorCode, NotFoundError, RateLimitedError,
    handle_exception,
)
from middleware.auth import extract_user_identity
from middleware.cors import get_cors_headers, handle_cors_preflight
from middleware.cost_guard import CostGuard
from middleware.observability import RequestLogger, emit_metric
from models.responses import SuccessResponse, ErrorResponse
from repository.dynamodb import DynamoDBRepository
from services.analysis import AnalysisService
from services.bedrock.factory import get_model_chain

from handlers.analyze import handle_analyze
from handlers.evidence import handle_submit_evidence
from handlers.expand_concept import handle_expand_concept
from handlers.mental_model import handle_get_mental_model
from handlers.interventions import handle_get_interventions
from handlers.understood import handle_mark_understood
from handlers.stream_analyze import stream_analyze_generator

# ---------------------------------------------------------------------------
# Module-level initialization (runs once per cold start)
# ---------------------------------------------------------------------------
settings = get_settings()

# Configure logging
logging.basicConfig(
    level=settings.log_level,
    format="%(message)s",  # Raw output for structured JSON logs
)
logger = logging.getLogger("cognivault.entrypoint")
logger.setLevel(settings.log_level)

# Initialize shared resources (connection reuse across warm invocations)
repository = DynamoDBRepository(settings)
model_chain = get_model_chain(settings)
analysis_service = AnalysisService(model_chain=model_chain, settings=settings)
cost_guard = CostGuard(settings=settings, repository=repository)

logger.info(
    "Cognivault v2 initialized: env=%s models=%d table=%s",
    settings.environment,
    len(model_chain),
    settings.table_name,
)

# ---------------------------------------------------------------------------
# Route Table
# ---------------------------------------------------------------------------
# Architecture Decision: Routes support both versioned (/v1/) and
# unversioned paths for backward compatibility with existing frontend.
# The frontend should migrate to /v1/ paths.

ROUTE_TABLE = {
    # Versioned routes (preferred)
    ("POST", "/v1/analyze"): "analyze",
    ("POST", "/v1/evidence"): "evidence",
    ("POST", "/v1/expand-concept"): "expand_concept",
    ("GET", "/v1/mental-model/{userId}"): "get_mental_model",
    ("GET", "/v1/interventions/{conceptId}"): "get_interventions",
    ("PUT", "/v1/mental-model/{userId}/concepts/{conceptId}/understood"): "mark_understood",

    # Legacy routes (backward compatibility)
    ("POST", "/analyze"): "analyze",
    ("POST", "/evidence"): "evidence",
    ("GET", "/mental-model/{userId}"): "get_mental_model",
    ("GET", "/interventions/{conceptId}"): "get_interventions",
    ("PUT", "/mental-model/{userId}/concepts/{conceptId}/understood"): "mark_understood",
}


# ---------------------------------------------------------------------------
# Lambda Handler
# ---------------------------------------------------------------------------
def lambda_handler(event, context):
    """
    AWS Lambda entry point.

    Every request flows through this function in this order:
      1. Create request logger (correlation ID, timing)
      2. Check for CORS preflight
      3. Get CORS headers
      4. Extract authentication
      5. Check rate limit
      6. Route to handler
      7. Return success or error response

    All exceptions are caught and converted to standard error responses.
    No unhandled exception ever reaches the Lambda runtime.
    """
    cors_headers = get_cors_headers(settings)
    request_logger = RequestLogger(event, namespace=settings.metrics_namespace)
    request_logger.log_request()

    try:
        method = event.get("httpMethod", "").upper()
        resource = event.get("resource", "")

        # --- Detect Lambda Function URL events (InvokeMode=RESPONSE_STREAM) ---
        # Function URL events have requestContext.http instead of httpMethod
        if not method:
            fn_ctx = event.get("requestContext", {}).get("http", {})
            method = fn_ctx.get("method", "").upper()
            resource = event.get("rawPath", "")

        # Route /stream-analyze to the streaming generator regardless of origin
        if resource in ("/stream-analyze", "/stream-analyze/"):
            if method == "OPTIONS":
                return iter([b""])
            return stream_analyze_generator(event, analysis_service)

        # --- CORS Preflight ---
        if method == "OPTIONS":
            return handle_cors_preflight(settings)

        # --- Route lookup ---
        route_key = (method, resource)
        handler_name = ROUTE_TABLE.get(route_key)

        if not handler_name:
            raise NotFoundError(f"{method} {resource}")

        # --- Authentication ---
        # Parse body early for userId extraction (dev mode)
        raw_body = event.get("body", "")
        body_dict = None
        if raw_body:
            try:
                body_dict = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
            except (json.JSONDecodeError, TypeError):
                body_dict = None

        auth = extract_user_identity(event, settings, body_dict)
        request_logger.set_user_id(auth.user_id)

        # --- Rate Limiting ---
        if settings.enable_rate_limiting and auth.user_id and auth.user_id != "anonymous":
            request_count = repository.check_and_increment_rate(auth.user_id)
            if request_count > settings.rate_limit_per_minute:
                emit_metric(
                    settings.metrics_namespace, "RateLimited", 1, "Count",
                    {"UserId": auth.user_id[:20]},
                )
                raise RateLimitedError(retry_after=60)

        # --- Request size check (for POST/PUT) ---
        if method in ("POST", "PUT") and raw_body:
            cost_guard.check_request_size(
                raw_body if isinstance(raw_body, str) else json.dumps(raw_body)
            )

        # --- Dispatch to handler ---
        if handler_name == "analyze":
            result = handle_analyze(
                event, auth, analysis_service, repository, cost_guard, request_logger,
            )
        elif handler_name == "expand_concept":
            result = handle_expand_concept(
                event, auth, analysis_service, request_logger,
            )
        elif handler_name == "evidence":
            result = handle_submit_evidence(
                event, auth, analysis_service, repository, cost_guard, request_logger,
            )
        elif handler_name == "get_mental_model":
            result = handle_get_mental_model(event, auth, repository, request_logger)
        elif handler_name == "get_interventions":
            result = handle_get_interventions(event, auth, repository, request_logger)
        elif handler_name == "mark_understood":
            result = handle_mark_understood(event, auth, repository, request_logger)
        else:
            raise NotFoundError(f"Unknown handler: {handler_name}")

        # --- Success response ---
        response = SuccessResponse.build(result, status=200, cors_headers=cors_headers)

        # --- Emit request metric ---
        emit_metric(
            settings.metrics_namespace, "RequestCount", 1, "Count",
            {"Endpoint": resource, "Method": method},
        )
        emit_metric(
            settings.metrics_namespace, "RequestLatency",
            request_logger.get_elapsed_ms(), "Milliseconds",
            {"Endpoint": resource},
        )

        request_logger.log_response(200, len(response.get("body", "")))
        return response

    except CognivaultError as exc:
        # Known application error — clean response
        include_detail = settings.environment in ("dev", "staging")
        response = ErrorResponse.build(
            status=exc.status_code,
            code=exc.code,
            message=exc.message,
            request_id=request_logger.correlation_id,
            detail=exc.detail,
            include_detail=include_detail,
            cors_headers=cors_headers,
        )
        request_logger.log_error(exc.code, exc.message, exc.detail or "")

        emit_metric(
            settings.metrics_namespace, "ErrorCount", 1, "Count",
            {"ErrorCode": exc.code},
        )

        request_logger.log_response(exc.status_code)
        return response

    except Exception as exc:
        # Unknown error — log full traceback, return generic 500
        logger.error("Unhandled: %s\n%s", exc, traceback.format_exc())
        include_detail = settings.environment in ("dev", "staging")
        response = ErrorResponse.build(
            status=500,
            code=ErrorCode.INTERNAL_ERROR,
            message="Internal server error",
            request_id=request_logger.correlation_id,
            detail=str(exc) if include_detail else None,
            include_detail=include_detail,
            cors_headers=cors_headers,
        )

        emit_metric(
            settings.metrics_namespace, "ErrorCount", 1, "Count",
            {"ErrorCode": "INTERNAL_ERROR"},
        )

        request_logger.log_response(500)
        return response


# ---------------------------------------------------------------------------
# Streaming Handler — Lambda Function URL (InvokeMode=RESPONSE_STREAM)
# ---------------------------------------------------------------------------
# This is a SEPARATE entry point from lambda_handler.  It is only invoked
# when the Lambda Function URL (not API Gateway) receives a request.
# Lambda streams each `yield` to the browser immediately.
#
# How to point Lambda Function URL here:
#   In the Function URL config set Handler = entrypoint.streaming_handler
#   OR keep the regular handler and just create a second function that
#   references this symbol.  Either approach works.
#
# CORS for this handler is configured at the Function URL level in AWS
# (not in response headers) so we don't need to add them here.

def streaming_handler(event, context):
    """
    Entry point for Lambda Function URL with InvokeMode=RESPONSE_STREAM.

    Lambda will call this function and stream each yielded bytes object to
    the HTTP client immediately, without buffering.  This enables true
    token-by-token SSE streaming without needing a proxy or WebSocket.
    """
    # Handle CORS pre-flight.  Function URL CORS is configured in AWS but
    # some clients still send OPTIONS — return an empty iterator so Lambda
    # doesn't error.
    try:
        request_context = event.get("requestContext", {})
        method = request_context.get("http", {}).get("method", "").upper()
        if not method:
            # Older Function URL event shape
            method = event.get("httpMethod", "").upper()
    except Exception:
        method = "POST"

    if method == "OPTIONS":
        return iter([b""])

    return stream_analyze_generator(event, analysis_service)
