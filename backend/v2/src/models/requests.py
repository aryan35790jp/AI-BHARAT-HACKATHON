"""
Request validation models.

Architecture Decision:
  Validation is performed at the handler layer BEFORE any service call.
  This prevents wasted Bedrock invocations on invalid input.
  Using plain dataclasses (no Pydantic) to keep the Lambda package
  zero-dependency beyond boto3.
"""

from dataclasses import dataclass, field
from typing import List, Optional

from config.constants import VALID_EVIDENCE_TYPES


@dataclass
class AnalyzeRequest:
    """POST /v1/analyze request body."""
    concept: str = ""
    explanation: str = ""
    userId: str = ""

    def validate(self) -> List[str]:
        errors = []

        if not isinstance(self.concept, str) or not self.concept.strip():
            errors.append("concept is required and must be a non-empty string")
        elif len(self.concept) > 500:
            errors.append("concept must be 500 characters or less")

        if not isinstance(self.explanation, str) or not self.explanation.strip():
            errors.append("explanation is required and must be a non-empty string")
        elif len(self.explanation) > 10000:
            errors.append("explanation must be 10000 characters or less")

        if not isinstance(self.userId, str) or not self.userId.strip():
            errors.append("userId is required and must be a non-empty string")
        elif len(self.userId) > 128:
            errors.append("userId must be 128 characters or less")

        return errors

    @classmethod
    def from_dict(cls, data: dict) -> "AnalyzeRequest":
        return cls(
            concept=data.get("concept", ""),
            explanation=data.get("explanation", ""),
            userId=data.get("userId", ""),
        )


@dataclass
class EvidenceRequest:
    """POST /v1/evidence request body."""
    userId: str = ""
    type: str = ""
    content: str = ""
    conceptId: str = "general"

    def validate(self) -> List[str]:
        errors = []

        if not isinstance(self.userId, str) or not self.userId.strip():
            errors.append("userId is required")
        elif len(self.userId) > 128:
            errors.append("userId must be 128 characters or less")

        if self.type not in VALID_EVIDENCE_TYPES:
            errors.append(
                f"type must be one of: {', '.join(sorted(VALID_EVIDENCE_TYPES))}"
            )

        if not isinstance(self.content, str) or not self.content.strip():
            errors.append("content is required")
        elif len(self.content) > 50000:
            errors.append("content must be 50000 characters or less")

        return errors

    @classmethod
    def from_dict(cls, data: dict) -> "EvidenceRequest":
        return cls(
            userId=data.get("userId", ""),
            type=data.get("type", ""),
            content=data.get("content", ""),
            conceptId=data.get("conceptId", "general") or "general",
        )
