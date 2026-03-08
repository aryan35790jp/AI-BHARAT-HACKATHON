"""
Domain models — pure data structures representing business entities.

Architecture Decision:
  These are plain dataclasses with no framework dependency.
  They represent the canonical shape of data flowing through the system.
  DynamoDB items are mapped to/from these in the repository layer.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class DebtIndicator:
    type: str  # circular | parroting | logical_jump | confidence_mismatch | wrong_reasoning
    severity: float  # 0.0 - 1.0
    evidence: str
    explanation: str

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "severity": self.severity,
            "evidence": self.evidence,
            "explanation": self.explanation,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DebtIndicator":
        return cls(
            type=d.get("type", ""),
            severity=float(d.get("severity", 0.5)),
            evidence=str(d.get("evidence", "")),
            explanation=str(d.get("explanation", "")),
        )


@dataclass
class InterventionContent:
    title: str
    explanation: str
    examples: List[str] = field(default_factory=list)
    followUpQuestions: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "explanation": self.explanation,
            "examples": self.examples,
            "followUpQuestions": self.followUpQuestions,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "InterventionContent":
        return cls(
            title=str(d.get("title", "")),
            explanation=str(d.get("explanation", "")),
            examples=[str(e) for e in d.get("examples", [])],
            followUpQuestions=[str(q) for q in d.get("followUpQuestions", [])],
        )


@dataclass
class Edge:
    source: str
    target: str
    relationship: str = "prerequisite"

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "target": self.target,
            "relationship": self.relationship,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Edge":
        return cls(
            source=str(d.get("source", "")),
            target=str(d.get("target", "")),
            relationship=str(d.get("relationship", "prerequisite")),
        )


@dataclass
class AnalysisResult:
    """Output from Bedrock analysis or rule-based fallback."""
    understandingLevel: str  # unknown | surface | partial | solid | deep
    confidence: float  # 0.0 - 1.0
    debtIndicators: List[DebtIndicator] = field(default_factory=list)
    interventionType: Optional[str] = None
    interventionContent: Optional[InterventionContent] = None
    missingConcepts: List[str] = field(default_factory=list)
    suggestedExplanation: Optional[str] = None
    nextQuestion: Optional[str] = None
    relatedConcepts: List[str] = field(default_factory=list)
    prerequisites: List[str] = field(default_factory=list)
    edges: List[Edge] = field(default_factory=list)
    modelUsed: str = ""  # Which model produced this result
    latencyMs: float = 0.0  # Model invocation latency
    estimatedCostUsd: float = 0.0  # Estimated cost of this call

    def to_dict(self) -> dict:
        result = {
            "understandingLevel": self.understandingLevel,
            "confidence": self.confidence,
            "debtIndicators": [d.to_dict() for d in self.debtIndicators],
            "interventionType": self.interventionType,
            "interventionContent": self.interventionContent.to_dict() if self.interventionContent else None,
            "missingConcepts": self.missingConcepts,
            "suggestedExplanation": self.suggestedExplanation,
            "nextQuestion": self.nextQuestion,
            "relatedConcepts": self.relatedConcepts,
            "prerequisites": self.prerequisites,
            "edges": [e.to_dict() for e in self.edges],
            "modelUsed": self.modelUsed,
            "latencyMs": self.latencyMs,
        }
        return result

    @classmethod
    def from_dict(cls, d: dict) -> "AnalysisResult":
        return cls(
            understandingLevel=d.get("understandingLevel", "unknown"),
            confidence=float(d.get("confidence", 0.0)),
            debtIndicators=[DebtIndicator.from_dict(x) for x in d.get("debtIndicators", [])],
            interventionType=d.get("interventionType"),
            interventionContent=(
                InterventionContent.from_dict(d["interventionContent"])
                if d.get("interventionContent")
                else None
            ),
            missingConcepts=[str(c) for c in d.get("missingConcepts", [])],
            suggestedExplanation=d.get("suggestedExplanation"),
            nextQuestion=d.get("nextQuestion"),
            relatedConcepts=d.get("relatedConcepts", []),
            prerequisites=d.get("prerequisites", []),
            edges=[Edge.from_dict(x) for x in d.get("edges", [])],
            modelUsed=d.get("modelUsed", ""),
            latencyMs=float(d.get("latencyMs", 0)),
        )


@dataclass
class Intervention:
    id: str
    type: str
    targetConcept: str
    content: InterventionContent

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "targetConcept": self.targetConcept,
            "content": self.content.to_dict(),
        }


@dataclass
class ConceptNode:
    conceptId: str
    level: str = "surface"
    confidence: float = 0.0
    debtIndicators: List[dict] = field(default_factory=list)
    lastAssessed: str = ""
    evidenceCount: int = 0

    def to_dict(self) -> dict:
        return {
            "conceptId": self.conceptId,
            "level": self.level,
            "confidence": self.confidence,
            "debtIndicators": self.debtIndicators,
            "lastAssessed": self.lastAssessed,
            "evidenceCount": self.evidenceCount,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ConceptNode":
        return cls(
            conceptId=d.get("conceptId", ""),
            level=d.get("level", "surface"),
            confidence=float(d.get("confidence", 0)),
            debtIndicators=d.get("debtIndicators", []),
            lastAssessed=d.get("lastAssessed", ""),
            evidenceCount=int(d.get("evidenceCount", 0)),
        )


@dataclass
class MentalModel:
    userId: str
    concepts: List[ConceptNode] = field(default_factory=list)
    edges: List[Edge] = field(default_factory=list)
    overallProgress: float = 0.0

    def to_dict(self) -> dict:
        return {
            "userId": self.userId,
            "concepts": [c.to_dict() for c in self.concepts],
            "edges": [e.to_dict() for e in self.edges],
            "overallProgress": self.overallProgress,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "MentalModel":
        return cls(
            userId=d.get("userId", ""),
            concepts=[ConceptNode.from_dict(c) for c in d.get("concepts", [])],
            edges=[Edge.from_dict(e) for e in d.get("edges", [])],
            overallProgress=float(d.get("overallProgress", 0)),
        )
