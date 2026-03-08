import client from './client';
import type {
  MentalModelGraph,
  EvidenceSubmission,
  EvidenceResponse,
  MicroIntervention,
  AnalyzeRequest,
  AnalyzeResponse,
} from '../types/models';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function apiFetch<T>(path: string, init?: RequestInit, retryCount = 0): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    if (response.status >= 500 && retryCount < 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return apiFetch<T>(path, init, retryCount + 1);
    }

    let detail = '';
    try {
      detail = await response.text();
    } catch {
      // ignore body parse failures
    }

    throw new Error(detail || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const fetchMentalModel = async (
  userId: string
): Promise<MentalModelGraph> => {
  return apiFetch<MentalModelGraph>(`/mental-model/${userId}`);
};

export const submitEvidence = async (
  evidence: EvidenceSubmission
): Promise<EvidenceResponse> => {
  const response = await client.post<EvidenceResponse>('/evidence', evidence);
  return response.data;
};

export const fetchInterventions = async (
  conceptId: string,
  userId: string
): Promise<MicroIntervention[]> => {
  const query = new URLSearchParams({ userId }).toString();
  return apiFetch<MicroIntervention[]>(`/interventions/${conceptId}?${query}`);
};

export const markConceptUnderstood = async (
  userId: string,
  conceptId: string
): Promise<MentalModelGraph> => {
  return apiFetch<MentalModelGraph>(
    `/mental-model/${userId}/concepts/${conceptId}/understood`,
    { method: 'PUT' }
  );
};

export const analyzeConcept = async (
  request: AnalyzeRequest
): Promise<AnalyzeResponse> => {
  return apiFetch<AnalyzeResponse>('/v1/analyze', {
    method: 'POST',
    body: JSON.stringify(request),
  });
};

export interface ExpandConceptResponse {
  concept: string;
  domain: string;
  concepts: string[];
}

/**
 * Static fallback concepts per domain — used when the backend endpoint is unavailable.
 */
const DOMAIN_FALLBACK_CONCEPTS: Record<string, string[]> = {
  programming: ['Variables', 'Functions', 'Data Structures', 'Algorithms', 'APIs', 'Databases', 'Testing', 'Deployment', 'Version Control', 'Design Patterns'],
  mathematics: ['Algebra', 'Calculus', 'Geometry', 'Statistics', 'Probability', 'Number Theory', 'Logic', 'Trigonometry', 'Linear Algebra', 'Proofs'],
  physics: ['Mechanics', 'Thermodynamics', 'Electromagnetism', 'Quantum Mechanics', 'Relativity', 'Gravity', 'Waves', 'Energy', 'Optics', 'Nuclear Physics'],
  chemistry: ['Atomic Structure', 'Chemical Bonds', 'Reactions', 'Periodic Table', 'Organic Chemistry', 'Acids & Bases', 'Electrochemistry', 'Polymers', 'Stoichiometry', 'Thermochemistry'],
  biology: ['Cell Biology', 'Genetics', 'Evolution', 'Ecology', 'Anatomy', 'Physiology', 'Microbiology', 'Biochemistry', 'Neuroscience', 'Taxonomy'],
  history: ['Civilizations', 'Wars & Conflicts', 'Political Systems', 'Cultural Movements', 'Economic History', 'Social History', 'Technology in History', 'Leaders & Figures', 'Treaties & Documents', 'Revolutions'],
  economics: ['Supply & Demand', 'Markets', 'Trade', 'Finance', 'Monetary Policy', 'Fiscal Policy', 'Game Theory', 'Microeconomics', 'Macroeconomics', 'Development Economics'],
  psychology: ['Perception', 'Memory', 'Emotion', 'Personality', 'Behavior', 'Cognitive Psychology', 'Social Psychology', 'Mental Health', 'Development', 'Neuroscience'],
  philosophy: ['Ethics', 'Logic', 'Epistemology', 'Metaphysics', 'Existentialism', 'Political Philosophy', 'Moral Theory', 'Philosophy of Mind', 'Rationalism', 'Free Will'],
  sociology: ['Social Structures', 'Culture', 'Inequality', 'Institutions', 'Globalization', 'Norms & Values', 'Conflict Theory', 'Community', 'Stratification', 'Social Change'],
  literature: ['Poetry', 'Prose', 'Narrative', 'Themes', 'Symbolism', 'Genre', 'Character', 'Setting', 'Literary Devices', 'Author Intent'],
  geography: ['Continents', 'Climate Zones', 'Topography', 'Oceans', 'Biomes', 'Geopolitics', 'Natural Resources', 'Urban Geography', 'Plate Tectonics', 'Cartography'],
  law: ['Constitutional Law', 'Criminal Law', 'Civil Law', 'Contracts', 'Torts', 'Human Rights', 'Judiciary', 'Due Process', 'Legislation', 'International Law'],
  art: ['Painting', 'Sculpture', 'Design', 'Color Theory', 'Composition', 'Architecture', 'Photography', 'Art Movements', 'Aesthetics', 'Illustration'],
  general: ['Core Concepts', 'Fundamentals', 'History', 'Applications', 'Key Figures', 'Related Fields', 'Current Research', 'Controversies', 'Definitions', 'Examples'],
};

/**
 * Call the LLM to generate domain-specific related concepts for a given concept.
 * Used to populate cognitive map satellite nodes dynamically.
 * Falls back to static domain concepts if the endpoint is unavailable.
 */
export const expandConcept = async (
  concept: string
): Promise<ExpandConceptResponse> => {
  try {
    const response = await client.post<ExpandConceptResponse>(
      '/v1/expand-concept',
      { concept }
    );
    return response.data;
  } catch {
    // Graceful degradation — endpoint not deployed; use static domain fallback
    const { detectDomain } = await import('../utils/domainDetection');
    const domain = detectDomain(concept);
    const pool = DOMAIN_FALLBACK_CONCEPTS[domain] ?? DOMAIN_FALLBACK_CONCEPTS.general;
    // Return 6 concepts, excluding any that match the concept itself
    const lower = concept.toLowerCase();
    const filtered = pool.filter(c => !c.toLowerCase().includes(lower) && !lower.includes(c.toLowerCase()));
    return { concept, domain, concepts: filtered.slice(0, 6) };
  }
};

// ---------------------------------------------------------------------------
// True SSE streaming via Lambda Function URL (InvokeMode=RESPONSE_STREAM)
// ---------------------------------------------------------------------------

export interface StreamAnalyzeParams {
  concept: string;
  explanation: string;
  userId: string;
}

/**
 * Opens a streaming fetch to the Lambda Function URL and calls back as
 * tokens, the full analysis JSON, or [DONE] arrive.
 *
 * The Function URL must have InvokeMode=RESPONSE_STREAM and the backend
 * `streaming_handler` in entrypoint.py as its handler.
 *
 * VITE_STREAM_URL should be set to the raw Function URL (no trailing slash),
 * e.g. https://xxxxxxxxxxxxxxxx.lambda-url.us-east-1.on.aws
 *
 * Returns a cancel function that aborts the in-flight stream.
 */
export function streamAnalyzeConcept(
  params: StreamAnalyzeParams,
  onToken: (token: string) => void,
  onAnalysis: (result: AnalyzeResponse) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const STREAM_BASE = import.meta.env.VITE_STREAM_URL as string | undefined;

  if (!STREAM_BASE) {
    onError('VITE_STREAM_URL is not configured');
    return () => {};
  }

  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${STREAM_BASE}/stream-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!res.ok) {
        onError(`HTTP ${res.status}: ${res.statusText}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { onError('No response body'); return; }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newline
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';   // keep incomplete trailing chunk

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith('data: ')) continue;

          const raw = line.slice(6).trim();
          if (raw === '[DONE]') { onDone(); return; }

          try {
            const msg = JSON.parse(raw) as Record<string, unknown>;
            if (typeof msg.token === 'string') {
              onToken(msg.token);
            } else if (msg.analysis) {
              onAnalysis(msg.analysis as AnalyzeResponse);
            } else if (typeof msg.error === 'string') {
              onError(msg.error);
              return;
            }
            // msg.status === "thinking" is silently consumed — UI already
            // shows the thinking indicator
          } catch {
            // malformed JSON chunk — skip
          }
        }
      }

      // Stream ended without [DONE] (e.g. Lambda timed out)
      onDone();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // user cancelled
      onError(String(err));
    }
  })();

  return () => controller.abort();
}
