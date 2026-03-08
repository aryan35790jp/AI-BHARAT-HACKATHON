"""
Abstract base class for model providers.

Architecture Decision:
  Strategy Pattern — each model provider implements the same interface.
  The factory creates an ordered chain of providers. The analysis service
  tries each provider in order, falling back on failure.

  This decouples the analysis logic from the specific model API format.
  Adding a new model (e.g., Claude, Mistral) requires only:
  1. Create a new class extending BaseModelProvider
  2. Register it in the factory

  No changes to handlers, router, or analysis service.
"""

import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

logger = logging.getLogger("cognivault.bedrock.base")


class BaseModelProvider(ABC):
    """
    Abstract interface for AI model providers.
    Implementations handle model-specific request/response formats.
    """

    def __init__(self, model_id: str, bedrock_client: Any, max_output_tokens: int = 2048):
        self.model_id = model_id
        self.client = bedrock_client
        self.max_output_tokens = max_output_tokens

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider name for logging and metrics."""
        ...

    @property
    @abstractmethod
    def cost_per_1k_input_tokens(self) -> float:
        """USD cost per 1,000 input tokens. Used for cost tracking."""
        ...

    @property
    @abstractmethod
    def cost_per_1k_output_tokens(self) -> float:
        """USD cost per 1,000 output tokens. Used for cost tracking."""
        ...

    @abstractmethod
    def build_request_body(self, prompt: str) -> str:
        """
        Build the model-specific JSON request body.
        Returns a JSON string ready for invoke_model().
        """
        ...

    @abstractmethod
    def extract_text(self, response_body: dict) -> str:
        """
        Extract the generated text from the model-specific response.
        Returns the raw text string.
        """
        ...

    def invoke(self, prompt: str) -> Dict[str, Any]:
        """
        Invoke the model and return standardized result.

        Returns:
            {
                "text": "<raw generated text>",
                "model_id": "<model identifier>",
                "provider": "<provider name>",
                "latency_ms": <float>,
                "estimated_input_tokens": <int>,
                "estimated_output_tokens": <int>,
                "estimated_cost_usd": <float>,
            }

        Raises:
            Exception on any invocation failure (caught by fallback chain).
        """
        start = time.time()

        request_body = self.build_request_body(prompt)

        logger.info(
            "Invoking model: model_id=%s provider=%s prompt_chars=%d",
            self.model_id, self.provider_name, len(prompt),
        )

        response = self.client.invoke_model(
            modelId=self.model_id,
            contentType="application/json",
            accept="application/json",
            body=request_body,
        )

        response_body = json.loads(response["body"].read())
        text = self.extract_text(response_body).strip()
        elapsed_ms = (time.time() - start) * 1000

        # Estimate tokens (~1.3 tokens per word, ~4 chars per token)
        est_input_tokens = len(prompt) // 4
        est_output_tokens = len(text) // 4
        est_cost = (
            (est_input_tokens / 1000) * self.cost_per_1k_input_tokens
            + (est_output_tokens / 1000) * self.cost_per_1k_output_tokens
        )

        logger.info(
            "Model response: model_id=%s latency_ms=%.1f est_tokens_in=%d est_tokens_out=%d est_cost_usd=%.6f",
            self.model_id, elapsed_ms, est_input_tokens, est_output_tokens, est_cost,
        )

        return {
            "text": text,
            "model_id": self.model_id,
            "provider": self.provider_name,
            "latency_ms": elapsed_ms,
            "estimated_input_tokens": est_input_tokens,
            "estimated_output_tokens": est_output_tokens,
            "estimated_cost_usd": est_cost,
        }

    def estimate_input_tokens(self, prompt: str) -> int:
        """Approximate token count for cost guardrail pre-check."""
        return len(prompt) // 4
