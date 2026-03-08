"""
Cost guardrails middleware.

Architecture Decision:
  Three layers of cost protection:
  1. Input guardrails — reject oversized requests before model call
  2. Token budget — track estimated tokens, enforce max per request
  3. Daily budget — track cumulative daily spend, pause if exceeded

  These prevent:
  - Accidental cost spikes from long explanations
  - Malicious abuse (sending huge payloads to inflate model costs)
  - Runaway costs if a bug causes repeated invocations

  At $0.00195/1K input tokens (Llama 4 Maverick):
  - 10,000 chars ≈ 2,500 tokens ≈ $0.005 per request
  - 100k requests/day ≈ $500/day (with daily_budget_usd=50, we'd stop at 10k)
"""

import logging
from typing import Optional

from config.settings import Settings
from errors import PayloadTooLargeError, BudgetExceededError
from repository.dynamodb import DynamoDBRepository

logger = logging.getLogger("cognivault.middleware.cost_guard")


class CostGuard:
    """Enforce cost guardrails on incoming requests."""

    def __init__(self, settings: Settings, repository: Optional[DynamoDBRepository] = None):
        self.settings = settings
        self.repository = repository

    def check_request_size(self, body_str: str) -> None:
        """
        Reject requests that exceed the max request size.
        Called BEFORE JSON parsing to prevent memory abuse.
        """
        if len(body_str) > self.settings.max_request_size_bytes:
            logger.warning(
                "Request too large: size=%d max=%d",
                len(body_str), self.settings.max_request_size_bytes,
            )
            raise PayloadTooLargeError(self.settings.max_request_size_bytes)

    def check_daily_budget(self) -> None:
        """
        Check if daily spending has exceeded the budget.
        Raises BudgetExceededError if so.

        Architecture Decision: This adds one DynamoDB read per
        analysis request. At $0.25/1M reads (on-demand), this is
        negligible (~$0.025/day at 100k requests).
        We only check this on write endpoints (/analyze, /evidence).
        """
        if not self.settings.enable_cost_tracking:
            return
        if not self.repository:
            return

        try:
            daily_cost = self.repository.get_daily_cost()
            if daily_cost >= self.settings.daily_budget_usd:
                logger.error(
                    "Daily budget exceeded: spent=%.4f budget=%.2f",
                    daily_cost, self.settings.daily_budget_usd,
                )
                raise BudgetExceededError()
            if daily_cost >= self.settings.daily_budget_usd * 0.8:
                logger.warning(
                    "Approaching daily budget: spent=%.4f budget=%.2f (%.0f%%)",
                    daily_cost, self.settings.daily_budget_usd,
                    (daily_cost / self.settings.daily_budget_usd) * 100,
                )
        except BudgetExceededError:
            raise
        except Exception as exc:
            # Fail open — don't block users on cost tracking failures
            logger.warning("Budget check failed (allowing request): %s", exc)

    def record_invocation(
        self,
        user_id: str,
        model_id: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        latency_ms: float,
    ) -> None:
        """Record a model invocation for cost tracking."""
        if not self.settings.enable_cost_tracking:
            return
        if not self.repository:
            return

        try:
            self.repository.record_model_invocation(
                user_id=user_id,
                model_id=model_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=cost_usd,
                latency_ms=latency_ms,
            )
        except Exception as exc:
            logger.warning("Cost recording failed (non-critical): %s", exc)
