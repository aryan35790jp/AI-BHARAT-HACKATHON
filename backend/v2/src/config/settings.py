"""
Centralized configuration module.

Architecture Decision:
  All configuration is loaded once from environment variables at module init.
  Settings are immutable after creation. For multi-environment support,
  deploy with different env vars per stage (dev/staging/prod).
  Parameter Store integration is ready — just set USE_PARAMETER_STORE=true
  and provide the SSM prefix.

Cost Decision:
  Parameter Store calls are cached for the Lambda lifetime (warm start).
  GetParameter costs $0.05 per 10,000 calls — negligible at 100k users.
"""

import os
import json
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("cognivault.config")


@dataclass(frozen=True)
class Settings:
    """Immutable application settings. Loaded once per Lambda cold start."""

    # ----- Environment -----
    environment: str = "dev"  # dev | staging | prod

    # ----- DynamoDB -----
    table_name: str = "cognivault-data"
    dynamodb_region: str = "us-east-1"
    # Architecture Decision: On-demand billing avoids capacity planning.
    # Switch to provisioned only if sustained >1000 WCU at lower cost.
    evidence_ttl_days: int = 90  # TTL for old evidence records
    snapshot_ttl_days: int = 365  # TTL for model snapshots
    use_strong_consistency: bool = False  # True only for critical reads

    # ----- Bedrock Models -----
    # Architecture Decision: Strategy pattern with ordered fallback chain.
    # Primary = best quality, fallback = cheaper/faster, last resort = rule-based.
    # Values MUST come from environment variables (inference profile ARNs or model IDs).
    # No hardcoded defaults — empty string means "not configured".
    primary_model_id: str = ""
    fallback_model_id: str = ""
    bedrock_region: str = "us-east-1"
    bedrock_timeout: int = 45  # seconds
    bedrock_max_retries: int = 2

    # ----- Cost Guardrails -----
    # Architecture Decision: Hard limits prevent runaway Bedrock costs.
    # At $0.00195/1K input tokens (Llama 4 Maverick), 100k requests/day
    # with 2K tokens avg = ~$390/day. Budget alarm at $50/day recommended.
    max_input_tokens: int = 4096
    max_output_tokens: int = 2048
    max_explanation_chars: int = 10000
    max_request_size_bytes: int = 65536  # 64KB
    enable_cost_tracking: bool = True
    daily_budget_usd: float = 50.0

    # ----- Rate Limiting -----
    # Architecture Decision: Token-bucket per userId stored in DynamoDB.
    # WAF rate limiting is preferred at API Gateway level (see NEXT_STEPS).
    # This is a defense-in-depth application-layer limit.
    rate_limit_per_minute: int = 30
    rate_limit_burst: int = 10
    enable_rate_limiting: bool = True

    # ----- Authentication -----
    # Architecture Decision: Cognito JWT validation. Disabled in dev for
    # easy testing. In prod, every request MUST have a valid JWT.
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""
    cognito_region: str = "us-east-1"
    require_auth: bool = False  # Set True in staging/prod

    # ----- Observability -----
    log_level: str = "INFO"
    enable_metrics: bool = True
    metrics_namespace: str = "Cognivault"

    # ----- CORS -----
    allowed_origins: str = "*"  # Restrict in prod: "https://cognivault.example.com"
    allowed_headers: str = "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Correlation-Id"
    allowed_methods: str = "GET,POST,PUT,DELETE,OPTIONS"

    # ----- Feature Flags -----
    enable_fallback_model: bool = True
    enable_rule_based_fallback: bool = True  # Last-resort when all models fail


# ---------------------------------------------------------------------------
# Singleton loader
# ---------------------------------------------------------------------------
_settings_cache: Optional[Settings] = None


def _load_from_parameter_store(prefix: str) -> dict:
    """
    Load config overrides from AWS Systems Manager Parameter Store.
    Uses a single GetParametersByPath call to minimize API calls.
    """
    import boto3
    ssm = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    params = {}
    try:
        paginator = ssm.get_paginator("get_parameters_by_path")
        for page in paginator.paginate(
            Path=prefix, Recursive=True, WithDecryption=True
        ):
            for param in page["Parameters"]:
                # /cognivault/prod/table_name → table_name
                key = param["Name"].split("/")[-1]
                params[key] = param["Value"]
        logger.info("Loaded %d parameters from SSM prefix %s", len(params), prefix)
    except Exception as exc:
        logger.warning("Parameter Store load failed (using env vars): %s", exc)
    return params


def get_settings() -> Settings:
    """
    Return cached Settings instance. Loaded once per cold start.
    Priority: Parameter Store > Environment Variables > Defaults
    """
    global _settings_cache
    if _settings_cache is not None:
        return _settings_cache

    overrides = {}

    # Load from Parameter Store if enabled
    use_ssm = os.environ.get("USE_PARAMETER_STORE", "false").lower() == "true"
    ssm_prefix = os.environ.get("SSM_PREFIX", "")
    if use_ssm and ssm_prefix:
        overrides = _load_from_parameter_store(ssm_prefix)

    # Environment variables (override SSM values)
    env_mapping = {
        "ENVIRONMENT": "environment",
        "TABLE_NAME": "table_name",
        "DYNAMODB_REGION": "dynamodb_region",
        "EVIDENCE_TTL_DAYS": "evidence_ttl_days",
        "SNAPSHOT_TTL_DAYS": "snapshot_ttl_days",
        "USE_STRONG_CONSISTENCY": "use_strong_consistency",
        "PRIMARY_MODEL_ID": "primary_model_id",
        "FALLBACK_MODEL_ID": "fallback_model_id",
        "BEDROCK_MODEL_ID": "primary_model_id",
        "BEDROCK_FALLBACK_MODEL_ID": "fallback_model_id",
        "BEDROCK_REGION": "bedrock_region",
        "BEDROCK_TIMEOUT": "bedrock_timeout",
        "BEDROCK_MAX_RETRIES": "bedrock_max_retries",
        "MAX_INPUT_TOKENS": "max_input_tokens",
        "MAX_OUTPUT_TOKENS": "max_output_tokens",
        "MAX_EXPLANATION_CHARS": "max_explanation_chars",
        "MAX_REQUEST_SIZE_BYTES": "max_request_size_bytes",
        "ENABLE_COST_TRACKING": "enable_cost_tracking",
        "DAILY_BUDGET_USD": "daily_budget_usd",
        "RATE_LIMIT_PER_MINUTE": "rate_limit_per_minute",
        "RATE_LIMIT_BURST": "rate_limit_burst",
        "ENABLE_RATE_LIMITING": "enable_rate_limiting",
        "COGNITO_USER_POOL_ID": "cognito_user_pool_id",
        "COGNITO_APP_CLIENT_ID": "cognito_app_client_id",
        "COGNITO_REGION": "cognito_region",
        "REQUIRE_AUTH": "require_auth",
        "LOG_LEVEL": "log_level",
        "ENABLE_METRICS": "enable_metrics",
        "METRICS_NAMESPACE": "metrics_namespace",
        "ALLOWED_ORIGINS": "allowed_origins",
        "ALLOWED_HEADERS": "allowed_headers",
        "ALLOWED_METHODS": "allowed_methods",
        "ENABLE_FALLBACK_MODEL": "enable_fallback_model",
        "ENABLE_RULE_BASED_FALLBACK": "enable_rule_based_fallback",
    }

    for env_key, setting_key in env_mapping.items():
        val = os.environ.get(env_key)
        if val is not None:
            overrides[setting_key] = val

    # Type coercion
    bool_fields = {
        "use_strong_consistency", "enable_cost_tracking", "enable_rate_limiting",
        "require_auth", "enable_metrics", "enable_fallback_model",
        "enable_rule_based_fallback",
    }
    int_fields = {
        "evidence_ttl_days", "snapshot_ttl_days", "max_input_tokens",
        "max_output_tokens", "max_explanation_chars", "max_request_size_bytes",
        "bedrock_timeout", "bedrock_max_retries", "rate_limit_per_minute",
        "rate_limit_burst",
    }
    float_fields = {"daily_budget_usd"}

    coerced = {}
    for key, val in overrides.items():
        if key in bool_fields:
            coerced[key] = str(val).lower() in ("true", "1", "yes")
        elif key in int_fields:
            try:
                coerced[key] = int(val)
            except (ValueError, TypeError):
                pass
        elif key in float_fields:
            try:
                coerced[key] = float(val)
            except (ValueError, TypeError):
                pass
        else:
            coerced[key] = val

    _settings_cache = Settings(**coerced)
    logger.info(
        "Settings loaded: env=%s, table=%s, primary_model=%s, require_auth=%s",
        _settings_cache.environment,
        _settings_cache.table_name,
        _settings_cache.primary_model_id,
        _settings_cache.require_auth,
    )
    return _settings_cache


def reset_settings():
    """Reset cache. Used in tests only."""
    global _settings_cache
    _settings_cache = None
