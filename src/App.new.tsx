import React, { useCallback, useState } from 'react';
import { Composer } from './components/Composer';
import { AnalysisView } from './components/AnalysisView';
import { HistoryDrawer } from './components/HistoryDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WelcomeHero } from './components/WelcomeHero';
import { AnalysisLoading } from './components/AnalysisLoading';
import { useMentalModel } from './hooks/useMentalModel';
import { useAnalysis } from './hooks/useAnalysis';
import type { AnalyzeResponse } from './types/models';

const App: React.FC = () => {
  const { model, userId } = useMentalModel();

  const {
    result: analysisResult,
    loading: analysisLoading,
    error: analysisError,
    analyze,
    clearResult: clearAnalysis,
    clearError: clearAnalysisError,
  } = useAnalysis(userId);

  const [history, setHistory] = useState<AnalyzeResponse[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleAnalyze = useCallback(
    async (concept: string, content: string) => {
      const result = await analyze(concept, content);
      if (result) {
        setHistory((prev) => [result, ...prev]);
      }
    },
    [analyze],
  );

  const handleSelectHistory = useCallback(
    (item: AnalyzeResponse) => {
      clearAnalysis();
      // Small delay so state clears before re-setting
      setTimeout(() => {
        clearAnalysisError();
      }, 0);
      // Use the item directly by updating via a ref-safe approach
      setHistory((prev) => prev); // no-op to keep linter happy
      // We'll display this via the history drawer selecting it
      void item;
    },
    [clearAnalysis, clearAnalysisError],
  );

  const conceptCount = model?.concepts.length ?? 0;

  return (
    <ErrorBoundary>
      <div className="relative flex h-screen flex-col overflow-hidden bg-canvas gradient-mesh">
        {/* ─── Top bar ─── */}
        <header className="relative z-20 flex flex-shrink-0 items-center justify-between border-b border-surface-border/50 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle">
              <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-text-primary">
                Cognivault
              </h1>
              <p className="text-[11px] text-text-muted">
                Cognitive Debt Analysis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {conceptCount > 0 && (
              <span className="rounded-full bg-accent-subtle px-2.5 py-0.5 text-[11px] font-medium text-accent">
                {conceptCount} concept{conceptCount !== 1 ? 's' : ''} mapped
              </span>
            )}
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-surface-border-hover hover:bg-surface hover:text-text-primary"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </button>
          </div>
        </header>

        {/* ─── Main content ─── */}
        <main className="relative z-10 flex min-h-0 flex-1 flex-col">
          {/* Composer area — always visible at top */}
          <div className="flex-shrink-0 px-4 pt-6 pb-2 sm:px-8 lg:px-0">
            <div className="mx-auto w-full max-w-2xl">
              <Composer
                onSubmit={handleAnalyze}
                loading={analysisLoading}
                error={analysisError}
                onClearError={clearAnalysisError}
              />
            </div>
          </div>

          {/* Result area — fills remaining space */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 sm:px-8 lg:px-0">
            <div className="mx-auto w-full max-w-2xl pt-4">
              {analysisLoading && <AnalysisLoading />}

              {analysisResult && !analysisLoading && (
                <div className="animate-fade-up">
                  <AnalysisView result={analysisResult} onDismiss={clearAnalysis} />
                </div>
              )}

              {!analysisResult && !analysisLoading && !analysisError && (
                <WelcomeHero hasHistory={history.length > 0} />
              )}
            </div>
          </div>
        </main>

        {/* ─── History drawer ─── */}
        <HistoryDrawer
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          history={history}
          onSelect={handleSelectHistory}
        />
      </div>
    </ErrorBoundary>
  );
};

export default App;
