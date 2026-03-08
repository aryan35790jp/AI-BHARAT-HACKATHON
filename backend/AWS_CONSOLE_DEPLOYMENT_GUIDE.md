# COGNIVAULT – Cognitive Debt Map
# Complete AWS Console Backend Deployment Guide

---

## 1. ARCHITECTURE OVERVIEW

```
┌────────────────────┐
│   React Frontend   │
│  (Vite + D3.js)    │
└────────┬───────────┘
         │ HTTPS (JSON)
         ▼
┌────────────────────┐
│   API Gateway      │
│   (REST API)       │
│   CORS enabled     │
│                    │
│ POST /analyze      │
│ POST /evidence     │
│ GET  /mental-model │
│      /{userId}     │
│ GET  /interventions│
│      /{conceptId}  │
│ PUT  /mental-model │
│  /{userId}/concepts│
│  /{conceptId}/     │
│    understood      │
└────────┬───────────┘
         │ Lambda Proxy Integration
         ▼
┌────────────────────┐
│  AWS Lambda        │
│  Python 3.11       │
│  Single function   │
│  Routes internally │
│  128MB / 60s       │
└───┬────────────┬───┘
    │            │
    ▼            ▼
┌──────────┐ ┌──────────────┐
│ DynamoDB │ │ AWS Bedrock  │
│ Single   │ │ Claude 3     │
│ Table    │ │ Sonnet       │
│ On-demand│ │ us-east-1    │
└──────────┘ └──────────────┘
```

**Services used:**
- Amazon API Gateway (REST API)
- AWS Lambda (Python 3.11)
- Amazon DynamoDB (On-demand, single-table)
- Amazon Bedrock (Claude 3 Sonnet)
- AWS IAM (execution role)

---

## 2. PRE-FLIGHT: ENABLE BEDROCK MODEL ACCESS

This MUST be done FIRST. Model access can take 1-5 minutes to propagate.

1. Open AWS Console → search **"Amazon Bedrock"**
2. Ensure you are in region **us-east-1** (N. Virginia)
3. Left sidebar → **Model access**
4. Click **Manage model access**
5. Check the box for **Anthropic → Claude 3 Sonnet**
6. Click **Save changes**
7. Wait until status shows **Access granted**

**Model ID:** `anthropic.claude-3-sonnet-20240229-v1:0`

---

## 3. CREATE DYNAMODB TABLE

### 3.1 Navigate
AWS Console → DynamoDB → **Create table**

### 3.2 Table Settings

| Setting | Value |
|---------|-------|
| Table name | `cognivault-data` |
| Partition key | `PK` (String) |
| Sort key | `SK` (String) |
| Table settings | Customize settings |
| Table class | DynamoDB Standard |
| Read/write capacity | On-demand |
| Encryption | AWS owned key (default) |

### 3.3 Create Global Secondary Index (GSI)

On the same create page, scroll to **Secondary indexes** → Click **Create global index**:

| Setting | Value |
|---------|-------|
| Index name | `GSI1` |
| Partition key | `GSI1PK` (String) |
| Sort key | `GSI1SK` (String) |
| Projected attributes | All |

Click **Create index**, then click **Create table**.

### 3.4 Single-Table Schema

| Access Pattern | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Current mental model | `USER#{userId}` | `MODEL#current` | `MODELS` | `USER#{userId}` |
| Model history snapshot | `USER#{userId}` | `MODEL#snapshot#{ts}` | `HISTORY#{userId}` | `{timestamp}` |
| Evidence record | `USER#{userId}` | `EVIDENCE#{evidenceId}` | `CONCEPT#{conceptId}` | `USER#{userId}#{ts}` |
| Intervention | `USER#{userId}` | `INTERVENTION#{intId}` | `CONCEPT#{conceptId}` | `INTERVENTION#{ts}` |

---

## 4. CREATE IAM ROLE FOR LAMBDA

### 4.1 Navigate
AWS Console → IAM → Roles → **Create role**

### 4.2 Role Configuration

| Setting | Value |
|---------|-------|
| Trusted entity type | AWS service |
| Use case | Lambda |
| Role name | `CognivaultLambdaRole` |

### 4.3 Attach Managed Policies

Search and attach these:
1. `AWSLambdaBasicExecutionRole` (for CloudWatch Logs)

### 4.4 Create Inline Policy

After role creation, click the role → **Add permissions** → **Create inline policy** → **JSON** tab.

Paste this exact policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "DynamoDBAccess",
            "Effect": "Allow",
            "Action": [
                "dynamodb:GetItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem",
                "dynamodb:Query",
                "dynamodb:Scan"
            ],
            "Resource": [
                "arn:aws:dynamodb:*:*:table/cognivault-data",
                "arn:aws:dynamodb:*:*:table/cognivault-data/index/*"
            ]
        },
        {
            "Sid": "BedrockAccess",
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel"
            ],
            "Resource": [
                "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
            ]
        }
    ]
}
```

Name the policy: `CognivaultServicePolicy`

Click **Create policy**.

---

## 5. CREATE LAMBDA FUNCTION

### 5.1 Navigate
AWS Console → Lambda → **Create function**

### 5.2 Function Configuration

| Setting | Value |
|---------|-------|
| Function option | Author from scratch |
| Function name | `cognivault-backend` |
| Runtime | Python 3.11 |
| Architecture | x86_64 |
| Execution role | Use an existing role → `CognivaultLambdaRole` |

Click **Create function**.

### 5.3 Configure Settings

After creation, go to **Configuration** tab:

**General configuration** → Edit:
| Setting | Value |
|---------|-------|
| Memory | 512 MB |
| Timeout | 1 min 0 sec |
| Ephemeral storage | 512 MB |

**Environment variables** → Edit → Add these:
| Key | Value |
|-----|-------|
| `TABLE_NAME` | `cognivault-data` |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` |
| `BEDROCK_REGION` | `us-east-1` |
| `LOG_LEVEL` | `INFO` |

Click **Save** after each section.

### 5.4 Paste Lambda Code

Go to **Code** tab → Delete all existing code in `lambda_function.py` → Paste the ENTIRE code from Section 8 below → Click **Deploy**.

---

## 6. CREATE API GATEWAY

### 6.1 Navigate
AWS Console → API Gateway → **Create API** → **REST API** (not private) → **Build**

### 6.2 API Settings

| Setting | Value |
|---------|-------|
| API name | `CognivaultAPI` |
| Description | `Cognivault Cognitive Debt Map Backend` |
| API endpoint type | Regional |

Click **Create API**.

### 6.3 Create Resources and Methods

You need to create 5 routes. Follow these steps exactly.

#### Route 1: POST /analyze

1. Click **/** in resource tree → **Create Resource**
   - Resource name: `analyze`
   - Resource path: `/analyze`
   - **Check** "Enable API Gateway CORS"
   - Click **Create Resource**
2. Click `/analyze` → **Create Method** → Select **POST**
   - Integration type: Lambda Function
   - **Check** "Use Lambda Proxy integration"
   - Lambda Function: `cognivault-backend`
   - Click **Create Method**

#### Route 2: POST /evidence

1. Click **/** → **Create Resource**
   - Resource name: `evidence`
   - Resource path: `/evidence`
   - **Check** "Enable API Gateway CORS"
   - Click **Create Resource**
2. Click `/evidence` → **Create Method** → Select **POST**
   - Integration type: Lambda Function
   - **Check** "Use Lambda Proxy integration"
   - Lambda Function: `cognivault-backend`
   - Click **Create Method**

#### Route 3: GET /mental-model/{userId}

1. Click **/** → **Create Resource**
   - Resource name: `mental-model`
   - Resource path: `/mental-model`
   - **Check** "Enable API Gateway CORS"
   - Click **Create Resource**
2. Click `/mental-model` → **Create Resource**
   - Resource name: `userId`
   - Resource path: `{userId}`
   - **Check** "Enable API Gateway CORS"
   - Click **Create Resource**
3. Click `/{userId}` → **Create Method** → Select **GET**
   - Integration type: Lambda Function
   - **Check** "Use Lambda Proxy integration"
   - Lambda Function: `cognivault-backend`
   - Click **Create Method**

#### Route 4: GET /interventions/{conceptId}

1. Click **/** → **Create Resource**
   - Resource name: `interventions`
   - Resource path: `/interventions`
   - **Check** "Enable API Gateway CORS"
   - Click **Create Resource**
2. Click `/interventions` → **Create Resource**
   - Resource name: `conceptId`
   - Resource path: `{conceptId}`
   - **Check** "Enable API Gateway CORS"
   - Click **Create Resource**
3. Click `/{conceptId}` → **Create Method** → Select **GET**
   - Integration type: Lambda Function
   - **Check** "Use Lambda Proxy integration"
   - Lambda Function: `cognivault-backend`
   - Click **Create Method**

#### Route 5: PUT /mental-model/{userId}/concepts/{conceptId}/understood

1. Navigate to the already-created `/{userId}` under `/mental-model`
2. Click `/{userId}` → **Create Resource**
   - Resource name: `concepts`
   - Resource path: `/concepts`
   - **Check** "Enable API Gateway CORS"
   - Click **Create Resource**
3. Click `/concepts` → **Create Resource**
   - Resource name: `conceptId`
   - Resource path: `{conceptId}`
   - **Check** "Enable API Gateway CORS"
   - Click **Create Resource**
4. Click `/{conceptId}` → **Create Resource**
   - Resource name: `understood`
   - Resource path: `/understood`
   - **Check** "Enable API Gateway CORS"
   - Click **Create Resource**
5. Click `/understood` → **Create Method** → Select **PUT**
   - Integration type: Lambda Function
   - **Check** "Use Lambda Proxy integration"
   - Lambda Function: `cognivault-backend`
   - Click **Create Method**

### 6.4 Final Resource Tree

```
/
├── /analyze              OPTIONS, POST
├── /evidence             OPTIONS, POST
├── /interventions
│   └── /{conceptId}      OPTIONS, GET
└── /mental-model
    └── /{userId}          OPTIONS, GET
        └── /concepts
            └── /{conceptId}
                └── /understood   OPTIONS, PUT
```

### 6.5 Deploy the API

1. Click **Deploy API** button (top left)
2. Stage: **New Stage**
3. Stage name: `prod`
4. Click **Deploy**

### 6.6 Get Your API URL

After deployment, you will see:

```
Invoke URL: https://{api-id}.execute-api.{region}.amazonaws.com/prod
```

**Copy this URL. You will need it for testing and frontend integration.**

---

## 7. CORS VERIFICATION

The "Enable API Gateway CORS" checkbox when creating resources automatically creates OPTIONS methods. However, the actual CORS headers are returned by Lambda (in the code) via `Lambda Proxy Integration`.

Since we use Lambda Proxy Integration, CORS headers are set in every Lambda response. The OPTIONS preflight is handled by the auto-created OPTIONS methods from API Gateway.

If CORS still fails, manually verify each resource's OPTIONS method:
1. Click any resource → OPTIONS method
2. Check that Method Response has 200 status
3. Check Integration Response returns these headers:
   - `Access-Control-Allow-Origin: '*'`
   - `Access-Control-Allow-Headers: 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-User-Id'`
   - `Access-Control-Allow-Methods: 'GET,POST,PUT,DELETE,OPTIONS'`

---

## 8. COMPLETE LAMBDA CODE

This is the ENTIRE Lambda function code. It uses ONLY boto3 (pre-installed in Lambda) and Python stdlib. **No pip installs required.**

Go to Lambda → `cognivault-backend` → Code tab → Replace ALL content of `lambda_function.py` with this code → Click **Deploy**.

```python
"""
COGNIVAULT - Cognitive Debt Map Backend
Complete AWS Lambda handler (single file, zero external dependencies).
Runtime: Python 3.11 | Memory: 512 MB | Timeout: 60s
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
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")
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

    user_prompt = (
        f"Concept being assessed: {concept}\n"
        f"Known prerequisites: {prereqs_str}\n"
        f"Evidence type: {evidence_type}\n\n"
        f"Student's explanation/evidence:\n"
        f"---\n{explanation}\n---\n\n"
        f"Analyze the understanding demonstrated above and return the JSON analysis."
    )

    request_body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "temperature": 0.3,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_prompt}],
    })

    response = bedrock.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=request_body,
    )

    response_body = json.loads(response["body"].read())
    content_blocks = response_body.get("content", [])
    raw_text = "".join(b["text"] for b in content_blocks if b.get("type") == "text").strip()
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
```

---

## 9. API TESTING

### 9.1 Get Your Base URL

Your base URL after API Gateway deployment looks like:
```
https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod
```

Replace `{BASE_URL}` in all examples below.

### 9.2 Test with curl

#### Test 1: POST /analyze (Core endpoint)

```bash
curl -X POST {BASE_URL}/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "concept": "closures",
    "explanation": "Closures are functions that remember variables from their enclosing scope. When you define a function inside another function, the inner function has access to the outer variables even after the outer function has returned. This is because Python creates a closure that captures the variable bindings.",
    "userId": "test-user-001"
  }'
```

**Expected response (200):**
```json
{
  "conceptId": "closures",
  "understandingLevel": "solid",
  "confidence": 0.82,
  "debtIndicators": [],
  "microIntervention": null
}
```

#### Test 2: POST /analyze (with cognitive debt)

```bash
curl -X POST {BASE_URL}/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "concept": "recursion",
    "explanation": "Recursion is when a function calls itself recursively. It uses recursion to solve recursive problems.",
    "userId": "test-user-001"
  }'
```

**Expected: circular/parroting debt detected, with a microIntervention.**

#### Test 3: POST /evidence

```bash
curl -X POST {BASE_URL}/evidence \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "type": "explanation",
    "content": "A list comprehension creates a new list by applying an expression to each item in an iterable. For example [x**2 for x in range(10)] creates a list of squares.",
    "conceptId": "list_comprehensions"
  }'
```

**Expected response (200):**
```json
{
  "updatedModel": {
    "userId": "test-user-001",
    "concepts": [...],
    "edges": [...],
    "overallProgress": 0.3
  },
  "interventions": [...]
}
```

#### Test 4: GET /mental-model/{userId}

```bash
curl {BASE_URL}/mental-model/test-user-001
```

**Expected: Full mental model graph JSON**

#### Test 5: GET /interventions/{conceptId}

```bash
curl "{BASE_URL}/interventions/closures?userId=test-user-001"
```

**Expected: Array of intervention objects**

#### Test 6: PUT mark understood

```bash
curl -X PUT {BASE_URL}/mental-model/test-user-001/concepts/closures/understood
```

**Expected: Updated mental model with closures at "solid" level**

#### Test 7: Validation error

```bash
curl -X POST {BASE_URL}/analyze \
  -H "Content-Type: application/json" \
  -d '{"concept": "", "explanation": "", "userId": ""}'
```

**Expected: 422 with validation error details**

### 9.3 Test with Postman

1. Create a new request
2. Set method and URL (e.g., `POST https://xxx.execute-api.us-east-1.amazonaws.com/prod/analyze`)
3. Headers tab → Add `Content-Type: application/json`
4. Body tab → raw → JSON → Paste request body
5. Click **Send**

---

## 10. CONNECT FRONTEND

### 10.1 Set Environment Variable

Create a `.env` file in the frontend root (`c:\Hackthon\cognivault\`):

```env
VITE_API_BASE_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod
```

Replace with your actual API Gateway invoke URL (from Section 6.6).

### 10.2 Restart Dev Server

```bash
cd c:\Hackthon\cognivault
npm run dev
```

The frontend Axios client reads `VITE_API_BASE_URL` at build time:
```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.cognivault.io';
```

### 10.3 Verify Integration

1. Open browser → `http://localhost:5173`
2. The app should no longer show the mock data banner
3. Enter a concept explanation and submit
4. The graph should update with real AI analysis
5. Check browser DevTools → Network tab for 200 responses

### 10.4 For Production Build

```bash
cd c:\Hackthon\cognivault
npm run build
```

The built `dist/` folder can be hosted on S3 + CloudFront, Amplify, Vercel, or Netlify.

---

## 11. COMMON FAILURE POINTS AND FIXES

| # | Problem | Symptom | Fix |
|---|---------|---------|-----|
| 1 | Bedrock model not enabled | `AccessDeniedException: You don't have access to the model` | Go to Bedrock → Model access → Enable Claude 3 Sonnet → Wait 5 min |
| 2 | Wrong region for Bedrock | `ResourceNotFoundException` | Ensure Lambda env var `BEDROCK_REGION=us-east-1` and API Gateway is also in us-east-1 |
| 3 | DynamoDB table not found | `ResourceNotFoundException: Requested resource not found` | Verify table name is exactly `cognivault-data` and region matches |
| 4 | GSI missing | `ValidationException: The table does not have the specified index: GSI1` | Delete and recreate table with GSI1 (PK=GSI1PK, SK=GSI1SK) |
| 5 | IAM permissions | `AccessDeniedException` on DynamoDB or Bedrock | Check IAM role `CognivaultLambdaRole` has both DynamoDB and Bedrock policies |
| 6 | Lambda timeout | `Task timed out after 3.00 seconds` | Set Lambda timeout to 60 seconds (Bedrock calls take 5-15s) |
| 7 | Lambda memory | `Runtime.ExitError` or OOM | Set Lambda memory to 512 MB |
| 8 | CORS error in browser | `Access-Control-Allow-Origin` missing | Verify OPTIONS methods exist on all resources AND Lambda returns CORS headers |
| 9 | 502 Bad Gateway | Lambda returning malformed response | Check CloudWatch Logs for Lambda errors. Ensure JSON body is a string. |
| 10 | API not deployed | 403 `Missing Authentication Token` | You forgot to Deploy API → go to API Gateway → Deploy API → prod stage |
| 11 | Wrong handler name | `Unable to import module 'lambda_function'` | Ensure Runtime settings → Handler is `lambda_function.lambda_handler` |
| 12 | JSON parse error from Bedrock | `Invalid JSON response from Bedrock` | The code has fallback parsing. Check CloudWatch for the raw response. |
| 13 | Decimal serialization | `TypeError: Object of type Decimal is not JSON serializable` | Already handled by `DecimalEncoder` in the code |
| 14 | Frontend shows mock data | Banner says "Using mock data" | Set `VITE_API_BASE_URL` in `.env` and restart dev server |
| 15 | API Gateway returns `{"message":"Internal server error"}` | Unhandled Lambda crash | Check CloudWatch Logs → `/aws/lambda/cognivault-backend` |

### Debugging Checklist

1. Lambda → Monitor → **View CloudWatch Logs**
2. Look for `Event:` log line to see what API Gateway sent
3. Look for `Routing:` log line to see method/path matching
4. Look for error tracebacks
5. Verify DynamoDB table has items after a successful call

---

## 12. COST ESTIMATE FOR 1,000 REQUESTS

| Service | Usage | Cost |
|---------|-------|------|
| **API Gateway** | 1,000 REST API calls | $0.0035 |
| **Lambda** | 1,000 invocations × 512MB × 15s avg | $0.13 |
| **DynamoDB** | ~4,000 WCU + 2,000 RCU (on-demand) | $0.007 |
| **Bedrock (Claude 3 Sonnet)** | ~1,000 calls × ~800 input + ~500 output tokens avg | $2.40 input + $3.60 output = **$6.00** |
| **CloudWatch Logs** | ~50 MB | $0.025 |
| **Total** | | **~$6.17** |

Key driver: **Bedrock is 97% of cost.** Everything else is near-free at this scale.

Free tier covers: 1M Lambda invocations/month, 1M API Gateway calls/month, 25GB DynamoDB storage.

---

## 13. DEPLOYMENT CHECKLIST BEFORE DEMO

```
PRE-DEPLOYMENT
[ ] AWS Account has billing alerts set
[ ] Region is us-east-1 for all services
[ ] Bedrock model access granted for Claude 3 Sonnet

DYNAMODB
[ ] Table "cognivault-data" exists
[ ] PK=PK(S), SK=SK(S) confirmed
[ ] GSI1 index exists with GSI1PK(S), GSI1SK(S)
[ ] Billing mode is On-demand (PAY_PER_REQUEST)

IAM
[ ] Role "CognivaultLambdaRole" exists
[ ] AWSLambdaBasicExecutionRole attached
[ ] CognivaultServicePolicy inline policy attached
[ ] DynamoDB + Bedrock permissions confirmed

LAMBDA
[ ] Function "cognivault-backend" exists
[ ] Runtime: Python 3.11
[ ] Handler: lambda_function.lambda_handler
[ ] Memory: 512 MB
[ ] Timeout: 60 seconds
[ ] Environment variables set (TABLE_NAME, BEDROCK_MODEL_ID, BEDROCK_REGION, LOG_LEVEL)
[ ] Code deployed (full code pasted, blue Deploy button clicked)
[ ] Test event runs without import errors

API GATEWAY
[ ] REST API "CognivaultAPI" exists
[ ] All 5 routes created with Lambda Proxy Integration
[ ] Each resource has OPTIONS method (CORS)
[ ] API deployed to "prod" stage
[ ] Invoke URL noted

FRONTEND
[ ] .env file has VITE_API_BASE_URL set to API Gateway URL
[ ] npm run dev starts without errors
[ ] Network requests hit the real API (no mock data banner)

TESTING
[ ] POST /analyze returns 200 with valid JSON
[ ] POST /evidence returns updatedModel + interventions
[ ] GET /mental-model/{userId} returns graph
[ ] GET /interventions/{conceptId}?userId= returns array
[ ] PUT .../understood returns updated model
[ ] Invalid input returns 422
[ ] DynamoDB shows items after API calls
[ ] CloudWatch Logs show no errors
```

---

## 14. QUICK-START SUMMARY

| Step | Action | Time |
|------|--------|------|
| 1 | Enable Bedrock Claude 3 Sonnet model access | 2 min |
| 2 | Create DynamoDB table `cognivault-data` with GSI1 | 3 min |
| 3 | Create IAM role `CognivaultLambdaRole` with policies | 5 min |
| 4 | Create Lambda `cognivault-backend`, paste code, set env vars | 5 min |
| 5 | Create API Gateway REST API with 5 routes | 10 min |
| 6 | Deploy API to `prod` stage | 1 min |
| 7 | Test with curl | 3 min |
| 8 | Set `VITE_API_BASE_URL` in frontend `.env` | 1 min |
| **Total** | | **~30 min** |

---

*This guide is self-contained. Every service, every setting, every line of code is specified. Follow it top to bottom and the backend will work.*
