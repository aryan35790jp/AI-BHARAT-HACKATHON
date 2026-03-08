"""
POST /stream-analyze  ← Lambda Function URL (RESPONSE_STREAM mode)

This handler is NOT called through API Gateway. It is invoked directly via
the Lambda Function URL which has InvokeMode=RESPONSE_STREAM. That's what
allows Python generators to stream bytes to the browser before the function
returns.

Flow:
  1. Immediately yield a "thinking" SSE event (user sees a response <50 ms)
  2. Run the full analysis (2-4 s, same as the normal /v1/analyze endpoint)
  3. Format the result as human-readable text (same logic as the frontend did)
  4. Yield words one at a time (25 ms apart) so text types out like ChatGPT
  5. Yield a final [ANALYSIS] SSE event carrying the complete JSON result
  6. Yield [DONE] so the frontend knows the stream is finished

Architecture Decision:
  The generator pattern is used (instead of awslambda.streamifyResponse) because:
  - It works in Python 3.12 without extra imports
  - It requires zero changes to the dependency graph
  - Lambda streams each `yield` immediately when InvokeMode=RESPONSE_STREAM
"""

import json
import logging
import time

from services.analysis import AnalysisService

logger = logging.getLogger("cognivault.handlers.stream_analyze")


# ---------------------------------------------------------------------------
# Response text formatter  (mirrors frontend formatAiResponse exactly)
# ---------------------------------------------------------------------------

def _format_response_text(result: dict, concept: str) -> str:
    """Convert an AnalyzeResponse dict into the human-readable chat message."""
    pct = round(result.get("confidence", 0) * 100)
    intervention = result.get("microIntervention") or {}
    content = intervention.get("content") or {}
    examples = content.get("examples") or []
    suggested = result.get("suggestedExplanation")
    missing = result.get("missingConcepts") or []
    debts = result.get("debtIndicators") or []
    follow_up = result.get("nextQuestion") or (content.get("followUpQuestions") or [None])[0]

    # ── TEACHING MODE : confidence < 30 % ────────────────────────────────
    if pct < 30:
        lines = []
        if pct < 5:
            lines.append(f"**No explanation detected.** Let me introduce you to **{concept}**.")
        else:
            lines.append(
                f"**{pct}% confidence** — It looks like you're not familiar with "
                f"**{concept}** yet. Let me explain it."
            )
        lines.append("")

        explanation_text = suggested or content.get("explanation")
        if explanation_text:
            lines.append(f"**What is {concept}?**")
            lines.append(explanation_text)
            lines.append("")

        if examples:
            lines.append("**Example:**")
            lines.append(examples[0])
            lines.append("")

        if len(examples) > 1:
            lines.append("**Think of it like this:**")
            lines.append(examples[1])
            lines.append("")

        if follow_up:
            lines.append("**Quick question for you:**")
            lines.append(follow_up)

        return "\n".join(lines)

    # ── IMPROVEMENT MODE : 30–60 % ────────────────────────────────────────
    if pct < 60:
        level = result.get("understandingLevel", "surface")
        text = (
            f"**{pct}% confidence** — You have a **{level}**-level grasp of "
            f"**{concept}**. Let's strengthen it."
        )
        if content.get("explanation"):
            text += f"\n\n{content['explanation']}"
        if examples:
            text += f"\n\n**Example:** {examples[0]}"
        if missing:
            text += f"\n\n**Key gaps:** {', '.join(missing)}"
        elif debts:
            text += "\n\n**Gaps to address:**\n" + "\n".join(f"• {d.get('explanation', '')}" for d in debts)
        if follow_up:
            text += f"\n\n→ {follow_up}"
        text += "\n\nTry explaining again — I track your progress!"
        return text

    # ── REINFORCEMENT MODE : > 60 % ───────────────────────────────────────
    level = result.get("understandingLevel", "solid")
    text = (
        f"**{pct}% confidence** — Great job! Your **{level}**-level understanding "
        f"of **{concept}** is solid."
    )
    if debts:
        text += "\n\n**Areas to strengthen:**\n" + "\n".join(f"• {d.get('explanation', '')}" for d in debts)
    if missing:
        text += f"\n\n**Consider covering:** {', '.join(missing)}"
    if follow_up:
        text += f"\n\n→ {follow_up}"
    return text


# ---------------------------------------------------------------------------
# Streaming generator
# ---------------------------------------------------------------------------

def stream_analyze_generator(event: dict, analysis_service: AnalysisService):
    """
    Generator that produces SSE-formatted bytes.

    Returned by streaming_handler() so that Lambda streams each yielded
    value immediately to the browser over the Function URL.
    """
    # ── 1. Parse request ──────────────────────────────────────────────────
    try:
        raw_body = event.get("body", "{}")
        body = json.loads(raw_body) if isinstance(raw_body, str) else (raw_body or {})
        concept = str(body.get("concept", "")).strip()
        explanation = str(body.get("explanation", "")).strip()
    except Exception as exc:
        logger.error("Failed to parse streaming request body: %s", exc)
        yield b"data: " + json.dumps({"error": "invalid request body"}).encode() + b"\n\n"
        yield b"data: [DONE]\n\n"
        return

    if not concept or not explanation:
        yield b"data: " + json.dumps({"error": "concept and explanation are required"}).encode() + b"\n\n"
        yield b"data: [DONE]\n\n"
        return

    # ── 2. Thinking status (arrives at browser in < 50 ms) ────────────────
    yield b"data: " + json.dumps({"status": "thinking"}).encode() + b"\n\n"

    # ── 3. Run analysis ───────────────────────────────────────────────────
    try:
        result_obj = analysis_service.analyze(
            concept=concept,
            explanation=explanation,
            evidence_type="verbal_explanation",
            user_id="stream",
        )
        result_dict = result_obj.to_dict() if hasattr(result_obj, "to_dict") else vars(result_obj)
    except Exception as exc:
        logger.error("Analysis failed during streaming: %s", exc)
        yield b"data: " + json.dumps({"error": str(exc)}).encode() + b"\n\n"
        yield b"data: [DONE]\n\n"
        return

    # ── 4. Format human-readable text ─────────────────────────────────────
    try:
        text = _format_response_text(result_dict, concept)
    except Exception as exc:
        logger.warning("Formatting failed, falling back: %s", exc)
        text = f"Analysis complete. Confidence: {round(result_dict.get('confidence', 0) * 100)}%"

    # ── 5. Stream words (25 ms per word → ~40 wpm — ChatGPT pace) ─────────
    words = text.split(" ")
    for word in words:
        token_event = json.dumps({"token": word + " "})
        yield b"data: " + token_event.encode() + b"\n\n"
        time.sleep(0.025)

    # ── 6. Send full analysis JSON so the frontend can update the graph ────
    try:
        analysis_event = json.dumps({"analysis": result_dict})
        yield b"data: " + analysis_event.encode() + b"\n\n"
    except Exception as exc:
        logger.error("Failed to serialize analysis for stream: %s", exc)

    # ── 7. Done ───────────────────────────────────────────────────────────
    yield b"data: [DONE]\n\n"
