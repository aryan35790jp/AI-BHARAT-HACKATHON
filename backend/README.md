# Cognivault – Cognitive Debt Map Backend

Serverless AWS backend for the Cognivault Cognitive Debt Map system.  
Built with **Python 3.11**, **AWS Lambda**, **API Gateway**, **DynamoDB**, and **AWS Bedrock (Claude 3 Sonnet)**.

---

## Architecture

```
Frontend (React) → API Gateway → Lambda → Bedrock / DynamoDB
```

| Component | Tech |
|---|---|
| Runtime | Python 3.11 |
| IaC | AWS SAM (`template.yaml`) |
| AI | AWS Bedrock – Claude 3 Sonnet |
| Database | DynamoDB (single-table, PAY_PER_REQUEST) |
| Validation | Pydantic v2 |

---

## Project Structure

```
backend/
├── template.yaml          # SAM template (API GW, Lambdas, DynamoDB)
├── requirements.txt       # Python dependencies
├── README.md
└── src/
    ├── handler.py          # Lambda entry points (5 handlers)
    ├── models.py           # Pydantic models & domain knowledge graph
    ├── repository.py       # DynamoDB data access layer
    ├── bedrock_service.py  # AWS Bedrock integration
    └── retry.py            # Exponential backoff retry decorator
```

---

## API Endpoints

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/analyze` | `handle_analyze` | Analyze concept explanation, detect cognitive debt |
| POST | `/evidence` | `handle_submit_evidence` | Submit evidence for analysis (frontend contract) |
| GET | `/mental-model/{userId}` | `handle_get_mental_model` | Retrieve user's mental model graph |
| GET | `/interventions/{conceptId}?userId=` | `handle_get_interventions` | Fetch micro-interventions for a concept |
| PUT | `/mental-model/{userId}/concepts/{conceptId}/understood` | `handle_mark_understood` | Mark concept as understood |

All endpoints return JSON with CORS headers (`Access-Control-Allow-Origin: *`).

---

## Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) ≥ 1.100
- [Python 3.11](https://www.python.org/downloads/)
- AWS CLI configured with credentials that have access to:
  - DynamoDB
  - Bedrock (`anthropic.claude-3-sonnet-20240229-v1:0`)
  - CloudFormation / IAM (for deployment)

---

## Local Development

### Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Run locally with SAM

```bash
sam build
sam local start-api
```

The API will be available at `http://localhost:3000`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TABLE_NAME` | `cognivault-data` | DynamoDB table name |
| `BEDROCK_MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` | Bedrock model identifier |
| `BEDROCK_REGION` | `us-east-1` | AWS region for Bedrock |
| `LOG_LEVEL` | `INFO` | Logging level |

---

## Deployment

### First-time deploy (guided)

```bash
cd backend
sam build
sam deploy --guided
```

Follow the prompts to set stack name, region, and confirm IAM role creation.

### Subsequent deploys

```bash
sam build && sam deploy
```

### Outputs

After deployment, SAM will output:
- **ApiEndpoint** – The API Gateway URL (e.g. `https://abc123.execute-api.us-east-1.amazonaws.com/prod`)
- **TableName** – The DynamoDB table name

Update the frontend's `VITE_API_BASE_URL` to point at the `ApiEndpoint`.

---

## DynamoDB Schema

Single-table design with composite keys:

| Access Pattern | PK | SK |
|---|---|---|
| User's current model | `USER#{userId}` | `MODEL#current` |
| Model snapshot | `USER#{userId}` | `MODEL#snapshot#{timestamp}` |
| Evidence record | `USER#{userId}` | `EVIDENCE#{evidenceId}` |
| Intervention | `USER#{userId}` | `INTERVENTION#{interventionId}` |

**GSI1** (`GSI1PK` / `GSI1SK`) enables queries by concept and history.

---

## How It Works

1. **Student submits evidence** (explanation, code, or Q&A response)
2. **Lambda invokes Bedrock** with a structured prompt asking Claude to analyse understanding
3. **Claude returns** understanding level, confidence, debt indicators, and optional intervention
4. **Repository updates** the DynamoDB mental model graph with new data and edges
5. **Frontend renders** the updated graph with debt badges and interventions

---

## Testing

```bash
# Syntax check all Python files
cd backend/src
python -m py_compile handler.py
python -m py_compile models.py
python -m py_compile repository.py
python -m py_compile bedrock_service.py
python -m py_compile retry.py
```

For integration tests, deploy to AWS and exercise endpoints with `curl` or the frontend.
