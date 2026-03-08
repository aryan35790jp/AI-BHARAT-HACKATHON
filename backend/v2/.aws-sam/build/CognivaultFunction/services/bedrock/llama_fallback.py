"""
Meta Llama 3.1 8B Instruct — Fallback model provider.

Architecture Decision:
  Llama 3.1 8B is the secondary fallback when the primary model fails.
  Lower quality but:
  - Cheaper (~60% lower cost)
  - Faster cold start
  - Higher availability (smaller model = more capacity)
  - Same API format as Llama 4 Maverick
  Used when primary returns 5xx, throttling, or timeout.
"""

import json
import logging
from typing import Any

from .base import BaseModelProvider

logger = logging.getLogger("cognivault.bedrock.llama_fallback")


class LlamaFallbackProvider(BaseModelProvider):
    """
    Meta Llama 3.1 8B Instruct via Amazon Bedrock.
    Same request/response format as Llama 4 Maverick.
    """

    @property
    def provider_name(self) -> str:
        return "llama31-8b-fallback"

    @property
    def cost_per_1k_input_tokens(self) -> float:
        # Bedrock on-demand pricing for Llama 3.1 8B (us-east-1)
        return 0.00030

    @property
    def cost_per_1k_output_tokens(self) -> float:
        return 0.00060

    def build_request_body(self, prompt: str) -> str:
        return json.dumps({
            "prompt": prompt,
            "max_gen_len": min(self.max_output_tokens, 1024),  # Smaller model, smaller output
            "temperature": 0.3,
            "top_p": 0.9,
        })

    def extract_text(self, response_body: dict) -> str:
        return response_body.get("generation", "")
