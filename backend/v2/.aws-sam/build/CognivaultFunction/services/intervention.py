"""
Intervention builder service.

Architecture Decision:
  Interventions are built from analysis results.
  Each intervention is a self-contained actionable item for the student.
  The builder is separate from analysis so interventions can be
  created/updated independently (e.g., when new evidence changes the model).
"""

import uuid
import logging
from typing import Optional

from models.domain import AnalysisResult, Intervention, InterventionContent

logger = logging.getLogger("cognivault.services.intervention")


def _uuid() -> str:
    return uuid.uuid4().hex[:12]


def build_intervention(
    concept_id: str, result: AnalysisResult
) -> Optional[Intervention]:
    """
    Build an intervention from an analysis result.
    Returns None if the student's understanding is solid/deep with no debt.
    """
    if not result.interventionType or not result.interventionContent:
        logger.debug("No intervention needed for concept=%s (level=%s)", concept_id, result.understandingLevel)
        return None

    intervention = Intervention(
        id=f"int_{_uuid()}",
        type=result.interventionType,
        targetConcept=concept_id,
        content=result.interventionContent,
    )

    logger.info(
        "Built intervention: id=%s type=%s concept=%s",
        intervention.id, intervention.type, concept_id,
    )
    return intervention
