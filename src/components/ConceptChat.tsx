import React, { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeConcept } from '../api/endpoints';
import { formatAiResponse } from '../utils/formatAiResponse';
import type { AnalyzeResponse } from '../types/models';

/* ─── Types ─── */

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  confidence?: number;
  level?: string;
  /** True while tokens are being typed out (hides badge until done) */
  streaming?: boolean;
}

interface ConceptChatProps {
  conceptName: string | null;
  userId: string;
  onNewAnalysis?: (analysis: AnalyzeResponse) => void;
}

/* ─── Main Component ─── */

export const ConceptChat: React.FC<ConceptChatProps> = ({
  conceptName,
  userId,
  onNewAnalysis,
}) => {
  const [histories, setHistories] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState('');
  // 'idle' | 'thinking' (API in-flight) | 'streaming' (typing out tokens)
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'streaming'>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef<Set<string>>(new Set());
  // Allows cancelling an in-progress stream if user submits again
  const streamCancelRef = useRef<(() => void) | null>(null);

  const loading = phase !== 'idle';
  const currentMessages = conceptName ? (histories[conceptName] ?? []) : [];

  /* Auto-scroll whenever visible content grows */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [currentMessages, scrollToBottom]);

  /* Auto-send AI greeting when a new concept is inspected */
  useEffect(() => {
    if (!conceptName) return;
    if (initializedRef.current.has(conceptName)) return;
    initializedRef.current.add(conceptName);

    const greeting: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'ai',
      content: `Tell me what you know about **${conceptName}**. Explain it in your own words — I'll give you targeted feedback based on your understanding.`,
      timestamp: new Date().toISOString(),
    };

    setHistories((prev) => ({
      ...prev,
      [conceptName]: [greeting],
    }));
  }, [conceptName]);

  /* Submit explanation — calls regular /v1/analyze then streams text word-by-word */
  const handleSubmit = useCallback(async () => {
    if (!conceptName || !input.trim() || loading) return;

    // Cancel any in-flight stream
    streamCancelRef.current?.();
    streamCancelRef.current = null;

    const userText = input.trim();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userText,
      timestamp: new Date().toISOString(),
    };

    setHistories((prev) => ({
      ...prev,
      [conceptName]: [...(prev[conceptName] ?? []), userMsg],
    }));
    setInput('');
    setPhase('thinking');

    try {
      const result = await analyzeConcept({ concept: conceptName, explanation: userText, userId });

      // Format full response text then stream it word by word
      const fullText = formatAiResponse(result, conceptName);
      const words = fullText.split(' ');
      let idx = 0;

      const aiMsgId = crypto.randomUUID();

      // Add empty placeholder with cursor
      setHistories((prev) => ({
        ...prev,
        [conceptName]: [
          ...(prev[conceptName] ?? []),
          { id: aiMsgId, role: 'ai', content: '', timestamp: new Date().toISOString(), streaming: true },
        ],
      }));
      setPhase('streaming');

      const intervalId = setInterval(() => {
        idx++;
        const partial = words.slice(0, idx).join(' ');

        setHistories((prev) => {
          const msgs = prev[conceptName] ?? [];
          return {
            ...prev,
            [conceptName]: msgs.map((m) =>
              m.id === aiMsgId ? { ...m, content: partial } : m,
            ),
          };
        });
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

        if (idx >= words.length) {
          clearInterval(intervalId);
          streamCancelRef.current = null;
          setHistories((prev) => {
            const msgs = prev[conceptName] ?? [];
            return {
              ...prev,
              [conceptName]: msgs.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: fullText, streaming: false, confidence: result.confidence, level: result.understandingLevel }
                  : m,
              ),
            };
          });
          setPhase('idle');
          onNewAnalysis?.(result);
        }
      }, 40);

      streamCancelRef.current = () => { clearInterval(intervalId); };
    } catch {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'ai',
        content: 'Something went wrong analyzing your explanation. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setHistories((prev) => ({
        ...prev,
        [conceptName]: [...(prev[conceptName] ?? []), errMsg],
      }));
      setPhase('idle');
    }
  }, [conceptName, input, loading, userId, onNewAnalysis]);

  /* Don't render when no concept is selected */
  if (!conceptName) return null;

  return (
    <div className="flex flex-1 flex-col border-t border-surface-border/40 min-h-0">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          Concept Chat
        </span>
        <ProgressIndicator messages={currentMessages} />
      </div>

      {/* Messages — fills all space between header and input */}
      <div className="flex-1 overflow-y-auto px-3 pb-2" style={{ minHeight: 0 }}>
        {currentMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Thinking dots — visible only while API call is in-flight */}
        {phase === 'thinking' && (
          <div
            className="mb-2 flex justify-start"
            style={{ animation: 'fadeSlideIn 0.2s ease-out' }}
          >
            <div className="rounded-xl bg-surface/40 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] italic text-text-faint">Cognivault is thinking</span>
                <div className="flex gap-0.5">
                  <span className="h-1 w-1 animate-bounce rounded-full bg-accent/50" style={{ animationDelay: '0ms' }} />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-accent/50" style={{ animationDelay: '150ms' }} />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-accent/50" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — pinned at bottom */}
      <div className="flex-shrink-0 border-t border-surface-border/20 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Explain this concept..."
            disabled={loading}
            className="flex-1 rounded-lg border border-surface-border/50 bg-surface/30 px-3 py-2 text-xs text-text-primary placeholder-text-faint outline-none transition-colors focus:border-accent/50 focus:ring-1 focus:ring-accent/20 disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 rounded-lg bg-accent/20 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── MessageBubble ─── */

const MessageBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => (
  <div
    className={`mb-2 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
    style={{ animation: 'fadeSlideIn 0.18s ease-out' }}
  >
    <div
      className={`max-w-[85%] rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
        msg.role === 'user'
          ? 'bg-accent/20 text-accent-light'
          : 'bg-surface/40 text-text-secondary'
      }`}
    >
      <MessageContent content={msg.content} />

      {/* Blinking cursor while token stream is active */}
      {msg.streaming && (
        <span
          className="ml-0.5 inline-block h-3 w-0.5 rounded-full bg-accent/70 align-middle"
          style={{ animation: 'blink 0.8s step-end infinite' }}
        />
      )}

      {/* Confidence badge fades in ONLY after streaming finishes */}
      {msg.confidence !== undefined && !msg.streaming && (
        <div style={{ animation: 'fadeSlideIn 0.4s ease-out' }}>
          <ConfidenceBadge confidence={msg.confidence} level={msg.level} />
        </div>
      )}
    </div>
  </div>
);

/* ─── Helpers ─── */

/* ─── Sub-components ─── */

/** Renders simple markdown: **bold** and newlines */
const MessageContent: React.FC<{ content: string }> = ({ content }) => {
  const parts = content.split(/(\*\*.*?\*\*|\n)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part === '\n') return <br key={i} />;
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-text-primary">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

/** Color-coded confidence bar shown on AI response bubbles */
const ConfidenceBadge: React.FC<{ confidence: number; level?: string }> = ({
  confidence,
  level,
}) => {
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.7 ? '#34D399' : confidence >= 0.4 ? '#FBBF24' : '#F87171';

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[9px] font-bold" style={{ color }}>
        {pct}%
      </span>
      {level && <span className="text-[9px] text-text-faint">{level}</span>}
    </div>
  );
};

/** Header progress dot showing latest confidence */
const ProgressIndicator: React.FC<{ messages: ChatMessage[] }> = ({
  messages,
}) => {
  const aiMessages = messages.filter(
    (m) => m.role === 'ai' && m.confidence !== undefined && !m.streaming,
  );
  if (aiMessages.length === 0) return null;

  const latest = aiMessages[aiMessages.length - 1];
  const conf = latest.confidence ?? 0;
  const color = conf >= 0.7 ? '#34D399' : conf >= 0.4 ? '#FBBF24' : '#F87171';

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      <span className="text-[9px] font-bold" style={{ color }}>
        {Math.round(conf * 100)}%
      </span>
    </div>
  );
};
