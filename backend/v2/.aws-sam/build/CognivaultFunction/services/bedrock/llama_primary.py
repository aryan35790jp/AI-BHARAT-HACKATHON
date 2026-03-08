"""
Meta Llama 4 Maverick — Primary model provider.

Architecture Decision:
  Llama 4 Maverick 17B is the primary model for analysis.
  Best quality results for cognitive debt detection.
  Cost: ~$0.00195/1K input, ~$0.00260/1K output (Bedrock on-demand pricing).
  Latency: ~2-8 seconds depending on prompt size.
"""

import json
import logging
from typing import Any

from .base import BaseModelProvider

logger = logging.getLogger("cognivault.bedrock.llama_primary")


class LlamaPrimaryProvider(BaseModelProvider):
    """
    Meta Llama 4 Maverick 17B Instruct via Amazon Bedrock.
    Request format: { prompt, max_gen_len, temperature, top_p }
    Response format: { generation, prompt_token_count, generation_token_count, stop_reason }
    """

    @property
    def provider_name(self) -> str:
        return "llama4-maverick-primary"

    @property
    def cost_per_1k_input_tokens(self) -> float:
        # Bedrock on-demand pricing for Llama 4 Maverick (us-east-1)
        return 0.00195

    @property
    def cost_per_1k_output_tokens(self) -> float:
        return 0.00260

    def build_request_body(self, prompt: str) -> str:
        return json.dumps({
            "prompt": prompt,
            "max_gen_len": self.max_output_tokens,
            "temperature": 0.3,
            "top_p": 0.9,
        })

    def extract_text(self, response_body: dict) -> str:
        return response_body.get("generation", "")
