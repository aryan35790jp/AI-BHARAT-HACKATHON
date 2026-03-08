# Cognivault – AI-Powered Cognitive Debt Detection System

## 🚀 Overview

Cognivault is an AI-driven learning intelligence system designed to detect **Cognitive Debt** — hidden gaps in conceptual understanding that traditional quizzes and assessments fail to capture.

Instead of evaluating correctness alone, Cognivault analyzes how learners **explain, reason, and apply concepts** to identify fragile, missing, or misunderstood knowledge. The system generates a dynamic **Cognitive Debt Map** and delivers targeted micro-interventions to correct misunderstandings early.

This repository currently contains structured system specifications and planning documents for the Cognitive Debt Mapping engine.

---

## 🧠 Problem Statement

Learners often move forward with false confidence. They may recognize terms and definitions but lack deep conceptual clarity. Existing learning platforms:

- Focus on content delivery
- Evaluate final answers instead of reasoning
- Do not detect hidden conceptual misunderstandings

Cognivault solves this by using foundation models to evaluate reasoning patterns and build a personalized conceptual gap map.

---

## 🗂 Repository Structure
.kiro/specs/cognitive-debt-map/
│
├── design.md
├── requirements.md
└── tasks.md


### 📄 File Descriptions

**design.md**  
Defines the system architecture, reasoning evaluation pipeline, cognitive mapping logic, and AWS integration strategy.

**requirements.md**  
Outlines functional and non-functional requirements including reasoning evaluation criteria, system constraints, performance expectations, and data handling rules.

**tasks.md**  
Breaks down implementation steps into actionable development tasks to guide the build phase of the project.

---

## 🏗 Planned Architecture

Cognivault is designed as a scalable, serverless AI inference pipeline on AWS.

### Frontend
- React (TypeScript)
- D3.js for Cognitive Debt Map visualization

### Backend
- Python-based orchestration
- AWS Lambda for inference execution
- Amazon API Gateway for secure REST endpoints

### AI & Intelligence Layer
- Amazon Bedrock
  - Anthropic Claude 3 Sonnet → reasoning pattern analysis
  - Meta Llama 3 Instruct → cognitive debt classification & micro-intervention generation

### Storage
- Amazon DynamoDB → user reasoning evidence & cognitive graph data
- Amazon S3 → logs and static assets

---

## 🔁 High-Level System Flow

1. User submits explanation of a concept
2. Lambda invokes Amazon Bedrock model
3. Reasoning and conceptual coherence are analyzed
4. Hidden gaps (Cognitive Debt) are identified
5. Results are stored in DynamoDB
6. A Cognitive Debt Map is generated and visualized
7. Targeted AI micro-intervention is delivered

---

## 📊 Key Features

- Cognitive Debt Detection Engine
- Reasoning-based evaluation (not quiz scoring)
- Personalized Cognitive Debt Map
- Confidence vs Understanding mismatch tracking
- Targeted AI-generated micro-interventions
- Domain-agnostic conceptual mapping

---

## 🎯 24-Hour MVP Goal

Once AWS credits are allocated:

- Deploy Lambda-based Bedrock invocation
- Accept explanation input
- Generate structured reasoning analysis
- Store outputs in DynamoDB
- Display preliminary Cognitive Debt output

The goal is to demonstrate an end-to-end AI reasoning pipeline running fully on AWS serverless infrastructure.

---

## 📌 Current Status

✔ System design completed  
✔ Requirements defined  
✔ Implementation tasks structured  
🔄 Development phase beginning (Bedrock + Lambda integration)

---

## 🏆 Hackathon Context

AI for Bharat Hackathon  
Team: Cognivault  
Team Lead: Aryan Maity  

This repository serves as the architectural foundation for the Cognitive Debt detection system.

---

## 📄 License

Hackathon prototype – educational and experimental use.
