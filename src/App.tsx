import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatAiResponse } from './utils/formatAiResponse';
import { Composer } from './components/Composer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CognitiveMap } from './components/CognitiveMap';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatMessageArea } from './components/ChatMessageArea';
import { InspectorPanel } from './components/InspectorPanel';
import { ConceptChat } from './components/ConceptChat';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { useMentalModel } from './hooks/useMentalModel';
import { useAnalysis } from './hooks/useAnalysis';
import { useChatStore } from './store/chatStore';
import { detectDomain, getInitialDomainNodes, domainsMatch } from './utils/domainDetection';
import type { AnalyzeResponse, InspectedNode } from './types/models';

type AppView = 'analysis' | 'map';

const App: React.FC = () => {
  const { userId } = useMentalModel();

  const {
    loading: analysisLoading,
    error: analysisError,
    analyze,
    clearError: clearAnalysisError,
  } = useAnalysis(userId);

  /* ── Chat store ── */
  const chats = useChatStore((s) => s.chats);
  const currentChatId = useChatStore((s) => s.currentChatId);
  // Subscribe directly to messages so any updateMessage() call triggers a re-render
  const allMessages = useChatStore((s) => s.messages);
  const getLatestAnalysis = useChatStore((s) => s.getLatestAnalysis);
  const createChat = useChatStore((s) => s.createChat);
  const selectChat = useChatStore((s) => s.selectChat);
  const renameChat = useChatStore((s) => s.renameChat);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const togglePinChat = useChatStore((s) => s.togglePinChat);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const addStreamingPlaceholder = useChatStore((s) => s.addStreamingPlaceholder);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const cleanupBrokenMessages = useChatStore((s) => s.cleanupBrokenMessages);
  const autoTitleChat = useChatStore((s) => s.autoTitleChat);
  const setDomain = useChatStore((s) => s.setDomain);

  const [activeView, setActiveView] = useState<AppView>('analysis');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectedNode, setInspectedNode] = useState<InspectedNode | null>(null);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const deleteTargetChat = deleteTarget
    ? chats.find((c) => c.id === deleteTarget)
    : null;

  // ChatGPT-style streaming — cancelRef cancels in-flight typeout
  const streamCancelRef = useRef<(() => void) | null>(null);

  // Re-analyze prefill
  const [prefillConcept, setPrefillConcept] = useState('');
  const [prefillContent, setPrefillContent] = useState('');

  // Current chat data — derived directly from allMessages so streaming updates flow through
  const currentMessages = currentChatId
    ? allMessages
        .filter((m) => m.chatId === currentChatId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];

  // Derive the current chat's concept for the composer prefill
  const currentChat = chats.find((c) => c.id === currentChatId);

  // Current chat's analyses for the cognitive map (all assistant analyses in this chat)
  // The confidence ≥ 70% filter is enforced inside buildKnowledgeGraph — we pass all here.
  const currentChatAnalyses = currentChatId
    ? allMessages
        .filter((m) => m.chatId === currentChatId && m.role === 'assistant' && m.analysis != null)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((m) => m.analysis!)
    : [];

  // Initial domain placeholder nodes for the current chat's graph
  const currentChatDomainNodes = currentChat?.domainNodes ?? [];

  /* ── Keyboard shortcut: Ctrl+N → new chat ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  useEffect(() => {
    cleanupBrokenMessages();
  }, [cleanupBrokenMessages]);

  /* ── Handlers ── */
  const handleNewChat = useCallback(() => {
    createChat(userId);
    setPrefillConcept('');
    setPrefillContent('');
    setActiveView('analysis');
  }, [createChat, userId]);

  const handleAnalyze = useCallback(
    async (concept: string, content: string) => {
      // Cancel any in-progress typeout
      streamCancelRef.current?.();
      streamCancelRef.current = null;

      let chatId = currentChatId;
      const newDomain = detectDomain(concept);

      if (!chatId) {
        // No chat — create one with the detected domain pre-seeded
        chatId = createChat(userId, newDomain, getInitialDomainNodes(newDomain));
      } else {
        const existingChat = chats.find((c) => c.id === chatId);
        if (!existingChat?.domain) {
          // First analysis in this chat — bind its domain now
          setDomain(chatId, newDomain, getInitialDomainNodes(newDomain));
        } else if (!domainsMatch(existingChat.domain, newDomain)) {
          // Domain shift detected — auto-create a new isolated chat for this domain
          chatId = createChat(userId, newDomain, getInitialDomainNodes(newDomain));
        }
      }

      autoTitleChat(chatId, concept);
      addUserMessage(chatId, content);

      // ── Show bubble IMMEDIATELY (< 100ms) so the user sees instant feedback ──
      const placeholderId = addStreamingPlaceholder(chatId);
      updateMessage(placeholderId, {
        content: `Analyzing your understanding of **${concept}**...`,
      });

      // ── Fetch full analysis — bubble stays visible with "thinking" text ──
      const result = await analyze(concept, content);
      if (!result) {
        updateMessage(placeholderId, {
          content: '⚠️ Analysis failed — please try again.',
          streaming: false,
        });
        return;
      }

      try {
        // Stream words into the SAME bubble — replaces the "thinking" text
        const fullText = formatAiResponse(result, concept).trim() || 'Analysis complete.';
        const words = fullText.split(/\s+/);
        let idx = 0;

        // First update — replace thinking text with first word instantly
        updateMessage(placeholderId, { content: words[0] ?? '' });
        idx = 1;

        const intervalId = setInterval(() => {
          idx++;
          updateMessage(placeholderId, { content: words.slice(0, idx).join(' ') });

          if (idx >= words.length) {
            clearInterval(intervalId);
            streamCancelRef.current = null;
            updateMessage(placeholderId, {
              content: fullText,
              streaming: false,
              analysis: result,
            });
          }
        }, 40);

        streamCancelRef.current = () => {
          clearInterval(intervalId);
          updateMessage(placeholderId, { content: fullText, streaming: false, analysis: result });
        };
      } catch (err) {
        console.error('Failed to format analysis response', err);
        streamCancelRef.current = null;
        updateMessage(placeholderId, {
          content: result.suggestedExplanation || 'Analysis complete.',
          streaming: false,
          analysis: result,
        });
      }
    },
    [currentChatId, chats, createChat, userId, setDomain, autoTitleChat, addUserMessage,
     addStreamingPlaceholder, updateMessage, analyze],
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      selectChat(chatId);
      setPrefillConcept('');
      setPrefillContent('');
      setActiveView('analysis');
    },
    [selectChat],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) {
      deleteChat(deleteTarget);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteChat]);

  const handleReAnalyze = useCallback(
    (result: AnalyzeResponse) => {
      setPrefillConcept(result.conceptId);
      setPrefillContent('');
      setActiveView('analysis');
    },
    [],
  );

  /** Single-click analyzed node → inspect in panel (stay on map) */
  const handleMapConceptClick = useCallback(
    (result: AnalyzeResponse) => {
      setInspectedNode({ kind: 'analyzed', data: result });
    },
    [],
  );

  /** Single-click satellite node → inspect in panel (stay on map) */
  const handleSatelliteInspect = useCallback(
    (conceptName: string) => {
      // Determine parent concept for context from the current chat's analyses
      const parent = currentChatAnalyses.find((a) =>
        [...(a.relatedConcepts ?? []), ...(a.prerequisites ?? [])]
          .some((rc) => rc.replace(/_/g, ' ').toLowerCase() === conceptName.toLowerCase()),
      );
      setInspectedNode({
        kind: 'satellite',
        conceptName,
        parentConcept: parent?.conceptId,
      });
    },
    [currentChatAnalyses],
  );

  /** Double-click any node → navigate to chat to explore */
  const handleExploreConcept = useCallback(
    (conceptName: string) => {
      setPrefillConcept(conceptName);
      setPrefillContent('');
      setInspectedNode(null);
      setActiveView('analysis');
    },
    [],
  );

  /** Inspector re-analyze */
  /** ConceptChat: only update the inspector — never modify graphs or create chats.
   *  Concept chat is a learning tool, not a graph-building tool. */
  const handleConceptChatAnalysis = useCallback(
    (result: AnalyzeResponse) => {
      setInspectedNode({ kind: 'analyzed', data: result });
    },
    [],
  );

  // composerPrefillConcept — currentChat is derived near the top of the component
  const composerPrefillConcept =
    prefillConcept || (currentChat && currentChat.title !== 'New Concept' ? currentChat.title : '');

  return (
    <ErrorBoundary>
      <div className="relative flex h-screen bg-canvas gradient-mesh">
        {/* ─── Left Sidebar ─── */}
        <ChatSidebar
          chats={chats}
          currentChatId={currentChatId}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((p) => !p)}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onRenameChat={renameChat}
          onTogglePin={togglePinChat}
          getLatestAnalysis={getLatestAnalysis}
          onRequestDelete={setDeleteTarget}
        />

        {/* ─── Main Area ─── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* ─── Top bar ─── */}
          <header className="relative z-20 flex h-14 flex-shrink-0 items-center justify-between border-b border-surface-border/40 px-5">
            {/* Left — current chat title */}
            <div className="flex items-center gap-3">
              {currentChat ? (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400/60" />
                  <span className="text-[13px] font-medium text-text-primary truncate max-w-[200px]">
                    {currentChat.title}
                  </span>
                </div>
              ) : (
                <span className="text-[13px] font-medium text-text-muted">
                  No chat selected
                </span>
              )}
            </div>

            {/* ─── Center — View Toggle ─── */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center rounded-lg border border-surface-border/50 bg-surface/40 p-0.5">
              <button
                onClick={() => setActiveView('analysis')}
                className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  activeView === 'analysis'
                    ? 'bg-accent text-white shadow-sm shadow-accent/25'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                Chat
              </button>
              <button
                onClick={() => setActiveView('map')}
                className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                  activeView === 'map'
                    ? 'bg-accent text-white shadow-sm shadow-accent/25'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
                Cognitive Map
                {currentChatAnalyses.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[9px] font-bold">
                    {currentChatAnalyses.length}
                  </span>
                )}
              </button>
            </div>

            {/* Right header area */}
            <div className="flex items-center gap-2">
              {chats.length > 0 && (
                <span className="rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                  {chats.length} chat{chats.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </header>

          {/* ─── CHAT VIEW ─── */}
          {activeView === 'analysis' && (
            <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
              {/* Message area */}
              <ChatMessageArea
                messages={currentMessages}
                loading={false}
                onReAnalyze={handleReAnalyze}
              />

              {/* Composer pinned at bottom */}
              <div className="flex-shrink-0 border-t border-surface-border/20 bg-canvas/80 backdrop-blur-xl px-4 py-3 sm:px-8 lg:px-0">
                <div className="mx-auto w-full max-w-2xl">
                  <Composer
                    onSubmit={handleAnalyze}
                    loading={analysisLoading}
                    error={analysisError}
                    onClearError={clearAnalysisError}
                    prefillConcept={composerPrefillConcept}
                    prefillContent={prefillContent}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─── COGNITIVE MAP VIEW ─── */}
          {activeView === 'map' && (
            <div className="relative z-10 flex-1">
              <CognitiveMap
                history={currentChatAnalyses}
                domainNodes={currentChatDomainNodes}
                onSelectConcept={handleMapConceptClick}
                onSatelliteClick={handleSatelliteInspect}
                onExploreConcept={handleExploreConcept}
                selectedConceptId={
                  inspectedNode?.kind === 'analyzed'
                    ? inspectedNode.data.conceptId
                    : inspectedNode?.kind === 'satellite'
                      ? inspectedNode.conceptName
                      : null
                }
              />
            </div>
          )}
        </div>

        {/* ─── Right Panel: Inspector + Concept Chat (map view only) ─── */}
        {activeView === 'map' && (
          <aside className="flex w-80 flex-col border-l border-surface-border/40 bg-canvas-subtle/60 backdrop-blur-xl">
            <InspectorPanel
              inspected={inspectedNode}
              onClose={() => setInspectedNode(null)}
              onConceptClick={handleExploreConcept}
            />
            <ConceptChat
              conceptName={
                inspectedNode?.kind === 'analyzed'
                  ? inspectedNode.data.conceptId
                  : inspectedNode?.kind === 'satellite'
                    ? inspectedNode.conceptName
                    : null
              }
              userId={userId}
              onNewAnalysis={handleConceptChatAnalysis}
            />
          </aside>
        )}

        {/* ─── Delete Confirmation Modal ─── */}
        <DeleteConfirmModal
          open={!!deleteTarget}
          chatTitle={deleteTargetChat?.title ?? ''}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      </div>
    </ErrorBoundary>
  );
};

export default App;
