"""
Model factory and fallback chain builder.

Architecture Decision:
  The factory creates an ordered list of model providers.
  The analysis service iterates through the chain:
    1. Try primary (Llama 4 Maverick)
    2. On failure → try fallback (Llama 3.1 8B)
    3. On failure → rule-based fallback (no model call)

  This pattern ensures the API ALWAYS returns a result, even when
  all Bedrock models are down. Critical for hackathon demos and
  production reliability.

  Adding a new model:
    1. Create a new provider class extending BaseModelProvider
    2. Add it to _PROVIDER_REGISTRY
    3. Configure the model_id in settings
  No other code changes needed.
"""

import logging
from typing import Any, List

import boto3

from config.settings import Settings
from .base import BaseModelProvider
from .llama_primary import LlamaPrimaryProvider
from .llama_fallback import LlamaFallbackProvider

logger = logging.getLogger("cognivault.bedrock.factory")


class ModelFactory:
    """Factory for creating model provider instances."""

    # Registry of provider classes by substring match.
    # Supports both raw model IDs ("meta.llama4-maverick...") and
    # inference profile ARNs ("arn:aws:bedrock:...us.meta.llama4-maverick...").
    _PROVIDER_REGISTRY = [
        ("llama4", LlamaPrimaryProvider),
        ("llama3", LlamaFallbackProvider),
    ]

    @classmethod
    def create(
        cls,
        model_id: str,
        bedrock_client: Any,
        max_output_tokens: int = 2048,
    ) -> BaseModelProvider:
        """
        Create a model provider for the given model ID or inference profile ARN.
        Matches by substring to handle both raw IDs and ARN formats.
        The model_id is passed through as-is to invoke_model (no transformation).
        """
        model_id_lower = model_id.lower()
        for keyword, provider_cls in cls._PROVIDER_REGISTRY:
            if keyword in model_id_lower:
                return provider_cls(
                    model_id=model_id,
                    bedrock_client=bedrock_client,
                    max_output_tokens=max_output_tokens,
                )

        # Default: treat unknown models as Llama-format (prompt/generation)
        logger.warning(
            "Unknown model ID '%s', using LlamaPrimaryProvider as default", model_id
        )
        return LlamaPrimaryProvider(
            model_id=model_id,
            bedrock_client=bedrock_client,
            max_output_tokens=max_output_tokens,
        )


def get_model_chain(settings: Settings) -> List[BaseModelProvider]:
    """
    Build the ordered fallback chain of model providers.
    Returns a list where index 0 = primary, index 1 = fallback, etc.

    Architecture Decision:
      The chain is built once per cold start and reused.
      The Bedrock client is shared across providers (connection pooling).
    """
    bedrock_client = boto3.client(
        "bedrock-runtime",
        region_name=settings.bedrock_region,
    )

    chain = []

    # Primary model — MUST be configured via env var
    if not settings.primary_model_id:
        raise RuntimeError(
            "PRIMARY_MODEL_ID (or BEDROCK_MODEL_ID) environment variable is required. "
            "Set it to a model ID or inference profile ARN."
        )

    primary = ModelFactory.create(
        model_id=settings.primary_model_id,
        bedrock_client=bedrock_client,
        max_output_tokens=settings.max_output_tokens,
    )
    chain.append(primary)
    logger.info("Primary model: %s (%s)", primary.model_id, primary.provider_name)

    # Fallback model (if enabled, configured, and different from primary)
    if (
        settings.enable_fallback_model
        and settings.fallback_model_id
        and settings.fallback_model_id != settings.primary_model_id
    ):
        fallback = ModelFactory.create(
            model_id=settings.fallback_model_id,
            bedrock_client=bedrock_client,
            max_output_tokens=settings.max_output_tokens,
        )
        chain.append(fallback)
        logger.info("Fallback model: %s (%s)", fallback.model_id, fallback.provider_name)

    return chain
