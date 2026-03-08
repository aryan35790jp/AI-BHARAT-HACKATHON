export type UnderstandingLevel = 'unknown' | 'surface' | 'partial' | 'solid' | 'deep';

export type DebtType =
  | 'circular'
  | 'parroting'
  | 'logical_jump'
  | 'confidence_mismatch'
  | 'wrong_reasoning';

export type InterventionType =
  | 'clarification'
  | 'counter_example'
  | 'mental_model'
  | 'aha_bridge';

export type EvidenceType = 'explanation' | 'code' | 'qa_reasoning';

export interface DebtIndicator {
  type: DebtType;
  severity: number;
  evidence: string;
  explanation: string;
}

export interface ConceptUnderstanding {
  conceptId: string;
  level: UnderstandingLevel;
  confidence: number;
  debtIndicators: DebtIndicator[];
  lastAssessed: string;
  evidenceCount: number;
}

export interface ConceptEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface UnderstandingMap {
  userId: string;
  concepts: ConceptUnderstanding[];
  overallProgress: number;
}

export interface MentalModelGraph extends UnderstandingMap {
  edges: ConceptEdge[];
}

export interface InterventionContent {
  title: string;
  explanation: string;
  examples: string[];
  followUpQuestions: string[];
}

export interface MicroIntervention {
  id: string;
  type: InterventionType;
  targetConcept: string;
  content: InterventionContent;
}

export interface EvidenceSubmission {
  userId: string;
  type: EvidenceType;
  content: string;
  conceptId?: string;
}

export interface EvidenceResponse {
  updatedModel: MentalModelGraph;
  interventions: MicroIntervention[];
}

// ---------- /v1/analyze response ----------

export interface AnalyzeRequest {
  concept: string;
  explanation: string;
  userId: string;
}

export interface AnalyzeResponse {
  conceptId: string;
  understandingLevel: UnderstandingLevel;
  confidence: number;
  debtIndicators: DebtIndicator[];
  microIntervention: {
    id: string;
    type: InterventionType;
    targetConcept: string;
    content: InterventionContent;
  } | null;
  missingConcepts?: string[];
  suggestedExplanation?: string | null;
  nextQuestion?: string | null;
  modelUsed: string;
  relatedConcepts?: string[];
  prerequisites?: string[];
}

// ---------- Inspector discriminated union ----------

export type InspectedNode =
  | { kind: 'analyzed'; data: AnalyzeResponse }
  | { kind: 'satellite'; conceptName: string; parentConcept?: string };
