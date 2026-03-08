import type {
  MentalModelGraph,
  MicroIntervention,
  ConceptUnderstanding,
  EvidenceResponse,
  EvidenceSubmission,
} from '../types/models';

const MOCK_USER_ID = 'mock_user';

const MOCK_CONCEPTS: ConceptUnderstanding[] = [
  {
    conceptId: 'Closures',
    level: 'deep',
    confidence: 0.92,
    debtIndicators: [],
    lastAssessed: '2026-02-25T10:30:00Z',
    evidenceCount: 5,
  },
  {
    conceptId: 'Promises',
    level: 'solid',
    confidence: 0.7,
    debtIndicators: [
      {
        type: 'logical_jump',
        severity: 0.4,
        evidence: 'Skipped explanation of microtask queue ordering.',
        explanation:
          'Your explanation jumped from creating a Promise to .then() handling without addressing how resolved promises are scheduled in the microtask queue.',
      },
    ],
    lastAssessed: '2026-02-24T14:15:00Z',
    evidenceCount: 3,
  },
  {
    conceptId: 'Event Loop',
    level: 'partial',
    confidence: 0.45,
    debtIndicators: [
      {
        type: 'circular',
        severity: 0.6,
        evidence: 'The event loop processes events because it loops over events.',
        explanation:
          'Your reasoning is circular — you defined the event loop in terms of itself without explaining the actual mechanism of the call stack, task queue, and microtask queue.',
      },
      {
        type: 'confidence_mismatch',
        severity: 0.55,
        evidence: 'Stated "I fully understand the event loop" but scored 45% on assessment.',
        explanation:
          'There is a significant gap between your self-reported confidence and your demonstrated understanding.',
      },
    ],
    lastAssessed: '2026-02-23T09:00:00Z',
    evidenceCount: 2,
  },
  {
    conceptId: 'Prototypes',
    level: 'surface',
    confidence: 0.25,
    debtIndicators: [
      {
        type: 'parroting',
        severity: 0.7,
        evidence: 'Prototypes enable prototypal inheritance in JavaScript.',
        explanation:
          'Your explanation repeated textbook terminology without demonstrating an understanding of how the prototype chain actually resolves property lookups.',
      },
    ],
    lastAssessed: '2026-02-22T16:45:00Z',
    evidenceCount: 1,
  },
  {
    conceptId: 'Type System',
    level: 'solid',
    confidence: 0.78,
    debtIndicators: [],
    lastAssessed: '2026-02-25T11:00:00Z',
    evidenceCount: 4,
  },
];

export const MOCK_MENTAL_MODEL: MentalModelGraph = {
  userId: MOCK_USER_ID,
  concepts: MOCK_CONCEPTS,
  edges: [
    { source: 'Closures', target: 'Promises', relationship: 'prerequisite' },
    { source: 'Event Loop', target: 'Promises', relationship: 'prerequisite' },
    { source: 'Prototypes', target: 'Closures', relationship: 'prerequisite' },
    { source: 'Type System', target: 'Prototypes', relationship: 'related' },
    { source: 'Closures', target: 'Event Loop', relationship: 'related' },
  ],
  overallProgress: 0.62,
};

const MOCK_INTERVENTIONS_MAP: Record<string, MicroIntervention[]> = {
  Promises: [
    {
      id: 'int_promises_1',
      type: 'clarification',
      targetConcept: 'Promises',
      content: {
        title: 'Promise Resolution & Microtask Queue',
        explanation:
          'When a Promise resolves, its .then() callback is not executed immediately. Instead, it is placed in the microtask queue. The event loop processes all microtasks after the current synchronous execution completes, but before the next macrotask (like setTimeout).',
        examples: [
          'console.log("A"); Promise.resolve().then(() => console.log("B")); console.log("C"); // Output: A, C, B',
          'setTimeout(() => console.log("timeout"), 0); Promise.resolve().then(() => console.log("promise")); // Output: promise, timeout',
        ],
        followUpQuestions: [
          'Why does a resolved Promise callback execute before a setTimeout with 0ms delay?',
          'What happens if a .then() handler itself returns a new Promise?',
        ],
      },
    },
  ],
  'Event Loop': [
    {
      id: 'int_eventloop_1',
      type: 'mental_model',
      targetConcept: 'Event Loop',
      content: {
        title: 'Event Loop as a Restaurant Kitchen',
        explanation:
          'Think of the event loop as a restaurant kitchen. The call stack is the chef — it handles one dish (function) at a time. The task queue is the order board. Web APIs are the prep cooks working in the background. When a prep cook finishes (e.g., a timer expires), they put the dish on the order board. The chef picks it up only when the current dish is done.',
        examples: [
          'The chef (call stack) is cooking main() → foo() → bar(). Until bar() and foo() finish, no new orders from the board.',
          'A setTimeout(cb, 0) is like telling a prep cook to immediately put it on the board — but the chef still finishes current work first.',
        ],
        followUpQuestions: [
          'In this mental model, where do microtasks fit? Are they a VIP order board?',
          'What happens when the chef (call stack) encounters an infinite loop?',
        ],
      },
    },
    {
      id: 'int_eventloop_2',
      type: 'counter_example',
      targetConcept: 'Event Loop',
      content: {
        title: 'When Synchronous Code Blocks Everything',
        explanation:
          'If the call stack never empties, the event loop cannot process any queued tasks. This is why a long-running synchronous loop freezes the entire page — no click handlers, no timers, no rendering updates can proceed.',
        examples: [
          'while(true) {} — blocks everything. Even a pending setTimeout callback will never execute.',
          'A 2-second synchronous computation delays all UI updates and event handling by 2 seconds.',
        ],
        followUpQuestions: [
          'How would you restructure a CPU-intensive task to avoid blocking the event loop?',
        ],
      },
    },
  ],
  Prototypes: [
    {
      id: 'int_proto_1',
      type: 'aha_bridge',
      targetConcept: 'Prototypes',
      content: {
        title: 'Prototypes are Fallback Lookups',
        explanation:
          'When you access a property on an object, JavaScript first looks at the object itself. If the property is not found, it walks up the prototype chain — checking the object\'s __proto__, then its __proto__, and so on until it reaches null. This is the entire mechanism.',
        examples: [
          'const arr = [1,2,3]; arr.hasOwnProperty("length") → true. arr.hasOwnProperty("map") → false. But arr.map exists — it comes from Array.prototype.',
          'function Dog(name) { this.name = name; } Dog.prototype.bark = function() { return "Woof!"; }; new Dog("Rex").bark() → "Woof!" — bark is found on Dog.prototype, not on the instance.',
        ],
        followUpQuestions: [
          'What happens when you set a property that exists on the prototype? Does it modify the prototype or the instance?',
          'How does Object.create(null) differ from {} in terms of the prototype chain?',
        ],
      },
    },
  ],
};

export const getMockInterventions = (
  conceptId: string
): MicroIntervention[] => {
  return MOCK_INTERVENTIONS_MAP[conceptId] ?? [];
};

export const createMockEvidenceResponse = (
  _submission: EvidenceSubmission,
  currentModel: MentalModelGraph
): EvidenceResponse => {
  const newConcept: ConceptUnderstanding = {
    conceptId: `Concept_${Date.now().toString(36)}`,
    level: 'surface',
    confidence: 0.3,
    debtIndicators: [
      {
        type: 'wrong_reasoning',
        severity: 0.5,
        evidence: 'Submitted explanation lacked structural reasoning.',
        explanation:
          'The explanation provided surface-level statements without connecting underlying mechanisms.',
      },
    ],
    lastAssessed: new Date().toISOString(),
    evidenceCount: 1,
  };

  const existingIds = new Set(currentModel.concepts.map((c) => c.conceptId));
  const updatedConcepts = existingIds.has(newConcept.conceptId)
    ? currentModel.concepts.map((c) =>
        c.conceptId === newConcept.conceptId
          ? { ...c, confidence: Math.min(c.confidence + 0.1, 1), evidenceCount: c.evidenceCount + 1, lastAssessed: new Date().toISOString() }
          : c
      )
    : [...currentModel.concepts, newConcept];

  const updatedEdges = existingIds.has(newConcept.conceptId)
    ? currentModel.edges
    : currentModel.concepts.length > 0
      ? [
          ...currentModel.edges,
          {
            source: currentModel.concepts[0].conceptId,
            target: newConcept.conceptId,
            relationship: 'related',
          },
        ]
      : currentModel.edges;

  const updatedModel: MentalModelGraph = {
    ...currentModel,
    concepts: updatedConcepts,
    edges: updatedEdges,
    overallProgress: Math.min(
      updatedConcepts.reduce((sum, c) => sum + c.confidence, 0) /
        updatedConcepts.length,
      1
    ),
  };

  const interventions: MicroIntervention[] = newConcept.debtIndicators.length > 0
    ? [
        {
          id: `int_${Date.now().toString(36)}`,
          type: 'clarification',
          targetConcept: newConcept.conceptId,
          content: {
            title: 'Deepen Your Explanation',
            explanation:
              'Your submission was detected as surface-level. Try to explain the underlying mechanism, not just the outcome. Focus on the "why" and "how", not just the "what".',
            examples: [
              'Instead of "closures remember variables", say "a closure is formed when a function retains a reference to its lexical scope, even after the outer function has returned."',
            ],
            followUpQuestions: [
              'Can you explain the mechanism step by step?',
              'What would happen if this concept did not exist?',
            ],
          },
        },
      ]
    : [];

  return { updatedModel, interventions };
};

export const createMockUnderstoodModel = (
  currentModel: MentalModelGraph,
  conceptId: string
): MentalModelGraph => {
  const updatedConcepts = currentModel.concepts.map((c) =>
    c.conceptId === conceptId
      ? {
          ...c,
          level: 'solid' as const,
          confidence: Math.min(c.confidence + 0.25, 1),
          debtIndicators: [],
          lastAssessed: new Date().toISOString(),
        }
      : c
  );

  return {
    ...currentModel,
    concepts: updatedConcepts,
    overallProgress: Math.min(
      updatedConcepts.reduce((sum, c) => sum + c.confidence, 0) /
        updatedConcepts.length,
      1
    ),
  };
};
