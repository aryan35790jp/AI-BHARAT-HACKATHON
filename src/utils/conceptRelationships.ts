/**
 * Concept Relationship Inference Engine
 *
 * Infers edges between analyzed concepts based on known domain relationships.
 * This gives the Cognitive Map its "connected knowledge" feel without
 * requiring the backend to return relationship data.
 */

/** Known domain clusters — concepts that relate to each other */
const DOMAIN_CLUSTERS: Record<string, string[]> = {
  // JavaScript / Web
  javascript: ['closures', 'promises', 'event loop', 'callbacks', 'async await', 'prototypes', 'scope', 'hoisting', 'this keyword', 'modules', 'generators', 'iterators', 'proxy', 'weakmap', 'weakset', 'symbols'],
  web: ['dom', 'css', 'html', 'http', 'rest api', 'websockets', 'cors', 'cookies', 'sessions', 'jwt'],
  react: ['hooks', 'state', 'props', 'context', 'useeffect', 'usememo', 'virtual dom', 'jsx', 'components', 'redux', 'suspense'],

  // CS Fundamentals
  algorithms: ['recursion', 'sorting', 'searching', 'dynamic programming', 'greedy', 'backtracking', 'graph algorithms', 'trees', 'binary search', 'bfs', 'dfs'],
  data_structures: ['arrays', 'linked lists', 'stacks', 'queues', 'trees', 'graphs', 'hash tables', 'heaps', 'tries', 'sets'],
  programming: ['oop', 'functional programming', 'classes', 'inheritance', 'polymorphism', 'encapsulation', 'abstraction', 'design patterns', 'solid'],

  // Python
  python: ['decorators', 'generators', 'list comprehensions', 'lambda', 'iterators', 'context managers', 'metaclasses', 'threading', 'asyncio', 'type hints'],

  // Systems
  systems: ['operating systems', 'memory management', 'processes', 'threads', 'concurrency', 'parallelism', 'deadlocks', 'scheduling', 'virtual memory', 'file systems'],
  networking: ['tcp', 'udp', 'ip', 'dns', 'http', 'https', 'load balancing', 'cdn', 'firewalls', 'routing'],
  databases: ['sql', 'nosql', 'indexing', 'transactions', 'acid', 'normalization', 'sharding', 'replication', 'caching', 'redis', 'mongodb', 'postgresql'],

  // ML / AI
  ml: ['neural networks', 'deep learning', 'machine learning', 'regression', 'classification', 'clustering', 'transformers', 'attention mechanism', 'gradient descent', 'backpropagation', 'overfitting', 'regularization'],
};

/** Specific strong relationships between concepts */
const DIRECT_RELATIONSHIPS: Array<[string, string, string]> = [
  ['promises', 'event loop', 'execution model'],
  ['promises', 'callbacks', 'evolution'],
  ['promises', 'async await', 'syntax sugar'],
  ['closures', 'scope', 'mechanism'],
  ['recursion', 'stacks', 'uses'],
  ['recursion', 'dynamic programming', 'optimization'],
  ['classes', 'inheritance', 'mechanism'],
  ['classes', 'oop', 'paradigm'],
  ['hooks', 'state', 'manages'],
  ['hooks', 'useeffect', 'lifecycle'],
  ['virtual dom', 'dom', 'abstraction'],
  ['threads', 'concurrency', 'mechanism'],
  ['processes', 'threads', 'contains'],
  ['tcp', 'http', 'underlies'],
  ['sql', 'indexing', 'optimization'],
  ['sql', 'transactions', 'feature'],
  ['neural networks', 'backpropagation', 'training'],
  ['neural networks', 'gradient descent', 'optimization'],
  ['transformers', 'attention mechanism', 'core'],
  ['python', 'decorators', 'feature'],
  ['python', 'generators', 'feature'],
  ['python', 'list comprehensions', 'feature'],
];

/**
 * Normalize a concept name for fuzzy matching.
 */
function normalize(concept: string): string {
  return concept
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a concept matches a known term (fuzzy).
 */
function fuzzyMatch(concept: string, term: string): boolean {
  const c = normalize(concept);
  const t = normalize(term);
  return c === t || c.includes(t) || t.includes(c);
}

export interface InferredEdge {
  source: string;
  target: string;
  relationship: string;
  strength: number; // 0-1
}

/**
 * Given a list of analyzed concept IDs, infer relationships between them.
 */
export function inferRelationships(conceptIds: string[]): InferredEdge[] {
  const edges: InferredEdge[] = [];
  const seen = new Set<string>();

  // 1. Check direct known relationships
  for (const [a, b, rel] of DIRECT_RELATIONSHIPS) {
    const matchA = conceptIds.find((c) => fuzzyMatch(c, a));
    const matchB = conceptIds.find((c) => fuzzyMatch(c, b));
    if (matchA && matchB && matchA !== matchB) {
      const key = [matchA, matchB].sort().join('::');
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ source: matchA, target: matchB, relationship: rel, strength: 0.9 });
      }
    }
  }

  // 2. Check domain cluster co-membership
  for (const cluster of Object.values(DOMAIN_CLUSTERS)) {
    const members = conceptIds.filter((c) =>
      cluster.some((term) => fuzzyMatch(c, term)),
    );
    // Connect members within the same cluster
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = [members[i], members[j]].sort().join('::');
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            source: members[i],
            target: members[j],
            relationship: 'related',
            strength: 0.5,
          });
        }
      }
    }
  }

  return edges;
}
