import { useState, useCallback } from 'react';
import type { AnalyzeResponse } from '../types/models';
import { analyzeConcept } from '../api/endpoints';

interface UseAnalysisState {
  result: AnalyzeResponse | null;
  loading: boolean;
  error: string | null;
}

interface UseAnalysisReturn extends UseAnalysisState {
  analyze: (concept: string, explanation: string) => Promise<AnalyzeResponse | null>;
  clearResult: () => void;
  clearError: () => void;
}

export const useAnalysis = (userId: string): UseAnalysisReturn => {
  const [state, setState] = useState<UseAnalysisState>({
    result: null,
    loading: false,
    error: null,
  });

  const analyze = useCallback(
    async (concept: string, explanation: string): Promise<AnalyzeResponse | null> => {
      if (!concept.trim() || !explanation.trim()) {
        setState((prev) => ({
          ...prev,
          error: 'Both concept and explanation are required.',
        }));
        return null;
      }

      setState({ result: null, loading: true, error: null });

      try {
        const response = await analyzeConcept({ concept, explanation, userId });
        setState({ result: response, loading: false, error: null });
        return response;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Analysis failed. Please try again.';
        setState({ result: null, loading: false, error: message });
        return null;
      }
    },
    [userId],
  );

  const clearResult = useCallback(() => {
    setState((prev) => ({ ...prev, result: null }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    result: state.result,
    loading: state.loading,
    error: state.error,
    analyze,
    clearResult,
    clearError,
  };
};
