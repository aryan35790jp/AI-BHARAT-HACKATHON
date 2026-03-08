"""
COGNIVAULT - Cognitive Debt Map Backend
Complete AWS Lambda handler (single file, zero external dependencies).
Runtime: Python 3.11 | Memory: 512 MB | Timeout: 60s

DEPLOYMENT:
  1. AWS Console → Lambda → Create function → Python 3.11
  2. Paste this entire file into lambda_function.py
  3. Click Deploy
  4. Set env vars: TABLE_NAME, BEDROCK_MODEL_ID, BEDROCK_REGION, LOG_LEVEL
"""

import json
import logging
import os
import traceback
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
TABLE_NAME = os.environ.get("TABLE_NAME", "cognivault-data")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "meta.llama4-maverick-17b-instruct-v1:0")
BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "us-east-1")
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("cognivault")
logger.setLevel(LOG_LEVEL)

# ---------------------------------------------------------------------------
# AWS Clients (module-level for connection reuse across invocations)
# ---------------------------------------------------------------------------
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
bedrock = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
VALID_UNDERSTANDING_LEVELS = {"surface", "partial", "solid", "deep"}
VALID_DEBT_TYPES = {"circular", "parroting", "logical_jump", "confidence_mismatch", "wrong_reasoning"}
VALID_INTERVENTION_TYPES = {"clarification", "counter_example", "mental_model", "aha_bridge"}
VALID_EVIDENCE_TYPES = {"explanation", "code", "qa_reasoning"}

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-User-Id",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json",
}

DOMAIN_KNOWLEDGE = {
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

LEVEL_WEIGHTS = {"surface": 0.15, "partial": 0.4, "solid": 0.75, "deep": 1.0}

# ---------------------------------------------------------------------------
# Bedrock Prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are an expert cognitive science tutor specializing in identifying understanding gaps, cognitive debt, and misconceptions in student explanations.

Given a student's explanation of a programming/ML concept, analyze it and return a JSON object with EXACTLY this schema:

{
  "understandingLevel": "surface" | "partial" | "solid" | "deep",
  "confidence": <float 0.0 to 1.0>,
  "debtIndicators": [
    {
      "type": "circular" | "parroting" | "logical_jump" | "confidence_mismatch" | "wrong_reasoning",
      "severity": <float 0.0 to 1.0>,
      "evidence": "<quoted text from student>",
      "explanation": "<why this is cognitive debt>"
    }
  ],
  "interventionType": "clarification" | "counter_example" | "mental_model" | "aha_bridge" | null,
  "interventionContent": {
    "title": "<short title>",
    "explanation": "<targeted explanation addressing the gaps>",
    "examples": ["<concrete example 1>", "<concrete example 2>"],
    "followUpQuestions": ["<question to probe deeper>"]
  } or null,
  "relatedConcepts": ["<concept_name_in_snake_case>"],
  "edges": [
    {"source": "<prerequisite_concept>", "target": "<this_concept>", "relationship": "prerequisite"}
  ]
}

Rules:
- "circular": Student defines a concept using itself
- "parroting": Student repeats textbook definition without demonstrating real understanding
- "logical_jump": Student skips important reasoning steps between ideas
- "confidence_mismatch": Student seems very confident about something incorrect, or uncertain about something correct
- "wrong_reasoning": Student arrives at a conclusion via flawed reasoning
- If understanding is solid/deep with high confidence, interventionType and interventionContent may be null
- relatedConcepts should list prerequisite concepts that appear weak or missing
- edges should describe knowledge dependencies
- Concept names should use snake_case
- Return ONLY valid JSON. No markdown fences. No explanation outside JSON."""


# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------
def _now():
    return datetime.now(timezone.utc).isoformat()


def _uuid():
    return uuid.uuid4().hex[:12]


def _clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, float(v)))


def _normalize_concept(concept):
    return concept.strip().lower().replace(" ", "_").replace("-", "_")


def _get_prerequisites(concept):
    return DOMAIN_KNOWLEDGE.get(_normalize_concept(concept), [])


def _get_domain_edges(concept):
    norm = _normalize_concept(concept)
    prereqs = DOMAIN_KNOWLEDGE.get(norm, [])
    return [{"source": p, "target": norm, "relationship": "prerequisite"} for p in prereqs]


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def _json_dumps(obj):
    return json.dumps(obj, cls=DecimalEncoder, default=str)


# ---------------------------------------------------------------------------
# Response Helpers
# ---------------------------------------------------------------------------
def _ok(body, status=200):
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": _json_dumps(body) if not isinstance(body, str) else body,
    }


def _error(status, message, detail=None):
    body = {"error": message}
    if detail:
        body["detail"] = detail
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body),
    }


def _parse_body(event):
    raw = event.get("body", "")
    if not raw:
        return {}
    if isinstance(raw, str):
        return json.loads(raw)
    return raw


def _path_param(event, name):
    return (event.get("pathParameters") or {}).get(name)


def _query_param(event, name):
    return (event.get("queryStringParameters") or {}).get(name)


# ---------------------------------------------------------------------------
# Bedrock Service
# ---------------------------------------------------------------------------
def invoke_bedrock(concept, explanation, evidence_type="explanation"):
    prereqs = _get_prerequisites(concept)
    prereqs_str = ", ".join(prereqs) if prereqs else "none known"

    prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        f"Concept being assessed: {concept}\n"
        f"Known prerequisites: {prereqs_str}\n"
        f"Evidence type: {evidence_type}\n\n"
        f"Student's explanation/evidence:\n"
        f"---\n{explanation}\n---\n\n"
        f"Analyze the understanding demonstrated above and return the JSON analysis."
    )

    request_body = json.dumps({
        "prompt": prompt,
        "max_gen_len": 2048,
        "temperature": 0.3,
        "top_p": 0.9,
    })

    response = bedrock.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=request_body,
    )

    response_body = json.loads(response["body"].read())
    raw_text = response_body.get("generation", "").strip()
    return raw_text


def parse_bedrock_response(raw_text):
    cleaned = raw_text.strip()

    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            data = json.loads(cleaned[start:end])
        else:
            logger.error("Could not parse Bedrock JSON: %s", raw_text[:300])
            raise ValueError("Invalid JSON response from Bedrock")

    level = data.get("understandingLevel", "surface")
    if level not in VALID_UNDERSTANDING_LEVELS:
        level = "surface"

    confidence = _clamp(data.get("confidence", 0.5))

    debt_indicators = []
    for d in data.get("debtIndicators", []):
        dt = d.get("type", "")
        if dt in VALID_DEBT_TYPES:
            debt_indicators.append({
                "type": dt,
                "severity": _clamp(d.get("severity", 0.5)),
                "evidence": str(d.get("evidence", "")),
                "explanation": str(d.get("explanation", "")),
            })

    intervention_type = data.get("interventionType")
    intervention_content = None
    if intervention_type and intervention_type in VALID_INTERVENTION_TYPES and data.get("interventionContent"):
        ic = data["interventionContent"]
        intervention_content = {
            "title": str(ic.get("title", "")),
            "explanation": str(ic.get("explanation", "")),
            "examples": [str(e) for e in ic.get("examples", [])],
            "followUpQuestions": [str(q) for q in ic.get("followUpQuestions", [])],
        }
    else:
        intervention_type = None

    related = [str(c) for c in data.get("relatedConcepts", [])]

    edges = []
    for e in data.get("edges", []):
        if e.get("source") and e.get("target"):
            edges.append({
                "source": str(e["source"]),
                "target": str(e["target"]),
                "relationship": str(e.get("relationship", "prerequisite")),
            })

    return {
        "understandingLevel": level,
        "confidence": confidence,
        "debtIndicators": debt_indicators,
        "interventionType": intervention_type,
        "interventionContent": intervention_content,
        "relatedConcepts": related,
        "edges": edges,
    }


def analyze_understanding(concept, explanation, evidence_type="explanation"):
    raw = invoke_bedrock(concept, explanation, evidence_type)
    result = parse_bedrock_response(raw)

    domain_edges = _get_domain_edges(concept)
    existing = {(e["source"], e["target"]) for e in result["edges"]}
    for de in domain_edges:
        if (de["source"], de["target"]) not in existing:
            result["edges"].append(de)

    return result


def build_intervention(concept_id, result):
    if not result["interventionType"] or not result["interventionContent"]:
        return None
    return {
        "id": f"int_{_uuid()}",
        "type": result["interventionType"],
        "targetConcept": concept_id,
        "content": result["interventionContent"],
    }


# ---------------------------------------------------------------------------
# DynamoDB Repository
# ---------------------------------------------------------------------------
def get_mental_model(user_id):
    try:
        response = table.get_item(Key={"PK": f"USER#{user_id}", "SK": "MODEL#current"})
    except ClientError as exc:
        logger.error("DynamoDB get_item failed: %s", exc)
        raise

    item = response.get("Item")
    if not item:
        return None

    try:
        concepts = json.loads(item.get("concepts", "[]"))
    except (json.JSONDecodeError, TypeError):
        concepts = []

    try:
        edges = json.loads(item.get("edges", "[]"))
    except (json.JSONDecodeError, TypeError):
        edges = []

    return {
        "userId": user_id,
        "concepts": concepts,
        "edges": edges,
        "overallProgress": float(item.get("overallProgress", 0)),
    }


def save_mental_model(model):
    now = _now()
    item = {
        "PK": f"USER#{model['userId']}",
        "SK": "MODEL#current",
        "GSI1PK": "MODELS",
        "GSI1SK": f"USER#{model['userId']}",
        "userId": model["userId"],
        "concepts": json.dumps(model["concepts"], default=str),
        "edges": json.dumps(model["edges"], default=str),
        "overallProgress": str(model["overallProgress"]),
        "updatedAt": now,
    }
    try:
        table.put_item(Item=item)
    except ClientError as exc:
        logger.error("DynamoDB put_item failed: %s", exc)
        raise

    snapshot = dict(item)
    snapshot["SK"] = f"MODEL#snapshot#{now}"
    snapshot["GSI1PK"] = f"HISTORY#{model['userId']}"
    snapshot["GSI1SK"] = now
    snapshot["createdAt"] = now
    try:
        table.put_item(Item=snapshot)
    except ClientError as exc:
        logger.warning("Snapshot save failed: %s", exc)


def save_evidence(user_id, evidence_type, content, concept_id, analysis_result):
    now = _now()
    evidence_id = f"{now}#{evidence_type}"
    item = {
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
        logger.error("Evidence save failed: %s", exc)
        raise
    return evidence_id


def save_intervention_record(user_id, concept_id, intervention):
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
    }
    try:
        table.put_item(Item=item)
    except ClientError as exc:
        logger.warning("Intervention save failed: %s", exc)


def get_interventions_for_concept(user_id, concept_id):
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
        logger.error("Intervention query failed: %s", exc)
        raise

    results = []
    for item in response.get("Items", []):
        raw = item.get("interventionData")
        if raw:
            try:
                results.append(json.loads(raw))
            except (json.JSONDecodeError, TypeError):
                pass
    return results


def calc_progress(concepts):
    if not concepts:
        return 0.0
    total = sum(
        LEVEL_WEIGHTS.get(c.get("level", "surface"), 0.0) * float(c.get("confidence", 0))
        for c in concepts
    )
    return min(round(total / len(concepts), 4), 1.0)


def update_model_with_analysis(user_id, concept_id, level, confidence, debt_indicators, new_edges):
    model = get_mental_model(user_id)
    if model is None:
        model = {"userId": user_id, "concepts": [], "edges": [], "overallProgress": 0.0}

    now = _now()
    found = False
    for c in model["concepts"]:
        if c.get("conceptId") == concept_id:
            c["level"] = level
            c["confidence"] = confidence
            c["debtIndicators"] = debt_indicators
            c["lastAssessed"] = now
            c["evidenceCount"] = c.get("evidenceCount", 0) + 1
            found = True
            break

    if not found:
        model["concepts"].append({
            "conceptId": concept_id,
            "level": level,
            "confidence": confidence,
            "debtIndicators": debt_indicators,
            "lastAssessed": now,
            "evidenceCount": 1,
        })

    existing_edges = {(e["source"], e["target"]) for e in model["edges"]}
    for edge in new_edges:
        if (edge["source"], edge["target"]) not in existing_edges:
            model["edges"].append(edge)
            existing_edges.add((edge["source"], edge["target"]))

    model["overallProgress"] = calc_progress(model["concepts"])
    save_mental_model(model)
    return model


def update_concept_understood(user_id, concept_id):
    model = get_mental_model(user_id)
    if model is None:
        return None

    for c in model["concepts"]:
        if c.get("conceptId") == concept_id:
            c["level"] = "solid"
            c["confidence"] = min(float(c.get("confidence", 0)) + 0.25, 1.0)
            c["debtIndicators"] = []
            c["lastAssessed"] = _now()
            break

    model["overallProgress"] = calc_progress(model["concepts"])
    save_mental_model(model)

    interventions = get_interventions_for_concept(user_id, concept_id)
    for inv in interventions:
        inv_id = inv.get("id", "")
        if inv_id:
            try:
                table.update_item(
                    Key={"PK": f"USER#{user_id}", "SK": f"INTERVENTION#{inv_id}"},
                    UpdateExpression="SET #st = :status, completedAt = :ts",
                    ExpressionAttributeNames={"#st": "status"},
                    ExpressionAttributeValues={":status": "completed", ":ts": _now()},
                )
            except ClientError:
                pass

    return model


# ---------------------------------------------------------------------------
# Input Validation
# ---------------------------------------------------------------------------
def validate_analyze_request(body):
    errors = []
    concept = body.get("concept", "")
    explanation = body.get("explanation", "")
    user_id = body.get("userId", "")

    if not isinstance(concept, str) or len(concept.strip()) == 0:
        errors.append("concept is required and must be a non-empty string")
    elif len(concept) > 500:
        errors.append("concept must be 500 characters or less")

    if not isinstance(explanation, str) or len(explanation.strip()) == 0:
        errors.append("explanation is required and must be a non-empty string")
    elif len(explanation) > 10000:
        errors.append("explanation must be 10000 characters or less")

    if not isinstance(user_id, str) or len(user_id.strip()) == 0:
        errors.append("userId is required and must be a non-empty string")
    elif len(user_id) > 128:
        errors.append("userId must be 128 characters or less")

    return errors


def validate_evidence_request(body):
    errors = []
    user_id = body.get("userId", "")
    ev_type = body.get("type", "")
    content = body.get("content", "")

    if not isinstance(user_id, str) or len(user_id.strip()) == 0:
        errors.append("userId is required")
    elif len(user_id) > 128:
        errors.append("userId must be 128 characters or less")

    if ev_type not in VALID_EVIDENCE_TYPES:
        errors.append(f"type must be one of: {', '.join(sorted(VALID_EVIDENCE_TYPES))}")

    if not isinstance(content, str) or len(content.strip()) == 0:
        errors.append("content is required")
    elif len(content) > 50000:
        errors.append("content must be 50000 characters or less")

    return errors


# ---------------------------------------------------------------------------
# Route Handlers
# ---------------------------------------------------------------------------
def handle_analyze(event):
    logger.info("POST /analyze")
    try:
        body = _parse_body(event)
    except (json.JSONDecodeError, TypeError) as exc:
        return _error(400, "Invalid JSON body", str(exc))

    errors = validate_analyze_request(body)
    if errors:
        return _error(422, "Validation error", "; ".join(errors))

    concept = body["concept"].strip()
    explanation = body["explanation"].strip()
    user_id = body["userId"].strip()

    try:
        result = analyze_understanding(concept, explanation, "explanation")
        intervention = build_intervention(concept, result)

        save_evidence(user_id, "explanation", explanation, concept, result)
        update_model_with_analysis(
            user_id, concept,
            result["understandingLevel"],
            result["confidence"],
            result["debtIndicators"],
            result["edges"],
        )

        if intervention:
            save_intervention_record(user_id, concept, intervention)

        response = {
            "conceptId": concept,
            "understandingLevel": result["understandingLevel"],
            "confidence": result["confidence"],
            "debtIndicators": result["debtIndicators"],
            "microIntervention": intervention,
        }
        return _ok(response)

    except Exception as exc:
        logger.error("analyze failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Analysis failed", str(exc))


def handle_submit_evidence(event):
    logger.info("POST /evidence")
    try:
        body = _parse_body(event)
    except (json.JSONDecodeError, TypeError) as exc:
        return _error(400, "Invalid JSON body", str(exc))

    errors = validate_evidence_request(body)
    if errors:
        return _error(422, "Validation error", "; ".join(errors))

    user_id = body["userId"].strip()
    ev_type = body["type"]
    content = body["content"].strip()
    concept_id = body.get("conceptId") or "general"

    try:
        result = analyze_understanding(concept_id, content, ev_type)
        intervention = build_intervention(concept_id, result)

        save_evidence(user_id, ev_type, content, concept_id, result)
        updated_model = update_model_with_analysis(
            user_id, concept_id,
            result["understandingLevel"],
            result["confidence"],
            result["debtIndicators"],
            result["edges"],
        )

        interventions = []
        if intervention:
            save_intervention_record(user_id, concept_id, intervention)
            interventions.append(intervention)

        response = {
            "updatedModel": updated_model,
            "interventions": interventions,
        }
        return _ok(response)

    except Exception as exc:
        logger.error("submit_evidence failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Evidence submission failed", str(exc))


def handle_get_mental_model(event):
    user_id = _path_param(event, "userId")
    if not user_id:
        return _error(400, "Missing userId path parameter")

    logger.info("GET /mental-model/%s", user_id)
    try:
        model = get_mental_model(user_id)
        if model is None:
            model = {"userId": user_id, "concepts": [], "edges": [], "overallProgress": 0.0}
            save_mental_model(model)
        return _ok(model)
    except Exception as exc:
        logger.error("get_mental_model failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Failed to retrieve mental model", str(exc))


def handle_get_interventions(event):
    concept_id = _path_param(event, "conceptId")
    user_id = _query_param(event, "userId")

    if not concept_id:
        return _error(400, "Missing conceptId path parameter")
    if not user_id:
        return _error(400, "Missing userId query parameter")

    logger.info("GET /interventions/%s?userId=%s", concept_id, user_id)
    try:
        interventions = get_interventions_for_concept(user_id, concept_id)
        return _ok(interventions)
    except Exception as exc:
        logger.error("get_interventions failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Failed to retrieve interventions", str(exc))


def handle_mark_understood(event):
    user_id = _path_param(event, "userId")
    concept_id = _path_param(event, "conceptId")

    if not user_id:
        return _error(400, "Missing userId path parameter")
    if not concept_id:
        return _error(400, "Missing conceptId path parameter")

    logger.info("PUT /mental-model/%s/concepts/%s/understood", user_id, concept_id)
    try:
        model = update_concept_understood(user_id, concept_id)
        if model is None:
            model = {"userId": user_id, "concepts": [], "edges": [], "overallProgress": 0.0}
            save_mental_model(model)
        return _ok(model)
    except Exception as exc:
        logger.error("mark_understood failed: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Failed to mark concept as understood", str(exc))


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
def route_request(event):
    method = event.get("httpMethod", "").upper()
    path = event.get("resource", "")

    logger.info("Routing: %s %s", method, path)

    if method == "OPTIONS":
        return _ok({"message": "CORS preflight"})

    if method == "POST" and path == "/analyze":
        return handle_analyze(event)
    elif method == "POST" and path == "/evidence":
        return handle_submit_evidence(event)
    elif method == "GET" and path == "/mental-model/{userId}":
        return handle_get_mental_model(event)
    elif method == "GET" and path == "/interventions/{conceptId}":
        return handle_get_interventions(event)
    elif method == "PUT" and path == "/mental-model/{userId}/concepts/{conceptId}/understood":
        return handle_mark_understood(event)
    else:
        return _error(404, "Not found", f"{method} {path}")


# ---------------------------------------------------------------------------
# Lambda Entry Point
# ---------------------------------------------------------------------------
def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event, default=str)[:2000])
    try:
        return route_request(event)
    except Exception as exc:
        logger.error("Unhandled exception: %s\n%s", exc, traceback.format_exc())
        return _error(500, "Internal server error")
