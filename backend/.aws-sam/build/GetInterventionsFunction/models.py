from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class UnderstandingLevel(str, Enum):
    SURFACE = "surface"
    PARTIAL = "partial"
    SOLID = "solid"
    DEEP = "deep"


class DebtType(str, Enum):
    CIRCULAR = "circular"
    PARROTING = "parroting"
    LOGICAL_JUMP = "logical_jump"
    CONFIDENCE_MISMATCH = "confidence_mismatch"
    WRONG_REASONING = "wrong_reasoning"


class InterventionType(str, Enum):
    CLARIFICATION = "clarification"
    COUNTER_EXAMPLE = "counter_example"
    MENTAL_MODEL = "mental_model"
    AHA_BRIDGE = "aha_bridge"


class EvidenceType(str, Enum):
    EXPLANATION = "explanation"
    CODE = "code"
    QA_REASONING = "qa_reasoning"


class DebtIndicator(BaseModel):
    type: DebtType
    severity: float = Field(ge=0.0, le=1.0)
    evidence: str
    explanation: str


class InterventionContent(BaseModel):
    title: str
    explanation: str
    examples: list[str] = Field(default_factory=list)
    followUpQuestions: list[str] = Field(default_factory=list)


class MicroIntervention(BaseModel):
    id: str = Field(default_factory=lambda: f"int_{uuid.uuid4().hex[:12]}")
    type: InterventionType
    targetConcept: str
    content: InterventionContent


class ConceptUnderstanding(BaseModel):
    conceptId: str
    level: UnderstandingLevel = UnderstandingLevel.SURFACE
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    debtIndicators: list[DebtIndicator] = Field(default_factory=list)
    lastAssessed: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    evidenceCount: int = Field(ge=0, default=0)


class ConceptEdge(BaseModel):
    source: str
    target: str
    relationship: str = "prerequisite"


class MentalModelGraph(BaseModel):
    userId: str
    concepts: list[ConceptUnderstanding] = Field(default_factory=list)
    edges: list[ConceptEdge] = Field(default_factory=list)
    overallProgress: float = Field(ge=0.0, le=1.0, default=0.0)


class AnalyzeRequest(BaseModel):
    concept: str = Field(min_length=1, max_length=500)
    explanation: str = Field(min_length=1, max_length=10000)
    userId: str = Field(min_length=1, max_length=128)

    @field_validator("concept", "explanation", "userId")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()


class EvidenceSubmission(BaseModel):
    userId: str = Field(min_length=1, max_length=128)
    type: EvidenceType
    content: str = Field(min_length=1, max_length=50000)
    conceptId: Optional[str] = None

    @field_validator("userId", "content")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()


class AnalyzeResponse(BaseModel):
    conceptId: str
    understandingLevel: UnderstandingLevel
    confidence: float
    debtIndicators: list[DebtIndicator]
    microIntervention: Optional[MicroIntervention] = None


class EvidenceResponse(BaseModel):
    updatedModel: MentalModelGraph
    interventions: list[MicroIntervention] = Field(default_factory=list)


class BedrockAnalysisResult(BaseModel):
    understandingLevel: UnderstandingLevel
    confidence: float = Field(ge=0.0, le=1.0)
    debtIndicators: list[DebtIndicator] = Field(default_factory=list)
    interventionType: Optional[InterventionType] = None
    interventionContent: Optional[InterventionContent] = None
    relatedConcepts: list[str] = Field(default_factory=list)
    edges: list[ConceptEdge] = Field(default_factory=list)


DOMAIN_KNOWLEDGE: dict[str, list[str]] = {
    "variables": [],
    "data_types": ["variables"],
    "operators": ["variables", "data_types"],
    "strings": ["variables", "data_types"],
    "lists": ["variables", "data_types"],
    "dictionaries": ["variables", "data_types", "lists"],
    "tuples": ["variables", "data_types", "lists"],
    "sets": ["variables", "data_types", "lists"],
    "control_flow": ["variables", "operators"],
    "loops": ["control_flow", "lists"],
    "functions": ["variables", "control_flow"],
    "scope": ["variables", "functions"],
    "closures": ["functions", "scope"],
    "decorators": ["functions", "closures"],
    "generators": ["functions", "loops"],
    "iterators": ["loops", "functions"],
    "classes": ["functions", "variables", "data_types"],
    "inheritance": ["classes"],
    "polymorphism": ["classes", "inheritance"],
    "magic_methods": ["classes"],
    "exceptions": ["control_flow", "classes"],
    "modules": ["functions"],
    "file_io": ["strings", "exceptions"],
    "list_comprehensions": ["lists", "loops", "functions"],
    "lambda": ["functions"],
    "map_filter_reduce": ["functions", "lambda", "lists"],
    "recursion": ["functions", "control_flow"],
    "type_hints": ["variables", "functions", "data_types"],
    "dataclasses": ["classes", "type_hints"],
    "context_managers": ["classes", "exceptions"],
    "async_await": ["functions", "generators"],
    "numpy_basics": ["lists", "loops", "operators"],
    "pandas_basics": ["dictionaries", "numpy_basics"],
    "matplotlib_basics": ["numpy_basics", "lists"],
    "linear_algebra": ["numpy_basics", "operators"],
    "statistics_basics": ["numpy_basics"],
    "supervised_learning": ["statistics_basics", "linear_algebra", "numpy_basics"],
    "linear_regression": ["supervised_learning", "linear_algebra"],
    "logistic_regression": ["supervised_learning", "statistics_basics"],
    "decision_trees": ["supervised_learning"],
    "neural_networks": ["linear_algebra", "supervised_learning"],
    "gradient_descent": ["neural_networks", "linear_algebra"],
    "backpropagation": ["neural_networks", "gradient_descent"],
    "overfitting": ["supervised_learning", "statistics_basics"],
    "cross_validation": ["supervised_learning", "overfitting"],
    "feature_engineering": ["pandas_basics", "supervised_learning"],
    "unsupervised_learning": ["statistics_basics", "numpy_basics"],
    "clustering": ["unsupervised_learning", "linear_algebra"],
    "dimensionality_reduction": ["unsupervised_learning", "linear_algebra"],
}


def get_prerequisites(concept: str) -> list[str]:
    normalized = concept.lower().replace(" ", "_").replace("-", "_")
    return DOMAIN_KNOWLEDGE.get(normalized, [])


def get_domain_edges_for_concept(concept: str) -> list[ConceptEdge]:
    normalized = concept.lower().replace(" ", "_").replace("-", "_")
    prereqs = DOMAIN_KNOWLEDGE.get(normalized, [])
    return [
        ConceptEdge(source=prereq, target=normalized, relationship="prerequisite")
        for prereq in prereqs
    ]
