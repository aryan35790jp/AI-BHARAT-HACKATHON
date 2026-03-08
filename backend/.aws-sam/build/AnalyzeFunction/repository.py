from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError

from models import (
    ConceptEdge,
    ConceptUnderstanding,
    DebtIndicator,
    MentalModelGraph,
    MicroIntervention,
    UnderstandingLevel,
)

logger = logging.getLogger(__name__)

TABLE_NAME = os.environ.get("TABLE_NAME", "cognivault-data")


def _get_table() -> boto3.resource:
    dynamodb = boto3.resource("dynamodb")
    return dynamodb.Table(TABLE_NAME)


def get_mental_model(user_id: str) -> Optional[MentalModelGraph]:
    table = _get_table()
    try:
        response = table.get_item(
            Key={"PK": f"USER#{user_id}", "SK": "MODEL#current"}
        )
    except ClientError as exc:
        logger.error("DynamoDB get_item failed for user %s: %s", user_id, exc)
        raise

    item = response.get("Item")
    if not item:
        return None

    concepts = [
        ConceptUnderstanding(
            conceptId=c["conceptId"],
            level=UnderstandingLevel(c["level"]),
            confidence=float(c["confidence"]),
            debtIndicators=[
                DebtIndicator(**d) for d in c.get("debtIndicators", [])
            ],
            lastAssessed=c.get("lastAssessed", ""),
            evidenceCount=int(c.get("evidenceCount", 0)),
        )
        for c in json.loads(item.get("concepts", "[]"))
    ]

    edges = [
        ConceptEdge(**e) for e in json.loads(item.get("edges", "[]"))
    ]

    return MentalModelGraph(
        userId=user_id,
        concepts=concepts,
        edges=edges,
        overallProgress=float(item.get("overallProgress", 0.0)),
    )


def save_mental_model(model: MentalModelGraph) -> None:
    table = _get_table()
    now = datetime.now(timezone.utc).isoformat()

    concepts_data = [c.model_dump() for c in model.concepts]
    edges_data = [e.model_dump() for e in model.edges]

    item = {
        "PK": f"USER#{model.userId}",
        "SK": "MODEL#current",
        "GSI1PK": "MODELS",
        "GSI1SK": f"USER#{model.userId}",
        "userId": model.userId,
        "concepts": json.dumps(concepts_data, default=str),
        "edges": json.dumps(edges_data, default=str),
        "overallProgress": str(model.overallProgress),
        "updatedAt": now,
    }

    try:
        table.put_item(Item=item)
    except ClientError as exc:
        logger.error("DynamoDB put_item failed for user %s: %s", model.userId, exc)
        raise

    _save_model_snapshot(model, now)


def _save_model_snapshot(model: MentalModelGraph, timestamp: str) -> None:
    table = _get_table()
    concepts_data = [c.model_dump() for c in model.concepts]
    edges_data = [e.model_dump() for e in model.edges]

    snapshot_item = {
        "PK": f"USER#{model.userId}",
        "SK": f"MODEL#snapshot#{timestamp}",
        "GSI1PK": f"HISTORY#{model.userId}",
        "GSI1SK": timestamp,
        "concepts": json.dumps(concepts_data, default=str),
        "edges": json.dumps(edges_data, default=str),
        "overallProgress": str(model.overallProgress),
        "createdAt": timestamp,
    }

    try:
        table.put_item(Item=snapshot_item)
    except ClientError as exc:
        logger.warning("Failed to save snapshot for user %s: %s", model.userId, exc)


def save_evidence(
    user_id: str,
    evidence_type: str,
    content: str,
    concept_id: Optional[str],
    analysis_result: Optional[dict[str, object]],
) -> str:
    table = _get_table()
    now = datetime.now(timezone.utc).isoformat()
    evidence_id = f"{now}#{evidence_type}"

    item: dict[str, object] = {
        "PK": f"USER#{user_id}",
        "SK": f"EVIDENCE#{evidence_id}",
        "GSI1PK": f"CONCEPT#{concept_id}" if concept_id else "CONCEPT#unknown",
        "GSI1SK": f"USER#{user_id}#{now}",
        "userId": user_id,
        "evidenceType": evidence_type,
        "content": content[:10000],
        "conceptId": concept_id or "unknown",
        "analysisResult": json.dumps(analysis_result, default=str) if analysis_result else None,
        "createdAt": now,
    }

    try:
        table.put_item(Item=item)
    except ClientError as exc:
        logger.error("Failed to save evidence for user %s: %s", user_id, exc)
        raise

    return evidence_id


def save_intervention(
    user_id: str,
    concept_id: str,
    intervention: MicroIntervention,
) -> None:
    table = _get_table()
    now = datetime.now(timezone.utc).isoformat()

    item = {
        "PK": f"USER#{user_id}",
        "SK": f"INTERVENTION#{intervention.id}",
        "GSI1PK": f"CONCEPT#{concept_id}",
        "GSI1SK": f"INTERVENTION#{now}",
        "userId": user_id,
        "conceptId": concept_id,
        "interventionData": json.dumps(intervention.model_dump(), default=str),
        "status": "pending",
        "createdAt": now,
    }

    try:
        table.put_item(Item=item)
    except ClientError as exc:
        logger.warning("Failed to save intervention for user %s: %s", user_id, exc)


def get_interventions_for_concept(
    user_id: str, concept_id: str
) -> list[MicroIntervention]:
    table = _get_table()

    try:
        response = table.query(
            IndexName="GSI1",
            KeyConditionExpression="GSI1PK = :pk AND begins_with(GSI1SK, :prefix)",
            FilterExpression="userId = :uid AND #st = :status",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={
                ":pk": f"CONCEPT#{concept_id}",
                ":prefix": "INTERVENTION#",
                ":uid": user_id,
                ":status": "pending",
            },
            ScanIndexForward=False,
            Limit=10,
        )
    except ClientError as exc:
        logger.error(
            "Failed to query interventions for user %s concept %s: %s",
            user_id,
            concept_id,
            exc,
        )
        raise

    interventions: list[MicroIntervention] = []
    for item in response.get("Items", []):
        raw = item.get("interventionData")
        if raw:
            data = json.loads(raw)
            interventions.append(MicroIntervention(**data))

    return interventions


def mark_intervention_complete(user_id: str, intervention_id: str) -> None:
    table = _get_table()

    try:
        table.update_item(
            Key={
                "PK": f"USER#{user_id}",
                "SK": f"INTERVENTION#{intervention_id}",
            },
            UpdateExpression="SET #st = :status, completedAt = :ts",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={
                ":status": "completed",
                ":ts": datetime.now(timezone.utc).isoformat(),
            },
        )
    except ClientError as exc:
        logger.warning(
            "Failed to mark intervention %s complete: %s", intervention_id, exc
        )


def update_concept_understood(
    user_id: str, concept_id: str
) -> Optional[MentalModelGraph]:
    model = get_mental_model(user_id)
    if model is None:
        return None

    updated = False
    for concept in model.concepts:
        if concept.conceptId == concept_id:
            concept.level = UnderstandingLevel.SOLID
            concept.confidence = min(concept.confidence + 0.25, 1.0)
            concept.debtIndicators = []
            concept.lastAssessed = datetime.now(timezone.utc).isoformat()
            updated = True
            break

    if not updated:
        return model

    model.overallProgress = _calc_progress(model.concepts)
    save_mental_model(model)

    interventions = get_interventions_for_concept(user_id, concept_id)
    for intervention in interventions:
        mark_intervention_complete(user_id, intervention.id)

    return model


def update_model_with_analysis(
    user_id: str,
    concept_id: str,
    level: UnderstandingLevel,
    confidence: float,
    debt_indicators: list[DebtIndicator],
    new_edges: list[ConceptEdge],
) -> MentalModelGraph:
    model = get_mental_model(user_id)
    if model is None:
        model = MentalModelGraph(userId=user_id)

    now = datetime.now(timezone.utc).isoformat()

    existing_concept = None
    for c in model.concepts:
        if c.conceptId == concept_id:
            existing_concept = c
            break

    if existing_concept is not None:
        existing_concept.level = level
        existing_concept.confidence = confidence
        existing_concept.debtIndicators = debt_indicators
        existing_concept.lastAssessed = now
        existing_concept.evidenceCount += 1
    else:
        model.concepts.append(
            ConceptUnderstanding(
                conceptId=concept_id,
                level=level,
                confidence=confidence,
                debtIndicators=debt_indicators,
                lastAssessed=now,
                evidenceCount=1,
            )
        )

    existing_edge_set = {(e.source, e.target) for e in model.edges}
    for edge in new_edges:
        if (edge.source, edge.target) not in existing_edge_set:
            model.edges.append(edge)
            existing_edge_set.add((edge.source, edge.target))

    model.overallProgress = _calc_progress(model.concepts)

    save_mental_model(model)
    return model


def _calc_progress(concepts: list[ConceptUnderstanding]) -> float:
    if not concepts:
        return 0.0
    level_weights = {
        UnderstandingLevel.SURFACE: 0.15,
        UnderstandingLevel.PARTIAL: 0.4,
        UnderstandingLevel.SOLID: 0.75,
        UnderstandingLevel.DEEP: 1.0,
    }
    total = sum(
        level_weights.get(c.level, 0.0) * c.confidence for c in concepts
    )
    return min(round(total / len(concepts), 4), 1.0)
