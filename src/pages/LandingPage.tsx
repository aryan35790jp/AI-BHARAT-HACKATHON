import React, { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { NeuralBackground } from '../components/NeuralBackground';

/* ─── Icons (inline SVG) ─── */
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const BrainIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
  </svg>
);

/* ─── Feature Card ─── */
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}
const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => (
  <div className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.03] p-7 backdrop-blur-sm transition-all duration-300 hover:border-indigo-500/20 hover:bg-white/[0.06]">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 transition-colors group-hover:bg-indigo-500/20">
      {icon}
    </div>
    <h3 className="mb-2 text-lg font-semibold text-white">{title}</h3>
    <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
  </div>
);

/* ─── Step Card ─── */
interface StepCardProps {
  step: number;
  title: string;
  description: string;
}
const StepCard: React.FC<StepCardProps> = ({ step, title, description }) => (
  <div className="relative flex flex-col items-center text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-xl font-bold text-indigo-400 ring-1 ring-indigo-500/20">
      {step}
    </div>
    <h3 className="mb-1.5 text-base font-semibold text-white">{title}</h3>
    <p className="text-sm text-zinc-400">{description}</p>
  </div>
);

/* ─── Landing Page ─── */
const LandingPage: React.FC = () => {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <NeuralBackground />

      {/* ─── Nav ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-12 lg:px-20">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
            <BrainIcon />
          </div>
          <span className="text-lg font-bold tracking-tight">Cognivault</span>
        </div>
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <GoogleIcon />
          Sign in
        </button>
      </nav>

      {/* ────────────────────────── HERO ────────────────────────── */}
      <section className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pt-20 text-center sm:pt-28 lg:pt-36">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/[0.08] px-4 py-1.5 text-xs font-medium text-indigo-300">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
          AI-Powered Learning Analytics
        </div>

        <h1 className="max-w-3xl bg-gradient-to-b from-white via-white to-zinc-400 bg-clip-text text-4xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-5xl lg:text-6xl">
          See how deeply you actually understand what you learn.
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          Cognivault analyzes your explanations and builds a live cognitive map of your knowledge — revealing gaps, misconceptions, and true depth of understanding.
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={signInWithGoogle}
            className="flex items-center gap-2.5 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30 active:scale-[0.98]"
          >
            Start Learning
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
          <button
            onClick={signInWithGoogle}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-7 py-3.5 text-sm font-semibold text-zinc-300 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <GoogleIcon />
            Sign in with Google
          </button>
        </div>

        {/* Hero graphic — product preview */}
        <div className="mt-16 w-full max-w-4xl sm:mt-20">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-2xl shadow-indigo-500/5">
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
              <div className="ml-4 flex-1 rounded-md bg-white/[0.06] px-3 py-1 text-[11px] text-zinc-500">
                cognivault.app
              </div>
            </div>
            {/* Preview content — animated nodes */}
            <div className="relative h-64 sm:h-80 lg:h-96">
              <ProductPreviewAnimation />
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────────── FEATURES ────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-32 sm:pt-40">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Understand your understanding
          </h2>
          <p className="mt-3 text-zinc-400">Three pillars of cognitive self-awareness.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <FeatureCard
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
            }
            title="Cognitive Maps"
            description="Visualize your understanding as an evolving knowledge graph — see how concepts connect and where foundations are weak."
          />
          <FeatureCard
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            }
            title="AI Understanding Analysis"
            description="Explain concepts in your own words and get precise, semantic feedback on your depth of understanding."
          />
          <FeatureCard
            icon={
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            }
            title="Identify Knowledge Gaps"
            description="Discover missing links in your mental model — the blind spots that silently undermine your learning."
          />
        </div>
      </section>

      {/* ────────────────────────── HOW IT WORKS ────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-32 sm:pt-40">
        <div className="mb-14 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">How it works</h2>
          <p className="mt-3 text-zinc-400">Three steps. Real insight.</p>
        </div>
        <div className="grid gap-10 sm:grid-cols-3">
          <StepCard step={1} title="Explain a concept" description="Write what you know about any topic in your own words." />
          <StepCard step={2} title="AI evaluates depth" description="Our AI reasons semantically about your explanation — not just keywords." />
          <StepCard step={3} title="Your map grows" description="Each analysis enriches your cognitive map, revealing how concepts connect." />
        </div>
      </section>

      {/* ────────────────────────── FINAL CTA ────────────────────────── */}
      <section className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pb-24 pt-32 text-center sm:pt-40">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">
          Start building your cognitive map.
        </h2>
        <p className="mt-4 max-w-lg text-zinc-400">
          Join learners who are finally seeing the shape of their understanding.
        </p>
        <button
          onClick={signInWithGoogle}
          className="mt-8 flex items-center gap-2.5 rounded-xl bg-indigo-600 px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/30 active:scale-[0.98]"
        >
          <GoogleIcon />
          Sign in with Google
        </button>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-white/[0.04] px-6 py-8 text-center text-xs text-zinc-600">
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-500">
            <BrainIcon />
          </div>
          <span>Cognivault &copy; {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

/* ────────────────────────── CONCEPT CLUSTER DATA ────────────────────────── */

interface ConceptCluster {
  center: { label: string; color: string };
  satellites: { label: string; color: string; x: number; y: number; size: number }[];
  edges: [number, number][]; // index pairs (0 = center)
}

const CONCEPT_CLUSTERS: ConceptCluster[] = [
  {
    center: { label: 'Programming', color: '#6366F1' },
    satellites: [
      { label: 'Variables',   color: '#10B981', x: 25, y: 25, size: 28 },
      { label: 'Functions',   color: '#F59E0B', x: 75, y: 25, size: 32 },
      { label: 'Loops',       color: '#10B981', x: 20, y: 65, size: 30 },
      { label: 'Data Types',  color: '#3B82F6', x: 80, y: 65, size: 26 },
      { label: 'Classes',     color: '#EF4444', x: 40, y: 82, size: 24 },
      { label: 'Algorithms',  color: '#F59E0B', x: 65, y: 82, size: 22 },
      { label: 'Debugging',   color: '#3B82F6', x: 12, y: 45, size: 22 },
      { label: 'Scope',       color: '#F59E0B', x: 88, y: 45, size: 22 },
    ],
    edges: [[0,1],[0,2],[0,3],[0,4],[1,7],[2,8],[3,5],[4,6],[1,3],[2,4]],
  },
  {
    center: { label: 'Machine Learning', color: '#8B5CF6' },
    satellites: [
      { label: 'Neural Nets',      color: '#00E5FF', x: 25, y: 22, size: 30 },
      { label: 'Training',         color: '#10B981', x: 75, y: 22, size: 28 },
      { label: 'Loss Functions',   color: '#F59E0B', x: 18, y: 62, size: 26 },
      { label: 'Gradient Descent', color: '#EF4444', x: 82, y: 62, size: 24 },
      { label: 'Inference',        color: '#3B82F6', x: 38, y: 82, size: 24 },
      { label: 'Overfitting',      color: '#EF4444', x: 68, y: 82, size: 22 },
      { label: 'Features',         color: '#10B981', x: 12, y: 42, size: 22 },
      { label: 'Datasets',         color: '#F59E0B', x: 88, y: 42, size: 22 },
    ],
    edges: [[0,1],[0,2],[0,3],[0,4],[1,3],[2,4],[1,7],[2,8],[3,5],[4,6]],
  },
  {
    center: { label: 'Mathematics', color: '#6366F1' },
    satellites: [
      { label: 'Algebra',      color: '#10B981', x: 25, y: 24, size: 30 },
      { label: 'Calculus',     color: '#F59E0B', x: 75, y: 24, size: 28 },
      { label: 'Probability',  color: '#00E5FF', x: 20, y: 64, size: 26 },
      { label: 'Geometry',     color: '#3B82F6', x: 80, y: 64, size: 26 },
      { label: 'Proofs',       color: '#EF4444', x: 40, y: 82, size: 22 },
      { label: 'Statistics',   color: '#10B981', x: 65, y: 80, size: 24 },
      { label: 'Limits',       color: '#F59E0B', x: 12, y: 44, size: 22 },
      { label: 'Sets',         color: '#3B82F6', x: 88, y: 44, size: 22 },
    ],
    edges: [[0,1],[0,2],[0,3],[0,4],[1,5],[2,7],[3,8],[4,6],[1,3],[2,6]],
  },
  {
    center: { label: 'Physics', color: '#F59E0B' },
    satellites: [
      { label: 'Mechanics',        color: '#10B981', x: 25, y: 22, size: 30 },
      { label: 'Electromagnetism',  color: '#3B82F6', x: 75, y: 22, size: 24 },
      { label: 'Thermodynamics',    color: '#EF4444', x: 18, y: 64, size: 24 },
      { label: 'Waves',            color: '#00E5FF', x: 82, y: 64, size: 28 },
      { label: 'Energy',           color: '#10B981', x: 38, y: 82, size: 26 },
      { label: 'Relativity',       color: '#8B5CF6', x: 68, y: 82, size: 22 },
      { label: 'Forces',           color: '#F59E0B', x: 12, y: 44, size: 22 },
      { label: 'Quantum',          color: '#8B5CF6', x: 88, y: 44, size: 22 },
    ],
    edges: [[0,1],[0,2],[0,3],[0,4],[1,7],[3,8],[2,5],[4,6],[1,3],[2,4]],
  },
  {
    center: { label: 'Data Science', color: '#00E5FF' },
    satellites: [
      { label: 'Visualization', color: '#10B981', x: 25, y: 24, size: 28 },
      { label: 'Cleaning',      color: '#F59E0B', x: 75, y: 24, size: 26 },
      { label: 'Pipelines',     color: '#3B82F6', x: 20, y: 64, size: 26 },
      { label: 'Modeling',      color: '#8B5CF6', x: 80, y: 64, size: 28 },
      { label: 'SQL',           color: '#10B981', x: 38, y: 82, size: 24 },
      { label: 'Statistics',    color: '#EF4444', x: 68, y: 80, size: 24 },
      { label: 'APIs',          color: '#F59E0B', x: 12, y: 44, size: 22 },
      { label: 'Pandas',        color: '#3B82F6', x: 88, y: 44, size: 22 },
    ],
    edges: [[0,1],[0,2],[0,3],[0,4],[1,7],[2,8],[3,5],[4,6],[1,3],[2,6]],
  },
];

/* ────────────────────────── PRODUCT PREVIEW ANIMATION ────────────────────────── */

/** Builds the node + edge arrays from a randomly-selected cluster */
function buildPreviewData(cluster: ConceptCluster) {
  const nodes = [
    { x: 50, y: 45, label: cluster.center.label, color: cluster.center.color, size: 40 },
    ...cluster.satellites,
  ];
  return { nodes, edges: cluster.edges };
}

const ProductPreviewAnimation: React.FC = () => {
  const { nodes: previewNodes, edges: previewEdges } = useMemo(() => {
    const idx = Math.floor(Math.random() * CONCEPT_CLUSTERS.length);
    return buildPreviewData(CONCEPT_CLUSTERS[idx]);
  }, []);

  return (
    <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.15)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* Edges */}
      {previewEdges.map(([from, to], i) => (
        <line
          key={`edge-${i}`}
          x1={previewNodes[from].x}
          y1={previewNodes[from].y}
          x2={previewNodes[to].x}
          y2={previewNodes[to].y}
          stroke="rgba(99,102,241,0.15)"
          strokeWidth="0.3"
        >
          <animate
            attributeName="stroke-opacity"
            values="0.1;0.3;0.1"
            dur={`${3 + i * 0.4}s`}
            repeatCount="indefinite"
          />
        </line>
      ))}

      {/* Nodes */}
      {previewNodes.map((node, i) => {
        const r = node.size / 12;
        return (
          <g key={`node-${i}`}>
            {/* Glow */}
            <circle cx={node.x} cy={node.y} r={r * 3} fill="url(#node-glow)" opacity={0.6}>
              <animate
                attributeName="r"
                values={`${r * 2.5};${r * 3.5};${r * 2.5}`}
                dur={`${3 + i * 0.3}s`}
                repeatCount="indefinite"
              />
            </circle>
            {/* Core */}
            <circle cx={node.x} cy={node.y} r={r} fill={node.color} opacity={0.85}>
              <animate
                attributeName="opacity"
                values="0.7;1;0.7"
                dur={`${2 + i * 0.5}s`}
                repeatCount="indefinite"
              />
            </circle>
            {/* Label */}
            <text
              x={node.x}
              y={node.y + r + 3.5}
              textAnchor="middle"
              fill="rgba(255,255,255,0.5)"
              fontSize="2.2"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="500"
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
