# NEXT STEPS FOR ARYAN — Complete AWS Deployment Guide

## Table of Contents
1. [Deploy Lambda with v2 Code](#1-deploy-lambda-with-v2-code)
2. [Update DynamoDB Table for TTL](#2-update-dynamodb-table-for-ttl)
3. [Update IAM Role for Bedrock](#3-update-iam-role-for-bedrock)
4. [Update Lambda Environment Variables](#4-update-lambda-environment-variables)
5. [Update API Gateway Routes for /v1/](#5-update-api-gateway-routes-for-v1)
6. [Enable CORS on API Gateway](#6-enable-cors-on-api-gateway)
7. [Test All Endpoints](#7-test-all-endpoints)
8. [Enable Cognito Authentication](#8-enable-cognito-authentication)
9. [Set Up Rate Limiting with WAF](#9-set-up-rate-limiting-with-waf)
10. [Create CloudWatch Alarms](#10-create-cloudwatch-alarms)
11. [Create Cost Alerts (AWS Budgets)](#11-create-cost-alerts-aws-budgets)
12. [Enable Dead Letter Queue (DLQ)](#12-enable-dead-letter-queue-dlq)
13. [Create Staging + Prod Environments](#13-create-staging--prod-environments)
14. [Use Parameter Store for Secrets](#14-use-parameter-store-for-secrets)
15. [Enable X-Ray Tracing](#15-enable-x-ray-tracing)
16. [Set Up CI/CD Pipeline](#16-set-up-cicd-pipeline)
17. [Deploy Safely (Canary Deployments)](#17-deploy-safely-canary-deployments)
18. [Connect Frontend to v2 API](#18-connect-frontend-to-v2-api)
19. [Production Checklist](#19-production-checklist)

---

## 1. Deploy Lambda with v2 Code

The v2 code is a multi-file Python package. You need to upload it as a ZIP file.

### Step 1.1: Create the ZIP file on your local machine

Open PowerShell in `c:\Hackthon\cognivault\backend\v2\`:

```powershell
cd c:\Hackthon\cognivault\backend\v2\src
Compress-Archive -Path * -DestinationPath ..\cognivault-v2.zip -Force
```

### Step 1.2: Upload to Lambda

1. Go to **AWS Console** → **Lambda** → **Functions**
2. Click on your function: **cognivault-backend**
3. In the **Code** tab, click **Upload from** → **.zip file**
4. Click **Upload**, select `c:\Hackthon\cognivault\backend\v2\cognivault-v2.zip`
5. Click **Save**

### Step 1.3: Update the handler

1. Still on the **Code** tab, scroll down to **Runtime settings**
2. Click **Edit**
3. Change **Handler** to: `entrypoint.lambda_handler`
4. Click **Save**

### Step 1.4: Update the runtime

1. In **Runtime settings**, make sure **Runtime** is **Python 3.11**
2. If not, click **Edit** → select **Python 3.11** → **Save**

### Step 1.5: Update memory and timeout

1. Click the **Configuration** tab
2. Click **General configuration** → **Edit**
3. Set **Memory** to **512 MB**
4. Set **Timeout** to **1 min 0 sec**
5. Click **Save**

---

## 2. Update DynamoDB Table for TTL

TTL automatically deletes old evidence and snapshots at zero cost.

### Step 2.1: Enable TTL

1. Go to **AWS Console** → **DynamoDB** → **Tables**
2. Click on **cognivault-data**
3. Click the **Additional settings** tab
4. Scroll to **Time to Live (TTL)**
5. Click **Turn on**
6. Enter attribute name: `ttl`
7. Click **Turn on TTL**

> TTL may take up to 1 hour to start deleting expired items. This is normal.

---

## 3. Update IAM Role for Bedrock

The Lambda needs permission to call both the primary and fallback Bedrock models.

### Step 3.1: Open the execution role

1. Go to **Lambda** → **cognivault-backend** → **Configuration** → **Permissions**
2. Click on the **Role name** (e.g., `CognivaultLambdaRole`)
3. This opens the IAM console

### Step 3.2: Update the Bedrock policy

1. Find the policy that has `bedrock:InvokeModel`
2. Click the policy name → **Edit**
3. Click **JSON** tab
4. Replace the Bedrock section with:

```json
{
    "Effect": "Allow",
    "Action": [
        "bedrock:InvokeModel"
    ],
    "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/meta.llama4-maverick-17b-instruct-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/meta.llama3-1-8b-instruct-v1:0",
        "arn:aws:bedrock:us-east-1:*:inference-profile/*"
    ]
}
```

5. Click **Next** → **Save changes**

### Step 3.3: Add CloudWatch Metrics permission (if not present)

1. In the same role, click **Add permissions** → **Attach policies**
2. Search for `CloudWatchFullAccess`
3. Check the box → Click **Add permissions**

> In production, use a custom policy instead of FullAccess. For now this works.

### Step 3.4: Add DynamoDB permission (verify)

Make sure the role has this policy (it should from the original setup):

```json
{
    "Effect": "Allow",
    "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:DeleteItem"
    ],
    "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/cognivault-data",
        "arn:aws:dynamodb:us-east-1:*:table/cognivault-data/index/*"
    ]
}
```

---

## 4. Update Lambda Environment Variables

### Step 4.1: Set environment variables

1. Go to **Lambda** → **cognivault-backend** → **Configuration** → **Environment variables**
2. Click **Edit**
3. Add/update these variables:

| Key | Value |
|-----|-------|
| `ENVIRONMENT` | `dev` |
| `TABLE_NAME` | `cognivault-data` |
| `PRIMARY_MODEL_ID` | `meta.llama4-maverick-17b-instruct-v1:0` |
| `FALLBACK_MODEL_ID` | `meta.llama3-1-8b-instruct-v1:0` |
| `BEDROCK_REGION` | `us-east-1` |
| `LOG_LEVEL` | `INFO` |
| `DAILY_BUDGET_USD` | `50` |
| `REQUIRE_AUTH` | `false` |
| `ALLOWED_ORIGINS` | `*` |
| `ENABLE_COST_TRACKING` | `true` |
| `ENABLE_RATE_LIMITING` | `true` |
| `ENABLE_FALLBACK_MODEL` | `true` |
| `ENABLE_RULE_BASED_FALLBACK` | `true` |
| `RATE_LIMIT_PER_MINUTE` | `30` |
| `MAX_EXPLANATION_CHARS` | `10000` |
| `METRICS_NAMESPACE` | `Cognivault` |

4. Click **Save**

---

## 5. Update API Gateway Routes for /v1/

You need to add the /v1/ versioned routes alongside the existing routes.

### Step 5.1: Open API Gateway

1. Go to **AWS Console** → **API Gateway**
2. Click on your API (the one connected to cognivault-backend)
3. Click **Resources** in the left sidebar

### Step 5.2: Create /v1 resource

1. Click the **/** (root) resource
2. Click **Create Resource**
3. Resource Name: `v1`
4. Resource Path: `v1`
5. Check **Enable API Gateway CORS**
6. Click **Create Resource**

### Step 5.3: Create /v1/analyze

1. Click on **/v1**
2. Click **Create Resource**
3. Resource Name: `analyze`
4. Resource Path: `analyze`
5. Click **Create Resource**
6. Click on **/v1/analyze**
7. Click **Create Method** → Select **POST** → Click checkmark
8. Integration type: **Lambda Function**
9. Check **Use Lambda Proxy integration**
10. Lambda Function: `cognivault-backend`
11. Click **Save** → **OK** (for permission prompt)

### Step 5.4: Create /v1/evidence

1. Click on **/v1**
2. **Create Resource** → Name: `evidence` → **Create**
3. Click on **/v1/evidence** → **Create Method** → **POST**
4. Lambda Proxy integration → `cognivault-backend` → **Save** → **OK**

### Step 5.5: Create /v1/mental-model/{userId}

1. Click on **/v1**
2. **Create Resource** → Name: `mental-model` → **Create**
3. Click on **/v1/mental-model**
4. **Create Resource** → Name: `{userId}` → Resource Path: `{userId}` → **Create**
5. Click on **/v1/mental-model/{userId}** → **Create Method** → **GET**
6. Lambda Proxy integration → `cognivault-backend` → **Save** → **OK**

### Step 5.6: Create /v1/interventions/{conceptId}

1. Click on **/v1**
2. **Create Resource** → Name: `interventions` → **Create**
3. Click on **/v1/interventions**
4. **Create Resource** → Name: `{conceptId}` → Resource Path: `{conceptId}` → **Create**
5. Click on **/v1/interventions/{conceptId}** → **Create Method** → **GET**
6. Lambda Proxy integration → `cognivault-backend` → **Save** → **OK**

### Step 5.7: Create /v1/mental-model/{userId}/concepts/{conceptId}/understood

1. Navigate to **/v1/mental-model/{userId}**
2. **Create Resource** → Name: `concepts` → **Create**
3. Click on **concepts** → **Create Resource** → Name: `{conceptId}` → **Create**
4. Click on **{conceptId}** → **Create Resource** → Name: `understood` → **Create**
5. Click on **understood** → **Create Method** → **PUT**
6. Lambda Proxy integration → `cognivault-backend` → **Save** → **OK**

### Step 5.8: Deploy the API

1. Click **Actions** → **Deploy API**
2. Deployment stage: Select your existing stage (e.g., `prod` or `dev`)
3. Click **Deploy**

---

## 6. Enable CORS on API Gateway

CORS must be enabled on every resource that your frontend calls.

### For each resource (/v1/analyze, /v1/evidence, etc.):

1. Click on the resource (e.g., `/v1/analyze`)
2. Click **Enable CORS** (button at top)
3. Set these values:
   - Access-Control-Allow-Origin: `*` (or your frontend domain in prod)
   - Access-Control-Allow-Headers: `Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Correlation-Id`
   - Access-Control-Allow-Methods: Check all that apply (GET, POST, PUT, OPTIONS)
4. Click **Enable CORS and replace existing CORS headers**
5. Click **Yes, replace existing values**

### After enabling CORS on all resources:

1. Click **Actions** → **Deploy API**
2. Select your stage → **Deploy**

---

## 7. Test All Endpoints

Open PowerShell and run these commands. Replace the URL with your API Gateway URL.

### Test POST /v1/analyze

```powershell
$body = @{
    concept = "closures"
    explanation = "Closures are functions that remember variables from their enclosing scope even after the outer function has finished executing. For example, a closure can capture a counter variable and increment it each time the inner function is called."
    userId = "test-user-001"
} | ConvertTo-Json

Invoke-RestMethod `
    -Method POST `
    -Uri "https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/v1/analyze" `
    -ContentType "application/json" `
    -Body $body | ConvertTo-Json -Depth 10
```

### Test GET /v1/mental-model/{userId}

```powershell
Invoke-RestMethod `
    -Method GET `
    -Uri "https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/v1/mental-model/test-user-001" | ConvertTo-Json -Depth 10
```

### Test GET /v1/interventions/{conceptId}

```powershell
Invoke-RestMethod `
    -Method GET `
    -Uri "https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/v1/interventions/closures?userId=test-user-001" | ConvertTo-Json -Depth 10
```

### Test PUT understood

```powershell
Invoke-RestMethod `
    -Method PUT `
    -Uri "https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/v1/mental-model/test-user-001/concepts/closures/understood" `
    -ContentType "application/json" | ConvertTo-Json -Depth 10
```

### Expected Results

- `/v1/analyze` → Returns `conceptId`, `understandingLevel`, `confidence`, `debtIndicators`, `microIntervention`, `modelUsed`
- `/v1/mental-model/{userId}` → Returns `userId`, `concepts`, `edges`, `overallProgress`
- `/v1/interventions/{conceptId}` → Returns an array of intervention objects
- `understood` → Returns the updated mental model

If Bedrock fails, the response will still work because of the rule-based fallback. The `modelUsed` field will show `rule-based-fallback`.

---

## 8. Enable Cognito Authentication

### Step 8.1: Create a User Pool

1. Go to **AWS Console** → **Amazon Cognito**
2. Click **Create user pool**
3. **Step 1 — Sign-in experience:**
   - Sign-in options: Check **Email**
   - Click **Next**
4. **Step 2 — Security requirements:**
   - Password policy: **Cognito defaults** (or customize)
   - MFA: **No MFA** (for hackathon; enable in prod)
   - Click **Next**
5. **Step 3 — Sign-up experience:**
   - Allow self-registration: **Yes** (for hackathon)
   - Required attributes: **email**
   - Click **Next**
6. **Step 4 — Message delivery:**
   - Email: **Send email with Cognito** (free for < 50 emails/day)
   - Click **Next**
7. **Step 5 — Integrate your app:**
   - User pool name: `cognivault-users`
   - App client name: `cognivault-web`
   - Client secret: **Don't generate a client secret** (important for SPA)
   - Click **Next**
8. **Step 6 — Review and create:**
   - Click **Create user pool**

### Step 8.2: Note the IDs

1. Click on your new user pool
2. Copy **User pool ID** (e.g., `us-east-1_AbCdEfGhI`)
3. Click **App integration** → **App client list**
4. Copy **Client ID** (e.g., `1234567890abcdef`)

### Step 8.3: Update Lambda environment variables

1. Go to **Lambda** → **cognivault-backend** → **Configuration** → **Environment variables** → **Edit**
2. Update:
   - `COGNITO_USER_POOL_ID` = `us-east-1_AbCdEfGhI` (your value)
   - `COGNITO_APP_CLIENT_ID` = `1234567890abcdef` (your value)
   - `REQUIRE_AUTH` = `true` (when ready to enforce)
3. Click **Save**

### Step 8.4: Add Cognito Authorizer to API Gateway (optional defense-in-depth)

1. Go to **API Gateway** → your API
2. Click **Authorizers** in the left sidebar
3. Click **Create New Authorizer**
4. Name: `CognitoAuth`
5. Type: **Cognito**
6. Cognito User Pool: Select `cognivault-users`
7. Token source: `Authorization`
8. Click **Create**

To apply to specific methods:
1. Go to **Resources** → click a method (e.g., POST under /v1/analyze)
2. Click **Method Request**
3. Under **Authorization**, select **CognitoAuth**
4. Click the checkmark to save
5. Repeat for all methods you want to protect
6. **Deploy API** again

---

## 9. Set Up Rate Limiting with WAF

### Step 9.1: Create a WAF Web ACL

1. Go to **AWS Console** → **WAF & Shield**
2. Click **Web ACLs** → **Create web ACL**
3. Name: `cognivault-waf`
4. Resource type: **Regional resources**
5. Region: **US East (N. Virginia)**
6. Click **Next**

### Step 9.2: Add rate limiting rule

1. Click **Add rules** → **Add my own rules and rule groups**
2. Rule type: **Rate-based rule**
3. Name: `rate-limit-per-ip`
4. Rate limit: `1000` (requests per 5-minute window per IP)
5. Action: **Block**
6. Click **Add rule**
7. Click **Next** → **Next** → **Next** → **Create web ACL**

### Step 9.3: Associate with API Gateway

1. In the Web ACL, click **Associated AWS resources** tab
2. Click **Add AWS resources**
3. Resource type: **Amazon API Gateway REST API**
4. Select your API + stage
5. Click **Add**

---

## 10. Create CloudWatch Alarms

### Step 10.1: Lambda Error Alarm

1. Go to **AWS Console** → **CloudWatch** → **Alarms** → **Create alarm**
2. Click **Select metric**
3. Navigate: **Lambda** → **By Function Name** → find `cognivault-backend`
4. Select **Errors** → Click **Select metric**
5. Statistic: **Sum**
6. Period: **5 minutes**
7. Threshold: **Greater than 5**
8. Click **Next**
9. Notification: **Create new topic** → Name: `cognivault-alerts` → Email: your-email@example.com
10. Click **Create topic**
11. Alarm name: `cognivault-lambda-errors`
12. Click **Create alarm**

**IMPORTANT:** Check your email and click the confirmation link from AWS SNS.

### Step 10.2: Lambda Duration Alarm

1. **Create alarm** → **Select metric**
2. **Lambda** → **By Function Name** → `cognivault-backend` → **Duration**
3. Statistic: **p99**
4. Period: **5 minutes**
5. Threshold: **Greater than 10000** (10 seconds)
6. Notification: Use existing topic `cognivault-alerts`
7. Name: `cognivault-lambda-p99-latency`
8. **Create alarm**

### Step 10.3: API Gateway 5xx Alarm

1. **Create alarm** → **Select metric**
2. **ApiGateway** → **By API Name** → your API → **5XXError**
3. Statistic: **Sum**
4. Period: **5 minutes**
5. Threshold: **Greater than 10**
6. Notification: `cognivault-alerts`
7. Name: `cognivault-api-5xx`
8. **Create alarm**

---

## 11. Create Cost Alerts (AWS Budgets)

### Step 11.1: Create a monthly budget

1. Go to **AWS Console** → **Billing** → **Budgets** (left sidebar)
2. Click **Create a budget**
3. Budget type: **Cost budget**
4. Name: `cognivault-monthly`
5. Budget amount: `$50.00` per month (adjust to your needs)
6. Click **Next**

### Step 11.2: Add alert thresholds

1. Alert 1: Threshold **80%** of budgeted amount → **Forecasted**
   - Email: your-email@example.com
2. Alert 2: Threshold **100%** of budgeted amount → **Actual**
   - Email: your-email@example.com
3. Click **Next** → **Create budget**

### Step 11.3: Create a daily Bedrock budget

1. **Create a budget** → **Cost budget**
2. Name: `cognivault-bedrock-daily`
3. Period: **Daily**
4. Amount: `$10.00`
5. Filter: **Service** → Select **Amazon Bedrock**
6. Add alert at **80%** and **100%**
7. **Create budget**

---

## 12. Enable Dead Letter Queue (DLQ)

A DLQ captures failed Lambda invocations for debugging.

### Step 12.1: Create the SQS queue

1. Go to **AWS Console** → **SQS** → **Create queue**
2. Type: **Standard**
3. Name: `cognivault-dlq`
4. Message retention: **14 days**
5. Click **Create queue**
6. Copy the **ARN** (e.g., `arn:aws:sqs:us-east-1:123456789:cognivault-dlq`)

### Step 12.2: Attach DLQ to Lambda

1. Go to **Lambda** → **cognivault-backend** → **Configuration**
2. Click **Asynchronous invocation** → **Edit**
3. DLQ resource: Select **SQS queue**
4. SQS queue: Select `cognivault-dlq`
5. Maximum retry attempts: **2**
6. Click **Save**

### Step 12.3: Add SQS permission to Lambda role

1. Go to the Lambda's **Execution role** (Configuration → Permissions)
2. **Add permissions** → **Attach policies**
3. Search for `AmazonSQSFullAccess` → Attach

> In production, create a custom policy limited to `sqs:SendMessage` on the DLQ ARN only.

---

## 13. Create Staging + Prod Environments

### Option A: Using API Gateway Stages (Quick)

1. Go to **API Gateway** → your API → **Stages**
2. Click **Create Stage**
3. Stage name: `staging`
4. Deployment: Select the latest
5. Click **Create**
6. Repeat for `prod`

Now you have:
- `https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/dev/v1/analyze`
- `https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/staging/v1/analyze`
- `https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/v1/analyze`

### Option B: Separate Stacks with SAM (Recommended for production)

```powershell
# Deploy dev
cd c:\Hackthon\cognivault\backend\v2
sam build
sam deploy --config-env default

# Deploy staging
sam deploy --config-env staging

# Deploy prod
sam deploy --config-env prod
```

This creates completely isolated resources (separate Lambda, DynamoDB table, API Gateway) per environment.

---

## 14. Use Parameter Store for Secrets

### Step 14.1: Store secrets in Parameter Store

1. Go to **AWS Console** → **Systems Manager** → **Parameter Store**
2. Click **Create parameter**
3. Create these parameters:

| Name | Type | Value |
|------|------|-------|
| `/cognivault/dev/table_name` | String | `cognivault-data` |
| `/cognivault/dev/primary_model_id` | String | `meta.llama4-maverick-17b-instruct-v1:0` |
| `/cognivault/dev/daily_budget_usd` | String | `50` |
| `/cognivault/prod/cognito_user_pool_id` | SecureString | `us-east-1_...` |
| `/cognivault/prod/cognito_app_client_id` | SecureString | `abcdef...` |

### Step 14.2: Enable in Lambda

1. Go to **Lambda** → **cognivault-backend** → **Environment variables** → **Edit**
2. Add:
   - `USE_PARAMETER_STORE` = `true`
   - `SSM_PREFIX` = `/cognivault/dev`
3. **Save**

### Step 14.3: Add SSM permission to Lambda role

1. Go to the Lambda's execution role
2. **Add permissions** → **Create inline policy** → **JSON**:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ssm:GetParametersByPath",
                "ssm:GetParameter"
            ],
            "Resource": "arn:aws:ssm:us-east-1:*:parameter/cognivault/*"
        }
    ]
}
```

3. Policy name: `CognivaultSSMRead` → **Create policy**

### Rotating Secrets

1. Go to **Parameter Store**
2. Click the parameter you want to rotate
3. Click **Edit** → Change the value → **Save changes**
4. Go to **Lambda** → Click **Deploy** (no code change needed — the Lambda reads on cold start)
5. To force re-read: **Lambda** → **Configuration** → **General configuration** → Change memory by 1MB and save → Change back. This forces a cold start.

---

## 15. Enable X-Ray Tracing

### Step 15.1: Enable on Lambda

1. Go to **Lambda** → **cognivault-backend** → **Configuration**
2. Click **Monitoring and operations tools** → **Edit**
3. Under **AWS X-Ray**: Check **Active tracing**
4. Click **Save**

### Step 15.2: Enable on API Gateway

1. Go to **API Gateway** → your API → **Stages**
2. Click your stage (e.g., `prod`)
3. Click **Logs/Tracing** tab
4. Check **Enable X-Ray Tracing**
5. Click **Save Changes**

### Step 15.3: View traces

1. Go to **CloudWatch** → **X-Ray traces** → **Service map**
2. You'll see a visual map: API Gateway → Lambda → DynamoDB → Bedrock
3. Click on any node to see latency breakdown

---

## 16. Set Up CI/CD Pipeline

### Step 16.1: Push code to GitHub/CodeCommit

```powershell
cd c:\Hackthon\cognivault\backend\v2
git init
git add .
git commit -m "Cognivault v2 — production backend"
git remote add origin https://github.com/YOUR-USERNAME/cognivault-backend.git
git push -u origin main
```

### Step 16.2: Create CodePipeline

1. Go to **AWS Console** → **CodePipeline** → **Create pipeline**
2. Pipeline name: `cognivault-deploy`
3. Service role: **New service role**
4. Click **Next**

### Step 16.3: Source stage

1. Source provider: **GitHub (Version 2)** or **CodeCommit**
2. Connect to your repo
3. Branch: `main`
4. Click **Next**

### Step 16.4: Build stage

1. Build provider: **AWS CodeBuild**
2. Click **Create project**
3. Project name: `cognivault-build`
4. Environment: **Managed image** → **Amazon Linux** → **Standard** → **aws/codebuild/amazonlinux-x86_64-standard:5.0**
5. Buildspec: **Use a buildspec file** (it's already in the repo: `buildspec.yml`)
6. Environment variables: Add `ENVIRONMENT` = `dev`
7. Click **Continue to CodePipeline** → **Next**

### Step 16.5: Deploy stage

1. Skip deploy stage (SAM deploy happens in buildspec)
2. Click **Create pipeline**

Now every push to `main` triggers: build → sam build → sam deploy.

---

## 17. Deploy Safely (Canary Deployments)

The SAM template already includes canary deployment configuration for prod:

```yaml
DeploymentPreference:
  Type: Canary10Percent5Minutes
```

This means:
- 10% of traffic goes to the new version
- Wait 5 minutes
- If the error alarm fires → automatic rollback
- If no errors → shift remaining 90% of traffic

### Manual rollback (if needed)

1. Go to **Lambda** → **cognivault-backend**
2. Click **Aliases** tab
3. Click **live**
4. Click **Edit**
5. Change the version to the previous working version
6. Click **Save**

---

## 18. Connect Frontend to v2 API

### Step 18.1: Update the frontend .env

Open `c:\Hackthon\cognivault\.env` (or `.env.local`):

```
VITE_API_BASE_URL=https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/v1
```

> Note the `/v1` at the end. This uses the versioned API.

### Step 18.2: Update API endpoints in frontend

If your frontend currently calls `/analyze`, update to `/v1/analyze`.
Or keep the old paths — the v2 backend supports both.

### Step 18.3: Handle the new error format

The v2 API returns errors in this format:

```json
{
    "error": {
        "code": "VALIDATION_ERROR",
        "message": "concept is required",
        "requestId": "abc123"
    }
}
```

Update your frontend error handling to use `response.data.error.message` instead of `response.data.detail`.

---

## 19. Production Checklist

Before going live, verify all items:

### Security
- [ ] `REQUIRE_AUTH` = `true` in Lambda env vars
- [ ] Cognito User Pool created and configured
- [ ] API Gateway Cognito Authorizer attached to all methods
- [ ] WAF rate limiting rule active
- [ ] `ALLOWED_ORIGINS` set to your actual frontend domain (not `*`)
- [ ] Lambda execution role follows least privilege (no `*` resources)
- [ ] DynamoDB encryption at rest enabled (on by default)

### Cost Protection
- [ ] AWS Budget created with email alerts at 80% and 100%
- [ ] `DAILY_BUDGET_USD` set to a reasonable value
- [ ] `ENABLE_COST_TRACKING` = `true`
- [ ] `MAX_EXPLANATION_CHARS` = `10000` (prevents huge inputs)
- [ ] `RATE_LIMIT_PER_MINUTE` = `30` (prevents abuse)

### Observability
- [ ] CloudWatch error alarm created and email confirmed
- [ ] CloudWatch latency alarm created
- [ ] X-Ray tracing enabled on Lambda and API Gateway
- [ ] Log retention set (14 days dev, 90 days prod)
- [ ] CloudWatch Insights queries tested

### Reliability
- [ ] DLQ created and attached to Lambda
- [ ] DynamoDB Point-in-Time Recovery enabled (prod)
- [ ] DynamoDB TTL enabled on `ttl` attribute
- [ ] Fallback model configured (`ENABLE_FALLBACK_MODEL` = `true`)
- [ ] Rule-based fallback enabled (`ENABLE_RULE_BASED_FALLBACK` = `true`)

### Deployment
- [ ] CI/CD pipeline tested (push → build → deploy)
- [ ] Canary deployment configured for prod
- [ ] Staging environment tested before prod deploy
- [ ] Rollback procedure documented and tested

### Testing
- [ ] All 5 endpoints return correct responses
- [ ] Error responses follow standard format
- [ ] CORS works from frontend domain
- [ ] Rate limiting triggers at configured threshold
- [ ] Fallback works when Bedrock is disabled

---

## Quick Reference: API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/analyze` | Analyze concept understanding |
| POST | `/v1/evidence` | Submit evidence for analysis |
| GET | `/v1/mental-model/{userId}` | Get user's mental model |
| GET | `/v1/interventions/{conceptId}?userId=X` | Get interventions |
| PUT | `/v1/mental-model/{userId}/concepts/{conceptId}/understood` | Mark understood |

## Quick Reference: Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TABLE_NAME` | Yes | `cognivault-data` | DynamoDB table name |
| `PRIMARY_MODEL_ID` | Yes | `meta.llama4-maverick-17b-instruct-v1:0` | Primary AI model |
| `FALLBACK_MODEL_ID` | No | `meta.llama3-1-8b-instruct-v1:0` | Fallback AI model |
| `ENVIRONMENT` | No | `dev` | dev / staging / prod |
| `LOG_LEVEL` | No | `INFO` | DEBUG / INFO / WARNING / ERROR |
| `REQUIRE_AUTH` | No | `false` | Require Cognito JWT |
| `DAILY_BUDGET_USD` | No | `50` | Daily Bedrock cost limit |
| `RATE_LIMIT_PER_MINUTE` | No | `30` | Per-user request limit |
| `ALLOWED_ORIGINS` | No | `*` | CORS allowed origins |
