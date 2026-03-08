import type { AnalyzeResponse } from '../types/models';

/** Pre-loaded demo scenarios for hackathon judging */
export interface DemoScenario {
  id: string;
  label: string;
  description: string;
  concept: string;
  content: string;
  /** Expected response shape to use when demo mode is offline */
  mockResponse: AnalyzeResponse;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'closures-surface',
    label: 'Closures — Surface Level',
    description: 'A shallow textbook definition that triggers circular reasoning debt',
    concept: 'JavaScript Closures',
    content:
      'A closure is when a function closes over variables from its outer scope. It remembers the variables. Closures are used in JavaScript a lot. They are related to scope and functions.',
    mockResponse: {
      conceptId: 'JavaScript Closures',
      understandingLevel: 'surface',
      confidence: 0.32,
      debtIndicators: [
        {
          type: 'circular',
          severity: 0.85,
          evidence: '"A closure is when a function closes over variables"',
          explanation:
            'The explanation defines closures using the word "closes over" — this is circular reasoning. It restates the term without explaining the mechanism.',
        },
        {
          type: 'parroting',
          severity: 0.7,
          evidence: '"related to scope and functions"',
          explanation:
            'Using broad keywords (scope, functions) without connecting them to how closures actually work indicates keyword parroting.',
        },
      ],
      microIntervention: {
        id: 'iv-closures-1',
        type: 'mental_model',
        targetConcept: 'JavaScript Closures',
        content: {
          title: 'The Backpack Mental Model',
          explanation:
            'Think of a closure as a function that carries a "backpack" of variables from where it was created. Even after the outer function has returned, the inner function still has access to that backpack. The key insight is that the function retains a reference to the lexical environment, not a copy of the values.',
          examples: [
            'Write a counter factory: a function that returns another function. Each returned function should maintain its own independent count.',
            'Create a function that generates unique ID strings by closing over a counter variable.',
          ],
          followUpQuestions: [
            'What happens to the closed-over variables when the outer function finishes executing? Why aren\'t they garbage collected?',
            'How is a closure different from simply passing a variable as a parameter?',
          ],
        },
      },
      modelUsed: 'us.meta.llama4-maverick-17b-instruct-v1:0',
    },
  },
  {
    id: 'recursion-partial',
    label: 'Recursion — Partial Understanding',
    description: 'Shows some understanding but has a logical jump in base case reasoning',
    concept: 'Recursion',
    content:
      'Recursion is when a function calls itself. You need a base case to stop the recursion, otherwise you get infinite recursion and a stack overflow. For example, factorial(n) = n * factorial(n-1). The base case is when n equals 1. Each recursive call adds a frame to the call stack, and when the base case is reached, the frames unwind and the results are combined.',
    mockResponse: {
      conceptId: 'Recursion',
      understandingLevel: 'partial',
      confidence: 0.58,
      debtIndicators: [
        {
          type: 'logical_jump',
          severity: 0.55,
          evidence: '"the frames unwind and the results are combined"',
          explanation:
            'The explanation jumps from "frames unwind" to "results are combined" without explaining _how_ the return values propagate back through each stack frame. This is a logical gap in the causal chain.',
        },
        {
          type: 'confidence_mismatch',
          severity: 0.4,
          evidence: 'Overall language is confident but base case reasoning is incomplete',
          explanation:
            'The explanation confidently states base case mechanics but doesn\'t explain why n=0 (not just n=1) is critical, or what happens with negative inputs. Confidence exceeds depth.',
        },
      ],
      microIntervention: {
        id: 'iv-recursion-1',
        type: 'counter_example',
        targetConcept: 'Recursion',
        content: {
          title: 'Edge Cases That Break Your Model',
          explanation:
            'Your understanding handles the happy path well. But recursive thinking requires considering edge cases and alternative approaches. What happens with factorial(0)? What about factorial(-3)? Understanding _why_ certain base cases are chosen reveals deeper knowledge.',
          examples: [
            'Trace through factorial(0) step by step. What should it return and why?',
            'Try implementing Fibonacci recursively, then identify why it\'s exponentially slow without memoization.',
            'Convert factorial from recursion to an iterative loop — what does this reveal about tail call optimization?',
          ],
          followUpQuestions: [
            'Can every recursive algorithm be converted to iteration? Why or why not?',
            'What is the relationship between recursion and mathematical induction?',
          ],
        },
      },
      modelUsed: 'us.meta.llama4-maverick-17b-instruct-v1:0',
    },
  },
  {
    id: 'promises-deep',
    label: 'Promises — Deep Understanding',
    description: 'A strong explanation that demonstrates deep structural knowledge',
    concept: 'JavaScript Promises',
    content:
      'A Promise represents a value that may not be available yet but will be resolved at some point or rejected with an error. It acts as a proxy for an asynchronous operation\'s eventual result. Internally, a promise is a state machine with three states: pending, fulfilled, or rejected. Transitions are one-way — once settled (fulfilled or rejected), a promise cannot change state. The .then() method returns a new promise, enabling chaining. This creates a monadic composition pattern where each transformation step produces a new wrapped value. Error propagation follows the chain until caught by a .catch() or a rejection handler. Microtask queue scheduling ensures .then callbacks execute after the current synchronous code completes but before any macrotask like setTimeout. This is why Promise.resolve().then(() => console.log("A")) logs before setTimeout(() => console.log("B"), 0).',
    mockResponse: {
      conceptId: 'JavaScript Promises',
      understandingLevel: 'deep',
      confidence: 0.91,
      debtIndicators: [],
      microIntervention: {
        id: 'iv-promises-1',
        type: 'aha_bridge',
        targetConcept: 'JavaScript Promises',
        content: {
          title: 'Bridge to Advanced Concurrency Patterns',
          explanation:
            'Your understanding of Promises is structurally sound. You correctly identified the state machine model, monadic composition, and microtask scheduling. To push further, explore how async/await desugars into promise chains and how AbortController provides cancellation semantics that Promises lack natively.',
          examples: [
            'Implement Promise.all from scratch to solidify understanding of concurrent resolution.',
            'Build a retry function with exponential backoff using only promises.',
            'Explore how async generators (for-await-of) combine the iterator protocol with promises.',
          ],
          followUpQuestions: [
            'Why can\'t native Promises be cancelled, and how does this differ from Observables?',
            'How does the structured concurrency model in other languages compare to JavaScript\'s Promise model?',
          ],
        },
      },
      modelUsed: 'us.meta.llama4-maverick-17b-instruct-v1:0',
    },
  },
];
