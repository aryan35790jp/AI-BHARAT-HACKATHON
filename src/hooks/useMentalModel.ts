import { useState, useEffect, useCallback, useRef } from 'react';
import type { MentalModelGraph, MicroIntervention } from '../types/models';
import {
  fetchMentalModel,
  fetchInterventions,
  markConceptUnderstood,
} from '../api/endpoints';
import {
  MOCK_MENTAL_MODEL,
  getMockInterventions,
  createMockUnderstoodModel,
} from '../data/mockData';
import { useAuth } from '../contexts/AuthContext';

const hasBackendUrl = !!import.meta.env.VITE_API_BASE_URL;

interface MentalModelState {
  model: MentalModelGraph | null;
  interventions: MicroIntervention[];
  loading: boolean;
  error: string | null;
  selectedConceptId: string | null;
  interventionsLoading: boolean;
  usingMockData: boolean;
}

interface UseMentalModelReturn extends MentalModelState {
  userId: string;
  loadModel: () => Promise<void>;
  updateModel: (model: MentalModelGraph) => void;
  selectConcept: (conceptId: string | null) => void;
  loadInterventions: (conceptId: string) => Promise<void>;
  setInterventions: (interventions: MicroIntervention[]) => void;
  markUnderstood: (conceptId: string) => Promise<void>;
}

/**
 * SECURITY: userId is now derived from Supabase auth session.
 * Never use localStorage-generated IDs in production.
 * auth.uid() is the single source of truth for user identity.
 */
export const useMentalModel = (): UseMentalModelReturn => {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [state, setState] = useState<MentalModelState>({
    model: null,
    interventions: [],
    loading: true,
    error: null,
    selectedConceptId: null,
    interventionsLoading: false,
    usingMockData: false,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const loadModel = useCallback(async () => {
    // If no backend URL configured, go straight to mock data
    if (!hasBackendUrl) {
      const mockModel: MentalModelGraph = { ...MOCK_MENTAL_MODEL, userId };
      setState((prev) => ({
        ...prev,
        model: mockModel,
        loading: false,
        error: null,
        usingMockData: true,
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const model = await fetchMentalModel(userId);
      setState((prev) => ({
        ...prev,
        model,
        loading: false,
        usingMockData: false,
      }));
    } catch {
      // Backend is configured but this endpoint may not exist yet.
      // Start with an empty model — never fall back to mock data.
      setState((prev) => ({
        ...prev,
        model: { userId, concepts: [], edges: [], overallProgress: 0 },
        loading: false,
        usingMockData: false,
      }));
    }
  }, [userId]);

  const updateModel = useCallback((model: MentalModelGraph) => {
    setState((prev) => ({ ...prev, model }));
  }, []);

  const selectConcept = useCallback((conceptId: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedConceptId: conceptId,
      interventions: conceptId === null ? [] : prev.interventions,
    }));
  }, []);

  const loadInterventions = useCallback(
    async (conceptId: string) => {
      setState((prev) => ({ ...prev, interventionsLoading: true }));

      if (stateRef.current.usingMockData) {
        const mockInterventions = getMockInterventions(conceptId);
        setState((prev) => ({
          ...prev,
          interventions: mockInterventions,
          interventionsLoading: false,
        }));
        return;
      }

      try {
        const interventions = await fetchInterventions(conceptId, userId);
        setState((prev) => ({
          ...prev,
          interventions,
          interventionsLoading: false,
        }));
      } catch {
        // Endpoint may not exist — clear interventions instead of mocking
        setState((prev) => ({
          ...prev,
          interventions: [],
          interventionsLoading: false,
        }));
      }
    },
    [userId]
  );

  const setInterventions = useCallback(
    (interventions: MicroIntervention[]) => {
      setState((prev) => ({ ...prev, interventions }));
    },
    []
  );

  const markUnderstood = useCallback(
    async (conceptId: string) => {
      const current = stateRef.current;

      if (current.usingMockData && current.model) {
        const updatedModel = createMockUnderstoodModel(current.model, conceptId);
        setState((prev) => ({
          ...prev,
          model: updatedModel,
          interventions: prev.interventions.filter(
            (i) => i.targetConcept !== conceptId
          ),
        }));
        return;
      }

      try {
        const updatedModel = await markConceptUnderstood(userId, conceptId);
        setState((prev) => ({
          ...prev,
          model: updatedModel,
          interventions: prev.interventions.filter(
            (i) => i.targetConcept !== conceptId
          ),
        }));
      } catch {
        // Silently ignore — endpoint may not exist yet
      }
    },
    [userId]
  );

  useEffect(() => {
    loadModel();
  }, [loadModel]);

  return {
    ...state,
    userId,
    loadModel,
    updateModel,
    selectConcept,
    loadInterventions,
    setInterventions,
    markUnderstood,
  };
};
