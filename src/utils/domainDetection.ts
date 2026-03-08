/**
 * Domain Detection & Initial Graph Seeding
 *
 * Responsible for:
 *  1. Detecting which knowledge domain a concept belongs to
 *  2. Providing foundational "placeholder" concept nodes per domain
 *  3. Determining whether two domains match (for domain-shift detection)
 *  4. Providing display labels and colors for sidebar grouping
 */

/* ─── Domain keyword dictionary ─── */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  history: [
    'history', 'historical', 'war', 'revolution', 'civilization', 'medieval',
    'empire', 'ancient', 'dynasty', 'battle', 'treaty', 'renaissance',
    'colonialism', 'independence', 'world war', 'wwi', 'wwii', 'archaeology',
    'monarch', 'kingdom', 'republic', 'feudal', 'crusade', 'plague',
    'genocide', 'holocaust', 'cold war', 'imperialism', 'uprising', 'conquest',
    'ottoman', 'mughal', 'roman', 'greek', 'mesopotamia', 'egypt', 'colonial',
    'akbar', 'napoleon', 'lincoln', 'alexander',
  ],
  programming: [
    'programming', 'coding', 'code', 'function', 'variable', 'loop', 'class',
    'object', 'algorithm', 'data structure', 'recursion', 'python', 'javascript',
    'typescript', 'java', 'c++', 'react', 'node', 'api', 'database', 'sql',
    'software', 'computer science', 'machine learning', 'neural network',
    'paradigm', 'compiler', 'runtime', 'stack', 'heap', 'pointer', 'array',
    'linked list', 'binary tree', 'sorting', 'searching', 'complexity',
    'git', 'version control', 'debugging', 'testing', 'design pattern',
    'oop', 'functional', 'async', 'promise', 'callback', 'closure',
    'sdk', 'framework', 'library', 'component', 'interface', 'inheritance',
    'polymorphism', 'encapsulation', 'abstraction', 'iterator', 'generator',
    // DevOps / Cloud / Web
    'vercel', 'netlify', 'heroku', 'docker', 'kubernetes', 'container',
    'deployment', 'hosting', 'cloud', 'aws', 'azure', 'gcp', 'serverless',
    'lambda', 'ci/cd', 'pipeline', 'devops', 'infrastructure', 'terraform',
    'nginx', 'proxy', 'load balancer', 'cdn', 'dns', 'ssl', 'https',
    'frontend', 'backend', 'fullstack', 'web', 'rest', 'graphql', 'grpc',
    'microservice', 'monolith', 'cache', 'redis', 'mongodb', 'postgres',
    'html', 'css', 'http', 'websocket', 'oauth', 'jwt', 'auth', 'token',
    'npm', 'yarn', 'webpack', 'vite', 'babel', 'eslint', 'prettier',
    'supabase', 'firebase', 'dynamodb', 'nosql', 'orm', 'prisma',
    'virtual machine', 'operating system', 'linux', 'bash', 'shell',
    'binary', 'bit', 'byte', 'network', 'protocol', 'socket',
  ],
  mathematics: [
    'math', 'mathematics', 'calculus', 'algebra', 'geometry', 'statistics',
    'probability', 'theorem', 'equation', 'matrix', 'derivative', 'integral',
    'trigonometry', 'number theory', 'proof', 'polynomial', 'vector',
    'differential', 'series', 'limit', 'set theory', 'topology',
    'combinatorics', 'graph theory', 'arithmetic', 'fraction', 'prime',
  ],
  physics: [
    'physics', 'quantum', 'mechanics', 'thermodynamics', 'electromagnetism',
    'gravity', 'relativity', 'force', 'energy', 'motion', 'optics', 'waves',
    'momentum', 'acceleration', 'nuclear', 'particle', 'field theory',
    'entropy', 'magnetism', 'electricity', 'circuit', 'velocity', 'mass',
  ],
  chemistry: [
    'chemistry', 'atom', 'molecule', 'element', 'compound', 'reaction',
    'bond', 'periodic table', 'organic', 'inorganic', 'acid', 'base',
    'electrochemistry', 'polymer', 'stoichiometry', 'oxidation', 'reduction',
    'catalyst', 'thermochemistry', 'solubility', 'molar', 'valence',
  ],
  biology: [
    'biology', 'cell', 'dna', 'evolution', 'genetics', 'organism',
    'ecosystem', 'protein', 'enzyme', 'anatomy', 'physiology', 'ecology',
    'microbiology', 'biochemistry', 'neuroscience', 'taxonomy', 'chromosome',
    'mitosis', 'photosynthesis', 'respiration', 'immune system', 'natural selection',
    'species', 'mutation', 'biodiversity', 'habitat',
  ],
  sociology: [
    'sociology', 'society', 'social', 'culture', 'community', 'institution',
    'norms', 'values', 'class', 'gender', 'race', 'ethnicity', 'inequality',
    'stratification', 'conflict theory', 'functionalism', 'symbolic interactionism',
    'social structure', 'deviance', 'criminology', 'urbanization', 'globalization',
    'migration', 'family', 'religion', 'education system', 'bureaucracy',
    'social change', 'collective behavior', 'mass media', 'power', 'authority',
    'anthropology', 'cultural studies', 'demography', 'social norms',
  ],
  psychology: [
    'psychology', 'cognitive', 'behavior', 'emotion', 'personality',
    'memory', 'perception', 'mental', 'therapy', 'freud', 'developmental',
    'social psychology', 'clinical', 'abnormal', 'motivation',
    'consciousness', 'learning theory', 'conditioning', 'phobia', 'anxiety',
    'depression', 'trauma', 'attachment', 'self-esteem', 'bias', 'heuristic',
  ],
  economics: [
    'economics', 'market', 'supply', 'demand', 'inflation', 'gdp',
    'finance', 'trade', 'capital', 'microeconomics', 'macroeconomics',
    'monetary', 'fiscal policy', 'game theory', 'investment', 'stock',
    'currency', 'budget', 'tax', 'unemployment', 'opportunity cost', 'scarcity',
    'equilibrium', 'monopoly', 'oligopoly', 'interest rate', 'recession',
  ],
  philosophy: [
    'philosophy', 'ethics', 'logic', 'metaphysics', 'epistemology',
    'existentialism', 'morality', 'consciousness', 'phenomenology',
    'rationalism', 'empiricism', 'stoicism', 'utilitarianism', 'kant',
    'plato', 'aristotle', 'nietzsche', 'descartes', 'free will', 'determinism',
    'justice', 'virtue', 'truth', 'knowledge', 'being',
  ],
  literature: [
    'literature', 'poetry', 'novel', 'author', 'narrative', 'theme',
    'symbolism', 'genre', 'fiction', 'nonfiction', 'prose', 'character',
    'setting', 'plot', 'metaphor', 'allegory', 'tragedy', 'comedy',
    'shakespeare', 'modernism', 'romanticism', 'satire', 'irony', 'tone',
  ],
  geography: [
    'geography', 'continent', 'country', 'region', 'climate', 'topography',
    'biome', 'latitude', 'longitude', 'ocean', 'mountain', 'river', 'basin',
    'cartography', 'geopolitics', 'border', 'urban', 'rural', 'population',
    'natural resource', 'land use', 'plate tectonics', 'erosion', 'glacier',
  ],
  law: [
    'law', 'legal', 'constitutional', 'legislation', 'statute', 'court',
    'judiciary', 'rights', 'contract', 'tort', 'criminal law', 'civil law',
    'international law', 'human rights', 'due process', 'precedent', 'verdict',
    'prosecution', 'defense', 'amendment', 'regulation', 'compliance',
  ],
  art: [
    'art', 'painting', 'sculpture', 'design', 'architecture', 'photography',
    'illustration', 'composition', 'color theory', 'perspective', 'aesthetic',
    'cubism', 'impressionism', 'expressionism', 'abstract', 'modern art',
    'renaissance art', 'baroque', 'surrealism', 'canvas', 'medium', 'style',
  ],
};

/* ─── Foundational placeholder nodes per domain ─── */
const DOMAIN_INITIAL_NODES: Record<string, string[]> = {
  history: [
    'World War', 'Ancient Civilizations', 'Renaissance', 'Industrial Revolution',
    'Medieval Period', 'Events', 'People', 'Cultures', 'Colonialism', 'Revolutions',
  ],
  programming: [
    'Variables', 'Functions', 'Loops', 'Data Structures', 'Algorithms',
    'Classes', 'APIs', 'Databases', 'Recursion', 'Design Patterns',
    'Deployment', 'Version Control', 'Testing', 'Frameworks', 'Cloud Services',
  ],
  mathematics: [
    'Algebra', 'Calculus', 'Geometry', 'Statistics', 'Probability',
    'Number Theory', 'Trigonometry', 'Linear Algebra', 'Differential Equations', 'Logic',
  ],
  physics: [
    'Mechanics', 'Thermodynamics', 'Electromagnetism', 'Quantum Mechanics', 'Relativity',
    'Gravity', 'Optics', 'Nuclear Physics', 'Waves', 'Energy',
  ],
  chemistry: [
    'Atomic Structure', 'Chemical Bonds', 'Reactions', 'Periodic Table', 'Organic Chemistry',
    'Acids & Bases', 'Electrochemistry', 'Thermochemistry', 'Polymers', 'Stoichiometry',
  ],
  biology: [
    'Cell Biology', 'Genetics', 'Evolution', 'Ecology', 'Anatomy',
    'Physiology', 'Microbiology', 'Biochemistry', 'Neuroscience', 'Taxonomy',
  ],
  sociology: [
    'Social Structures', 'Institutions', 'Culture', 'Society', 'Inequality',
    'Stratification', 'Norms & Values', 'Conflict Theory', 'Globalization', 'Community',
  ],
  psychology: [
    'Perception', 'Memory', 'Emotion', 'Personality', 'Behavior',
    'Development', 'Social Psychology', 'Cognitive Psychology', 'Neuroscience', 'Mental Health',
  ],
  economics: [
    'Microeconomics', 'Macroeconomics', 'Supply & Demand', 'Markets', 'Trade',
    'Finance', 'Monetary Policy', 'Fiscal Policy', 'Game Theory', 'Development Economics',
  ],
  philosophy: [
    'Ethics', 'Logic', 'Epistemology', 'Metaphysics', 'Existentialism',
    'Political Philosophy', 'Aesthetics', 'Philosophy of Mind', 'Moral Theory', 'Rationalism',
  ],
  literature: [
    'Poetry', 'Prose', 'Narrative', 'Themes', 'Symbolism',
    'Genre', 'Character', 'Setting', 'Author Intent', 'Literary Devices',
  ],
  geography: [
    'Continents', 'Climate Zones', 'Topography', 'Oceans', 'Biomes',
    'Geopolitics', 'Cartography', 'Natural Resources', 'Urban Geography', 'Plate Tectonics',
  ],
  law: [
    'Constitutional Law', 'Criminal Law', 'Civil Law', 'International Law', 'Human Rights',
    'Contracts', 'Torts', 'Judiciary', 'Legislation', 'Due Process',
  ],
  art: [
    'Painting', 'Sculpture', 'Design', 'Architecture', 'Photography',
    'Color Theory', 'Composition', 'Art Movements', 'Aesthetics', 'Illustration',
  ],
  general: [],
};

/* ─── Display labels for sidebar UI ─── */
const DOMAIN_LABELS: Record<string, string> = {
  history:     'History',
  programming: 'Computer Science',
  mathematics: 'Mathematics',
  physics:     'Physics',
  chemistry:   'Chemistry',
  biology:     'Biology',
  sociology:   'Sociology',
  psychology:  'Psychology',
  economics:   'Economics',
  philosophy:  'Philosophy',
  literature:  'Literature',
  geography:   'Geography',
  law:         'Law',
  art:         'Art & Design',
  general:     'Uncategorized',
};

/* ─── Accent colors per domain (matches dark UI palette) ─── */
const DOMAIN_COLORS: Record<string, string> = {
  history:     '#F59E0B',
  programming: '#6366F1',
  mathematics: '#8B5CF6',
  physics:     '#3B82F6',
  chemistry:   '#06B6D4',
  biology:     '#10B981',
  sociology:   '#EC4899',
  psychology:  '#A78BFA',
  economics:   '#F97316',
  philosophy:  '#64748B',
  literature:  '#84CC16',
  geography:   '#14B8A6',
  law:         '#EF4444',
  art:         '#E879F9',
  general:     '#71717A',
};

/**
 * Detect which domain a concept belongs to using keyword matching.
 * Returns one of the domain keys or 'general' if no strong match found.
 */
export function detectDomain(concept: string): string {
  const lower = concept.toLowerCase();
  let bestDomain = 'general';
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywords.reduce((s, kw) => (lower.includes(kw) ? s + kw.length : s), 0);
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

/**
 * Get the 6-10 foundational concept node names for a domain.
 * These are shown as placeholder satellites at graph creation time.
 */
export function getInitialDomainNodes(domain: string): string[] {
  return DOMAIN_INITIAL_NODES[domain] ?? DOMAIN_INITIAL_NODES.general;
}

/**
 * Returns true only when two concepts belong to the SAME known domain.
 *
 * Strict rules — prevents cross-domain graph pollution:
 * - Same known domain ('history' + 'history') --> true, stay in same chat
 * - Different known domains ('history' + 'programming') --> false, create new chat
 * - Either side is 'general' --> false, always create a new chat
 *   (prevents unrelated concepts from accumulating in one graph)
 */
export function domainsMatch(domain1: string, domain2: string): boolean {
  if (domain1 === 'general' || domain2 === 'general') return false;
  return domain1 === domain2;
}

/**
 * Human-readable label for a domain (used in sidebar section headers).
 */
export function getDomainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

/**
 * Accent color for a domain (used for sidebar badges and section dividers).
 */
export function getDomainColor(domain: string): string {
  return DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.general;
}
