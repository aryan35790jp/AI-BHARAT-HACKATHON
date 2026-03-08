import React from 'react';

export const PoweredBy: React.FC = () => (
  <div className="glass-subtle rounded-2xl border border-surface-border/30 px-5 py-4">
    <div className="mb-3 flex items-center gap-2">
      <svg className="h-3.5 w-3.5 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
      </svg>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">Architecture</span>
    </div>

    <div className="flex flex-wrap gap-2">
      <Badge icon="☁️" label="AWS Bedrock" sublabel="LLM Inference" />
      <Badge icon="🧠" label="Llama 4 Maverick" sublabel="Primary Model" />
      <Badge icon="🔄" label="Multi-Model Fallback" sublabel="Reliability" />
      <Badge icon="📊" label="Structured JSON" sublabel="Reasoning Engine" />
      <Badge icon="⚡" label="Serverless" sublabel="Lambda + API Gateway" />
      <Badge icon="🗄️" label="DynamoDB" sublabel="State Persistence" />
    </div>
  </div>
);

const Badge: React.FC<{ icon: string; label: string; sublabel: string }> = ({
  icon,
  label,
  sublabel,
}) => (
  <div className="flex items-center gap-2 rounded-lg border border-surface-border/30 bg-canvas-subtle/60 px-2.5 py-1.5">
    <span className="text-sm">{icon}</span>
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-text-secondary">{label}</p>
      <p className="text-[10px] text-text-faint">{sublabel}</p>
    </div>
  </div>
);
