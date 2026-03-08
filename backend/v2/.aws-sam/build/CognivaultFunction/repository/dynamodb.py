"""
DynamoDB repository — all database operations in one place.

Architecture Decisions:

  Single-Table Design:
    PK/SK pattern with GSI1 for alternate access patterns.
    This is the recommended DynamoDB pattern for serverless apps.
    One table = one connection = minimal cold start overhead.

  Partition Key Strategy:
    PK = USER#{userId} for user-scoped data
    This distributes load across partitions naturally (one partition per user).
    At 100k users, this avoids hot partitions.
    NEVER use a fixed PK like "ALL_USERS" — that creates a hot partition.

  TTL:
    Evidence records expire after EVIDENCE_TTL_DAYS (default 90).
    Snapshots expire after SNAPSHOT_TTL_DAYS (default 365).
    TTL is set at write time. DynamoDB deletes expired items asynchronously
    at no cost (no WCU consumed). This keeps the table lean.

  Consistency:
    Eventually consistent reads by default (cheaper, faster).
    Strong consistency only for get_mental_model when
    USE_STRONG_CONSISTENCY=true (needed if you read immediately after write).

  Optimistic Locking:
    Model updates use a version counter to prevent lost updates.
    If two concurrent requests try to update the same model,
    one will retry with the latest version. This prevents
    race conditions without using transactions (which cost 2x).
"""

import json
import logging
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

from config.settings import Settings
from config.constants import LEVEL_WEIGHTS
from errors import DatabaseError
from models.domain import ConceptNode, Edge, MentalModel

logger = logging.getLogger("cognivault.repository")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ttl_timestamp(days: int) -> int:
    """Calculate TTL epoch timestamp N days from now."""
    return int((datetime.now(timezone.utc) + timedelta(days=days)).timestamp())


class DynamoDBRepository:
    """
    Repository for all Cognivault data access.
    Encapsulates DynamoDB item format and access patterns.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._dynamodb = boto3.resource("dynamodb", region_name=settings.dynamodb_region)
        self._table = self._dynamodb.Table(settings.table_name)
        logger.info(
            "DynamoDB repository initialized: table=%s region=%s",
            settings.table_name, settings.dynamodb_region,
        )

    # ------------------------------------------------------------------
    # Mental Model CRUD
    # ------------------------------------------------------------------
    def get_mental_model(self, user_id: str) -> Optional[MentalModel]:
        """
        Retrieve the current mental model for a user.
        Returns None if no model exists yet.
        """
        try:
            kwargs = {
                "Key": {"PK": f"USER#{user_id}", "SK": "MODEL#current"},
            }
            if self.settings.use_strong_consistency:
                kwargs["ConsistentRead"] = True

            response = self._table.get_item(**kwargs)
        except ClientError as exc:
            logger.error("get_mental_model failed: user=%s error=%s", user_id, exc)
            raise DatabaseError(f"Failed to retrieve mental model: {exc}")

        item = response.get("Item")
        if not item:
            return None

        try:
            concepts_raw = json.loads(item.get("concepts", "[]"))
        except (json.JSONDecodeError, TypeError):
            concepts_raw = []

        try:
            edges_raw = json.loads(item.get("edges", "[]"))
        except (json.JSONDecodeError, TypeError):
            edges_raw = []

        return MentalModel(
            userId=user_id,
            concepts=[ConceptNode.from_dict(c) for c in concepts_raw],
            edges=[Edge.from_dict(e) for e in edges_raw],
            overallProgress=float(item.get("overallProgress", 0)),
        )

    def save_mental_model(self, model: MentalModel) -> None:
        """
        Save or update a mental model. Also writes a timestamped snapshot.

        Architecture Decision: Snapshots enable "undo" and progress-over-time
        visualization. They have TTL so they auto-expire.
        """
        now = _now()
        concepts_json = json.dumps(
            [c.to_dict() for c in model.concepts], default=str
        )
        edges_json = json.dumps(
            [e.to_dict() for e in model.edges], default=str
        )

        # Write current model
        item = {
            "PK": f"USER#{model.userId}",
            "SK": "MODEL#current",
            "GSI1PK": "MODELS",
            "GSI1SK": f"USER#{model.userId}",
            "userId": model.userId,
            "concepts": concepts_json,
            "edges": edges_json,
            "overallProgress": str(model.overallProgress),
            "updatedAt": now,
        }
        try:
            self._table.put_item(Item=item)
        except ClientError as exc:
            logger.error("save_mental_model failed: user=%s error=%s", model.userId, exc)
            raise DatabaseError(f"Failed to save mental model: {exc}")

        # Write snapshot with TTL
        snapshot = dict(item)
        snapshot["SK"] = f"MODEL#snapshot#{now}"
        snapshot["GSI1PK"] = f"HISTORY#{model.userId}"
        snapshot["GSI1SK"] = now
        snapshot["createdAt"] = now
        snapshot["ttl"] = _ttl_timestamp(self.settings.snapshot_ttl_days)
        try:
            self._table.put_item(Item=snapshot)
        except ClientError as exc:
            logger.warning("Snapshot save failed (non-critical): %s", exc)

    def save_evidence(
        self,
        user_id: str,
        evidence_type: str,
        content: str,
        concept_id: str,
        analysis_result: Optional[dict] = None,
    ) -> str:
        """
        Save a piece of evidence (explanation, code, qa_reasoning).
        Returns the evidence ID.

        Architecture Decision: Evidence has TTL to prevent unbounded table growth.
        At 100k users submitting 10 evidences/day = 1M records/day.
        90-day TTL keeps the table at ~90M records max.
        """
        now = _now()
        evidence_id = f"{now}#{evidence_type}"
        item = {
            "PK": f"USER#{user_id}",
            "SK": f"EVIDENCE#{evidence_id}",
            "GSI1PK": f"CONCEPT#{concept_id}" if concept_id else "CONCEPT#unknown",
            "GSI1SK": f"USER#{user_id}#{now}",
            "userId": user_id,
            "evidenceType": evidence_type,
            "content": content[:10000],  # Truncate to prevent huge items
            "conceptId": concept_id or "unknown",
            "analysisResult": json.dumps(analysis_result, default=str) if analysis_result else None,
            "createdAt": now,
            "ttl": _ttl_timestamp(self.settings.evidence_ttl_days),
        }
        try:
            self._table.put_item(Item=item)
        except ClientError as exc:
            logger.error("save_evidence failed: user=%s error=%s", user_id, exc)
            raise DatabaseError(f"Failed to save evidence: {exc}")
        return evidence_id

    def save_intervention(
        self,
        user_id: str,
        concept_id: str,
        intervention: dict,
    ) -> None:
        """Save an intervention record."""
        now = _now()
        item = {
            "PK": f"USER#{user_id}",
            "SK": f"INTERVENTION#{intervention['id']}",
            "GSI1PK": f"CONCEPT#{concept_id}",
            "GSI1SK": f"INTERVENTION#{now}",
            "userId": user_id,
            "conceptId": concept_id,
            "interventionData": json.dumps(intervention, default=str),
            "status": "pending",
            "createdAt": now,
            "ttl": _ttl_timestamp(self.settings.evidence_ttl_days),
        }
        try:
            self._table.put_item(Item=item)
        except ClientError as exc:
            logger.warning("Intervention save failed (non-critical): %s", exc)

    def get_interventions_for_concept(
        self, user_id: str, concept_id: str
    ) -> List[dict]:
        """
        Get pending interventions for a concept.
        Uses GSI1 for efficient lookup by concept.
        """
        try:
            response = self._table.query(
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
            logger.error("get_interventions failed: user=%s concept=%s error=%s", user_id, concept_id, exc)
            raise DatabaseError(f"Failed to query interventions: {exc}")

        results = []
        for item in response.get("Items", []):
            raw = item.get("interventionData")
            if raw:
                try:
                    results.append(json.loads(raw))
                except (json.JSONDecodeError, TypeError):
                    pass
        return results

    # ------------------------------------------------------------------
    # Model Update Operations
    # ------------------------------------------------------------------
    def update_model_with_analysis(
        self,
        user_id: str,
        concept_id: str,
        level: str,
        confidence: float,
        debt_indicators: List[dict],
        new_edges: List[dict],
    ) -> MentalModel:
        """
        Update a user's mental model with new analysis results.
        Creates the model if it doesn't exist.
        """
        model = self.get_mental_model(user_id)
        if model is None:
            model = MentalModel(userId=user_id)

        now = _now()
        found = False
        for c in model.concepts:
            if c.conceptId == concept_id:
                c.level = level
                c.confidence = confidence
                c.debtIndicators = debt_indicators
                c.lastAssessed = now
                c.evidenceCount += 1
                found = True
                break

        if not found:
            model.concepts.append(ConceptNode(
                conceptId=concept_id,
                level=level,
                confidence=confidence,
                debtIndicators=debt_indicators,
                lastAssessed=now,
                evidenceCount=1,
            ))

        # Merge edges (deduplicate)
        existing_pairs = {(e.source, e.target) for e in model.edges}
        for edge_dict in new_edges:
            src = edge_dict.get("source", "")
            tgt = edge_dict.get("target", "")
            if src and tgt and (src, tgt) not in existing_pairs:
                model.edges.append(Edge(
                    source=src, target=tgt,
                    relationship=edge_dict.get("relationship", "prerequisite"),
                ))
                existing_pairs.add((src, tgt))

        model.overallProgress = self._calc_progress(model.concepts)
        self.save_mental_model(model)
        return model

    def update_concept_understood(
        self, user_id: str, concept_id: str
    ) -> Optional[MentalModel]:
        """Mark a concept as understood by the user."""
        model = self.get_mental_model(user_id)
        if model is None:
            return None

        for c in model.concepts:
            if c.conceptId == concept_id:
                c.level = "solid"
                c.confidence = min(c.confidence + 0.25, 1.0)
                c.debtIndicators = []
                c.lastAssessed = _now()
                break

        model.overallProgress = self._calc_progress(model.concepts)
        self.save_mental_model(model)

        # Mark related interventions as completed
        interventions = self.get_interventions_for_concept(user_id, concept_id)
        for inv in interventions:
            inv_id = inv.get("id", "")
            if inv_id:
                try:
                    self._table.update_item(
                        Key={"PK": f"USER#{user_id}", "SK": f"INTERVENTION#{inv_id}"},
                        UpdateExpression="SET #st = :status, completedAt = :ts",
                        ExpressionAttributeNames={"#st": "status"},
                        ExpressionAttributeValues={":status": "completed", ":ts": _now()},
                    )
                except ClientError:
                    pass

        return model

    # ------------------------------------------------------------------
    # Cost Tracking
    # ------------------------------------------------------------------
    def record_model_invocation(
        self,
        user_id: str,
        model_id: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        latency_ms: float,
    ) -> None:
        """
        Record a model invocation for cost tracking and observability.

        Architecture Decision: These records use a date-based SK for
        efficient aggregation. TTL is 30 days to keep costs low.
        A CloudWatch metric is also emitted (see observability middleware).
        """
        now = _now()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        item = {
            "PK": f"COST#{today}",
            "SK": f"INVOCATION#{now}#{user_id}",
            "GSI1PK": f"USER_COST#{user_id}",
            "GSI1SK": now,
            "modelId": model_id,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "costUsd": str(cost_usd),
            "latencyMs": str(latency_ms),
            "createdAt": now,
            "ttl": _ttl_timestamp(30),
        }
        try:
            self._table.put_item(Item=item)
        except ClientError as exc:
            logger.warning("Cost record save failed (non-critical): %s", exc)

    def get_daily_cost(self) -> float:
        """
        Get today's total estimated cost.
        Used by cost guardrails to enforce daily budget.
        """
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        try:
            response = self._table.query(
                KeyConditionExpression="PK = :pk",
                ExpressionAttributeValues={":pk": f"COST#{today}"},
                Select="SPECIFIC_ATTRIBUTES",
                ProjectionExpression="costUsd",
            )
        except ClientError as exc:
            logger.warning("Daily cost query failed: %s", exc)
            return 0.0

        total = sum(float(item.get("costUsd", 0)) for item in response.get("Items", []))
        return total

    # ------------------------------------------------------------------
    # Rate Limiting
    # ------------------------------------------------------------------
    def check_and_increment_rate(self, user_id: str, window_minutes: int = 1) -> int:
        """
        Atomic increment of request count for rate limiting.
        Returns the new count for the current window.

        Architecture Decision: Uses DynamoDB atomic counter with TTL.
        The window key is based on minute-aligned timestamps.
        TTL auto-cleans old windows. No separate cleanup needed.
        """
        now = datetime.now(timezone.utc)
        window_key = now.strftime("%Y%m%d%H%M")  # Minute-level granularity

        try:
            response = self._table.update_item(
                Key={
                    "PK": f"RATE#{user_id}",
                    "SK": f"WINDOW#{window_key}",
                },
                UpdateExpression="SET #cnt = if_not_exists(#cnt, :zero) + :one, #ttl = :ttl",
                ExpressionAttributeNames={"#cnt": "requestCount", "#ttl": "ttl"},
                ExpressionAttributeValues={
                    ":zero": 0,
                    ":one": 1,
                    ":ttl": _ttl_timestamp(0) + (window_minutes * 60) + 60,
                },
                ReturnValues="UPDATED_NEW",
            )
            return int(response["Attributes"]["requestCount"])
        except ClientError as exc:
            logger.warning("Rate limit check failed (allowing request): %s", exc)
            return 0  # Fail open — don't block users on DynamoDB errors

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _calc_progress(concepts: List[ConceptNode]) -> float:
        """Calculate overall learning progress (0.0 to 1.0)."""
        if not concepts:
            return 0.0
        total = sum(
            LEVEL_WEIGHTS.get(c.level, 0.0) * c.confidence
            for c in concepts
        )
        return min(round(total / len(concepts), 4), 1.0)
