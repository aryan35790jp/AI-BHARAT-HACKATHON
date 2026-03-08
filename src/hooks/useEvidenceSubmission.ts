import { useState, useCallback, useRef } from 'react';
import type {
  EvidenceType,
  EvidenceResponse,
  MentalModelGraph,
} from '../types/models';
import { submitEvidence } from '../api/endpoints';
import { createMockEvidenceResponse } from '../data/mockData';

interface EvidenceSubmissionState {
  submitting: boolean;
  error: string | null;
}

interface UseEvidenceSubmissionReturn extends EvidenceSubmissionState {
  submit: (
    type: EvidenceType,
    content: string,
    conceptId?: string
  ) => Promise<EvidenceResponse | null>;
  clearError: () => void;
  setCurrentModel: (model: MentalModelGraph | null) => void;
}

export const useEvidenceSubmission = (
  userId: string
): UseEvidenceSubmissionReturn => {
  const [state, setState] = useState<EvidenceSubmissionState>({
    submitting: false,
    error: null,
  });

  const currentModelRef = useRef<MentalModelGraph | null>(null);

  const setCurrentModel = useCallback((model: MentalModelGraph | null) => {
    currentModelRef.current = model;
  }, []);

  const submit = useCallback(
    async (
      type: EvidenceType,
      content: string,
      conceptId?: string
    ): Promise<EvidenceResponse | null> => {
      if (!content.trim()) {
        setState({ submitting: false, error: 'Content cannot be empty' });
        return null;
      }

      setState({ submitting: true, error: null });

      const submission = { userId, type, content, conceptId };

      try {
        const response = await submitEvidence(submission);
        setState({ submitting: false, error: null });
        return response;
      } catch {
        // If no backend URL configured, use mock response
        if (!import.meta.env.VITE_API_BASE_URL && currentModelRef.current) {
          const mockResponse = createMockEvidenceResponse(
            submission,
            currentModelRef.current
          );
          setState({ submitting: false, error: null });
          return mockResponse;
        }
        setState({
          submitting: false,
          error: 'Failed to submit evidence. Please try again.',
        });
        return null;
      }
    },
    [userId]
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    submit,
    clearError,
    setCurrentModel,
  };
};
