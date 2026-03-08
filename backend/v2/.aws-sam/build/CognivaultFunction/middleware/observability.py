"""
Observability middleware — structured logging, correlation IDs, CloudWatch metrics.

Architecture Decision:

  Structured JSON Logging:
    Every log line is a JSON object with consistent fields.
    This enables CloudWatch Insights queries like:
      fields @timestamp, requestId, userId, endpoint, latencyMs
      | filter level = "ERROR"
      | sort @timestamp desc

  Correlation IDs:
    Every request gets a unique correlationId. This ID is:
    1. Generated from the API Gateway requestId (if available)
    2. Passed through to all service calls
    3. Included in every log line
    4. Returned in the response header X-Correlation-Id
    This enables tracing a single request across all log entries.

  CloudWatch Embedded Metric Format (EMF):
    Metrics are emitted via stdout using the EMF format.
    CloudWatch automatically extracts them — no PutMetricData API call needed.
    This is zero-cost for metric emission (you only pay for metric storage).

  Metrics emitted:
    - RequestCount (per endpoint)
    - RequestLatency (per endpoint)
    - ErrorCount (per error code)
    - ModelLatency (per model)
    - ModelCost (per model)
    - AnalysisCount (per understanding level)
"""

import json
import logging
import time
import uuid
from typing import Any, Dict, Optional

logger = logging.getLogger("cognivault.observability")


class RequestLogger:
    """
    Structured request logger with correlation ID tracking.
    Created per-request in the entrypoint.
    """

    def __init__(self, event: dict, namespace: str = "Cognivault"):
        self.namespace = namespace
        self.start_time = time.time()

        # Extract or generate correlation ID
        headers = event.get("headers") or {}
        request_context = event.get("requestContext") or {}

        self.correlation_id = (
            headers.get("X-Correlation-Id")
            or headers.get("x-correlation-id")
            or request_context.get("requestId")
            or uuid.uuid4().hex[:16]
        )

        self.method = event.get("httpMethod", "UNKNOWN")
        self.path = event.get("resource", event.get("path", "UNKNOWN"))
        self.source_ip = (request_context.get("identity") or {}).get("sourceIp", "")
        self.user_agent = headers.get("User-Agent") or headers.get("user-agent") or ""
        self.user_id = ""
        self._extra: Dict[str, Any] = {}

    def set_user_id(self, user_id: str) -> None:
        self.user_id = user_id

    def add_context(self, **kwargs) -> None:
        """Add extra context fields to all subsequent logs."""
        self._extra.update(kwargs)

    def _base_fields(self) -> dict:
        return {
            "correlationId": self.correlation_id,
            "method": self.method,
            "path": self.path,
            "userId": self.user_id,
            **self._extra,
        }

    def log_request(self) -> None:
        """Log the incoming request."""
        logger.info(json.dumps({
            "event": "REQUEST_RECEIVED",
            "level": "INFO",
            **self._base_fields(),
            "sourceIp": self.source_ip,
            "userAgent": self.user_agent[:100],
        }))

    def log_response(self, status_code: int, body_size: int = 0) -> None:
        """Log the outgoing response."""
        elapsed_ms = (time.time() - self.start_time) * 1000
        logger.info(json.dumps({
            "event": "REQUEST_COMPLETED",
            "level": "INFO",
            **self._base_fields(),
            "statusCode": status_code,
            "latencyMs": round(elapsed_ms, 1),
            "bodySize": body_size,
        }))

    def log_error(self, error_code: str, message: str, detail: str = "") -> None:
        """Log an error event."""
        logger.error(json.dumps({
            "event": "REQUEST_ERROR",
            "level": "ERROR",
            **self._base_fields(),
            "errorCode": error_code,
            "message": message,
            "detail": detail[:300],
        }))

    def log_model_invocation(
        self,
        model_id: str,
        provider: str,
        latency_ms: float,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        success: bool,
    ) -> None:
        """Log a model invocation."""
        level_fn = logger.info if success else logger.warning
        level_fn(json.dumps({
            "event": "MODEL_INVOCATION",
            "level": "INFO" if success else "WARN",
            **self._base_fields(),
            "modelId": model_id,
            "provider": provider,
            "latencyMs": round(latency_ms, 1),
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "costUsd": round(cost_usd, 6),
            "success": success,
        }))

    def get_elapsed_ms(self) -> float:
        return (time.time() - self.start_time) * 1000


def emit_metric(
    namespace: str,
    metric_name: str,
    value: float,
    unit: str = "Count",
    dimensions: Optional[Dict[str, str]] = None,
) -> None:
    """
    Emit a CloudWatch metric using Embedded Metric Format (EMF).

    Architecture Decision:
      EMF metrics are printed to stdout and automatically extracted
      by CloudWatch. No API call needed. Zero additional cost for emission.
      Only pay for metric storage/alarms.

    Usage:
      emit_metric("Cognivault", "RequestCount", 1, "Count", {"Endpoint": "/v1/analyze"})
    """
    dims = dimensions or {}
    dim_keys = list(dims.keys())

    emf_payload = {
        "_aws": {
            "Timestamp": int(time.time() * 1000),
            "CloudWatchMetrics": [
                {
                    "Namespace": namespace,
                    "Dimensions": [dim_keys] if dim_keys else [[]],
                    "Metrics": [
                        {"Name": metric_name, "Unit": unit},
                    ],
                }
            ],
        },
        metric_name: value,
        **dims,
    }

    # EMF: print to stdout, CloudWatch extracts metric automatically
    print(json.dumps(emf_payload))
