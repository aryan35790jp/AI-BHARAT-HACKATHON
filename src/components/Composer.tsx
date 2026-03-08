import React, { useState, useCallback, useRef, useEffect } from 'react';

interface ComposerProps {
  onSubmit: (concept: string, content: string) => void;
  loading: boolean;
  error: string | null;
  onClearError: () => void;
  prefillConcept?: string;
  prefillContent?: string;
}

type Mode = 'explain' | 'code' | 'qa';

interface ModeOption {
  id: Mode;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
}

const MODES: ModeOption[] = [
  {
    id: 'explain',
    label: 'Explain',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    placeholder: 'Explain the concept in your own words — what you understand, how it works, why it matters...',
  },
  {
    id: 'code',
    label: 'Code',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
    placeholder: 'Paste or write code that demonstrates your understanding of this concept...',
  },
  {
    id: 'qa',
    label: 'Q&A',
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
    placeholder: 'What question are you reasoning about? Write your question and answer below...',
  },
];

export const Composer: React.FC<ComposerProps> = ({
  onSubmit,
  loading,
  error,
  onClearError,
  prefillConcept,
  prefillContent,
}) => {
  const [mode, setMode] = useState<Mode>('explain');
  const [concept, setConcept] = useState('');
  const [content, setContent] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentMode = MODES.find((m) => m.id === mode)!;

  // Apply prefill values from parent (e.g. re-analyze flow)
  useEffect(() => {
    if (prefillConcept) setConcept(prefillConcept);
  }, [prefillConcept]);

  useEffect(() => {
    if (prefillContent !== undefined && prefillContent !== '') setContent(prefillContent);
  }, [prefillContent]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [content, question, answer]);

  const getSubmitContent = useCallback((): string => {
    if (mode === 'qa') return JSON.stringify({ question, answer });
    return content;
  }, [mode, content, question, answer]);

  const canSubmit = useCallback((): boolean => {
    if (loading || !concept.trim()) return false;
    if (mode === 'qa') return !!(question.trim() && answer.trim());
    return !!content.trim();
  }, [loading, concept, mode, content, question, answer]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit()) return;
    onSubmit(concept.trim(), getSubmitContent());
  }, [canSubmit, concept, getSubmitContent, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSubmit()) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [canSubmit, handleSubmit],
  );

  const handleModeChange = useCallback(
    (newMode: Mode) => {
      setMode(newMode);
      onClearError();
    },
    [onClearError],
  );

  return (
    <div className="group relative">
      {/* Main composer card */}
      <div className="glass rounded-2xl border border-surface-border/60 transition-all duration-300 focus-within:border-accent/30 focus-within:shadow-[0_0_0_1px_rgba(99,102,241,0.1),0_8px_40px_-12px_rgba(99,102,241,0.15)]">

        {/* Concept input */}
        <div className="flex items-center border-b border-surface-border/40 px-4">
          <svg className="mr-2 h-4 w-4 flex-shrink-0 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What concept are you exploring?"
            className="flex-1 bg-transparent py-3.5 text-sm font-medium text-text-primary placeholder-text-faint outline-none"
          />
        </div>

        {/* Content area */}
        <div className="px-4 pt-1 pb-2" onKeyDown={handleKeyDown}>
          {mode !== 'qa' ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={currentMode.placeholder}
              rows={3}
              className={`w-full resize-none bg-transparent py-2.5 text-sm leading-relaxed text-text-secondary placeholder-text-faint/70 outline-none ${
                mode === 'code' ? 'font-mono text-[13px]' : ''
              }`}
            />
          ) : (
            <div className="space-y-2 py-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What question are you reasoning about?"
                className="w-full bg-transparent text-sm text-text-secondary placeholder-text-faint/70 outline-none"
              />
              <div className="h-px bg-surface-border/30" />
              <textarea
                ref={textareaRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Write your reasoning and answer..."
                rows={2}
                className="w-full resize-none bg-transparent text-sm leading-relaxed text-text-secondary placeholder-text-faint/70 outline-none"
              />
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-red-500/8 px-3 py-2 text-xs text-red-400">
            <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span className="flex-1">{error}</span>
            <button onClick={onClearError} className="text-red-400/60 transition-colors hover:text-red-400">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Footer — mode switches + submit */}
        <div className="flex items-center justify-between border-t border-surface-border/30 px-4 py-2.5">
          {/* Mode tabs */}
          <div className="flex items-center gap-0.5">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => handleModeChange(m.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                  mode === m.id
                    ? 'bg-accent-subtle text-accent'
                    : 'text-text-faint hover:bg-surface/60 hover:text-text-muted'
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

          {/* Submit area */}
          <div className="flex items-center gap-3">
            {!loading && (
              <span className="hidden text-[11px] text-text-faint sm:inline">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
              </span>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit()}
              className="relative flex items-center gap-2 overflow-hidden rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent-hover hover:shadow-accent/30 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
                  <span>Analyzing</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  <span>Analyze</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
