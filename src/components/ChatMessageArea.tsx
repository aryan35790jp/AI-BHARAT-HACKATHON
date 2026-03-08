import React, { useRef, useEffect } from 'react';
import type { ChatMessage } from '../types/chat';
import type { AnalyzeResponse } from '../types/models';
import { AnalysisView } from './AnalysisView';
import { AnalysisLoading } from './AnalysisLoading';

/* ─── Props ─── */
interface ChatMessageAreaProps {
  messages: ChatMessage[];
  loading: boolean;
  onReAnalyze?: (result: AnalyzeResponse) => void;
}

/* ─── Relative timestamp ─── */
function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/* ─── User Message Bubble ─── */
const UserBubble: React.FC<{ message: ChatMessage }> = ({ message }) => (
  <div className="flex justify-end animate-fade-up">
    <div className="max-w-[85%] group">
      <div className="rounded-2xl rounded-br-md bg-accent/90 px-4 py-3 shadow-lg shadow-accent/10">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/95">
          {message.content}
        </p>
      </div>
      <p className="mt-1 text-right text-[10px] text-text-faint opacity-0 transition-opacity group-hover:opacity-100">
        {formatTime(message.createdAt)}
      </p>
    </div>
  </div>
);

/* ─── Assistant Message Bubble ─── */
const AssistantBubble: React.FC<{
  message: ChatMessage;
  previousAnalysis: AnalyzeResponse | null;
  onReAnalyze?: (r: AnalyzeResponse) => void;
}> = ({ message, previousAnalysis, onReAnalyze }) => (
  <div className="flex justify-start animate-fade-up">
    <div className="max-w-[92%]">
      {/* AI avatar */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-subtle">
          <svg className="h-3 w-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <span className="text-[11px] font-medium text-text-muted">Cognivault</span>
        {!message.streaming && (
          <span className="text-[10px] text-text-faint">{formatTime(message.createdAt)}</span>
        )}
      </div>

      {/* Text content — grows word-by-word while streaming, stays visible after */}
      {(message.content || message.streaming) && (
        <div className="glass rounded-2xl rounded-tl-md border border-surface-border/40 px-4 py-3 mb-3">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary">
            <InlineMarkdown text={message.content} />
            {message.streaming && (
              <span
                className="ml-0.5 inline-block h-3.5 w-0.5 rounded-full bg-accent/80 align-middle"
                style={{ animation: 'blink 0.7s step-end infinite' }}
              />
            )}
          </p>
        </div>
      )}

      {/* Analysis card fades in only after streaming is complete */}
      {message.analysis && !message.streaming && (
        <div style={{ animation: 'fadeSlideIn 0.4s ease-out' }}>
          <AnalysisView
            result={message.analysis}
            previousResult={previousAnalysis}
            onDismiss={() => {}}
            onReAnalyze={onReAnalyze ? () => onReAnalyze(message.analysis!) : undefined}
          />
        </div>
      )}
    </div>
  </div>
);

/** Inline markdown renderer: **bold** and newlines */
const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\*\*.*?\*\*|\n)/g);
  return (
    <>
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
    </>
  );
};

/* ─── Main Component ─── */
export const ChatMessageArea: React.FC<ChatMessageAreaProps> = ({
  messages,
  loading,
  onReAnalyze,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages change (including during streaming)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Find previous analyses for delta comparison
  const getPreviousAnalysis = (index: number): AnalyzeResponse | null => {
    // Walk backwards from this message to find the previous assistant analysis
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].analysis) {
        return messages[i].analysis;
      }
    }
    return null;
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-8 lg:px-0">
        {messages.length === 0 && !loading ? (
          /* Empty state — centered in the conversation area */
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="relative mb-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-subtle ring-1 ring-accent/10">
                <svg className="h-7 w-7 text-accent animate-pulse-glow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
                </svg>
              </div>
              <div className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent/40 animate-pulse" />
            </div>
            <h3 className="text-[15px] font-semibold text-text-primary">
              Start a conversation
            </h3>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-text-muted">
              Explain a concept in your own words. The AI will analyze your understanding depth and identify cognitive gaps.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {['Explain recursion', 'How do closures work?', 'What is TCP/IP?'].map((hint) => (
                <span
                  key={hint}
                  className="rounded-full border border-surface-border/30 bg-surface/20 px-3 py-1.5 text-[11px] text-text-faint"
                >
                  {hint}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((msg, idx) =>
              msg.role === 'user' ? (
                <UserBubble key={msg.id} message={msg} />
              ) : (
                <AssistantBubble
                  key={msg.id}
                  message={msg}
                  previousAnalysis={getPreviousAnalysis(idx)}
                  onReAnalyze={onReAnalyze}
                />
              ),
            )}

            {/* Loading state — only while API call is in-flight (before streaming starts) */}
            {loading && (
              <div className="flex justify-start animate-fade-up">
                <div className="max-w-[92%]">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-subtle">
                      <svg className="h-3 w-3 text-accent animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-medium text-text-muted">Cognivault is analyzing...</span>
                  </div>
                  <AnalysisLoading />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
};
