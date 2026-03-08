import React, { useState, useCallback } from 'react';
import type { EvidenceType } from '../types/models';

interface EvidenceInputProps {
  onSubmit: (type: EvidenceType, content: string, concept?: string) => void;
  submitting: boolean;
  error: string | null;
  onClearError: () => void;
}

type TabId = 'explanation' | 'code' | 'qa';

interface TabDef {
  id: TabId;
  label: string;
  evidenceType: EvidenceType;
}

const TABS: TabDef[] = [
  { id: 'explanation', label: 'Concept Explanation', evidenceType: 'explanation' },
  { id: 'code', label: 'Code Input', evidenceType: 'code' },
  { id: 'qa', label: 'Q&A Reasoning', evidenceType: 'qa_reasoning' },
];

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const highlightSyntax = (code: string): string => {
  if (!code) return '';
  const escaped = escapeHtml(code);

  // Tokenize: pull out strings and comments first so keyword/number
  // regexes never run inside them (and never inside injected HTML attrs).
  const TOKEN_RE =
    /(\/\/[^\n]*|"[^"]*"|'[^']*'|`[^`]*`)/g;

  const highlighted = escaped.replace(TOKEN_RE, (match) => {
    if (match.startsWith('//')) {
      return `<span style="color:#64748b">${match}</span>`;
    }
    return `<span style="color:#34d399">${match}</span>`;
  });

  // Keywords — only match outside of <span ...>...</span> regions
  const KEYWORD_RE =
    /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|default|async|await|try|catch|throw|new|typeof|interface|type|void|null|undefined|true|false|extends|implements)\b/g;

  // Numbers
  const NUMBER_RE = /\b(\d+\.?\d*)\b/g;

  // Split on existing <span...>...</span> to avoid modifying them
  const parts = highlighted.split(/(<span[^>]*>.*?<\/span>)/g);
  const result = parts.map((part) => {
    if (part.startsWith('<span')) return part;
    return part
      .replace(KEYWORD_RE, '<span style="color:#c084fc">$1</span>')
      .replace(NUMBER_RE, '<span style="color:#fbbf24">$1</span>');
  });

  return result.join('');
};

export const EvidenceInput: React.FC<EvidenceInputProps> = ({
  onSubmit,
  submitting,
  error,
  onClearError,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('explanation');
  const [conceptTopic, setConceptTopic] = useState('');
  const [explanation, setExplanation] = useState('');
  const [code, setCode] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const handleTabChange = useCallback(
    (tabId: TabId) => {
      setActiveTab(tabId);
      onClearError();
    },
    [onClearError]
  );

  const getContent = useCallback((): string => {
    switch (activeTab) {
      case 'explanation':
        return explanation;
      case 'code':
        return code;
      case 'qa':
        return JSON.stringify({ question, answer });
    }
  }, [activeTab, explanation, code, question, answer]);

  const isDisabled = useCallback((): boolean => {
    if (submitting) return true;
    if (!conceptTopic.trim()) return true;
    switch (activeTab) {
      case 'explanation':
        return !explanation.trim();
      case 'code':
        return !code.trim();
      case 'qa':
        return !question.trim() || !answer.trim();
    }
  }, [submitting, activeTab, conceptTopic, explanation, code, question, answer]);

  const handleSubmit = useCallback(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab) return;
    const content = getContent();
    if (!content.trim()) return;
    onSubmit(tab.evidenceType, content, conceptTopic.trim());
  }, [activeTab, getContent, onSubmit, conceptTopic]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isDisabled()) {
        handleSubmit();
      }
    },
    [handleSubmit, isDisabled]
  );

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-800/50 p-4">
      <div className="mb-3 flex items-center gap-1 border-b border-slate-700/60 pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-3" onKeyDown={handleKeyDown}>
        <input
          value={conceptTopic}
          onChange={(e) => setConceptTopic(e.target.value)}
          placeholder="Concept topic (e.g. closures, recursion, event loop)"
          className="w-full rounded-lg border border-slate-600/60 bg-slate-900/80 p-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/60"
        />

        {activeTab === 'explanation' && (
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Explain the concept in your own words. Be thorough — describe what you understand and how you think it works..."
            className="h-32 w-full resize-none rounded-lg border border-slate-600/60 bg-slate-900/80 p-3 text-sm leading-relaxed text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/60"
          />
        )}

        {activeTab === 'code' && (
          <div className="relative h-40 overflow-hidden rounded-lg border border-slate-600/60 bg-slate-900/80">
            <pre
              className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-sm leading-relaxed text-slate-200"
              aria-hidden="true"
              dangerouslySetInnerHTML={{
                __html: highlightSyntax(code) + (code.endsWith('\n') ? ' ' : ''),
              }}
            />
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste or write code that demonstrates your understanding..."
              className="absolute inset-0 h-full w-full resize-none bg-transparent p-3 font-mono text-sm leading-relaxed text-transparent caret-slate-200 outline-none"
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'qa' && (
          <div className="space-y-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What question are you reasoning about?"
              className="w-full rounded-lg border border-slate-600/60 bg-slate-900/80 p-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/60"
            />
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write your reasoning and answer here..."
              className="h-24 w-full resize-none rounded-lg border border-slate-600/60 bg-slate-900/80 p-3 text-sm leading-relaxed text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-blue-500/60"
            />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {submitting ? '' : 'Ctrl+Enter to submit'}
          </span>
          <button
            onClick={handleSubmit}
            disabled={isDisabled()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
                <span>Submit Evidence</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
