"""
Prompt templates for Bedrock model invocations.

Architecture Decision:
  Prompts are separated from model invocation logic.
  This allows:
  - A/B testing different prompts
  - Model-specific prompt tuning
  - Easy auditing of what we send to the model
  - Version control of prompt changes
"""


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
  "relatedConcepts": ["concept_a", "concept_b", "concept_c", "concept_d", "concept_e"],
  "prerequisites": ["prereq_a", "prereq_b", "prereq_c"],
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
- relatedConcepts: ALWAYS list 4-8 concepts closely related to the main concept in the same domain. Use snake_case. These are sibling topics, tools, patterns, or sub-concepts the student should explore next.
- prerequisites: ALWAYS list 2-5 foundational concepts the student must understand BEFORE fully grasping this concept. Use snake_case.
- edges: describe knowledge dependencies between the main concept and its prerequisites
- IMPORTANT: relatedConcepts and prerequisites must NEVER be empty. Always provide meaningful entries.
- Return ONLY valid JSON. No markdown fences. No explanation outside JSON."""


def build_analysis_prompt(
    concept: str,
    explanation: str,
    evidence_type: str,
    prerequisites: list,
) -> str:
    """
    Build the complete prompt for cognitive debt analysis.

    Architecture Decision:
      The system prompt is prepended directly into the prompt string
      because Meta Llama models use a single prompt field (unlike
      Anthropic's separate system parameter). This works well for
      both Llama 4 Maverick and Llama 3.1 8B.
    """
    prereqs_str = ", ".join(prerequisites) if prerequisites else "none known"

    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"Concept being assessed: {concept}\n"
        f"Known prerequisites: {prereqs_str}\n"
        f"Evidence type: {evidence_type}\n\n"
        f"Student's explanation/evidence:\n"
        f"---\n{explanation}\n---\n\n"
        f"Analyze the understanding demonstrated above and return the JSON analysis."
    )
