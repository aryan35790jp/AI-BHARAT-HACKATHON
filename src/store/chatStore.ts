import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chat, ChatMessage } from '../types/chat';
import type { AnalyzeResponse } from '../types/models';
import {
  fetchChats,
  fetchMessagesForChat,
  createChatInDb,
  updateChatInDb,
  deleteChatInDb,
  createMessageInDb,
  saveAnalysisResult,
  recordLearningEvent,
} from '../services/supabaseData';

/* ─── Helpers ─── */
const uid = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

/**
 * Fire-and-forget Supabase sync. Errors are logged but never block the UI.
 * This ensures the app remains snappy while data persists in the background.
 */
const syncToDb = (fn: () => Promise<void>) => {
  fn().catch((err) => console.warn('[Supabase sync]', err));
};

/* ─── Store Shape ─── */
interface ChatStore {
  /* ── Data ── */
  chats: Chat[];
  messages: ChatMessage[];
  currentChatId: string | null;

  /* ── Derived helpers ── */
  getCurrentChat: () => Chat | undefined;
  getMessagesForChat: (chatId: string) => ChatMessage[];
  getLatestAnalysis: (chatId: string) => AnalyzeResponse | null;
  getAnalysesForChat: (chatId: string) => AnalyzeResponse[];
  getAllAnalyses: () => AnalyzeResponse[];

  /* ── Chat CRUD ── */
  createChat: (userId: string, domain?: string, domainNodes?: string[]) => string;
  /** Create a chat in the background WITHOUT switching currentChatId */
  createChatBackground: (userId: string) => string;
  /** Set detected domain + initial placeholder nodes for a chat */
  setDomain: (chatId: string, domain: string, domainNodes: string[]) => void;
  selectChat: (chatId: string) => void;
  renameChat: (chatId: string, title: string) => void;
  deleteChat: (chatId: string) => void;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  togglePinChat: (chatId: string) => void;

  /* ── Messages ── */
  addUserMessage: (chatId: string, content: string) => string;
  addAssistantMessage: (chatId: string, content: string, analysis: AnalyzeResponse | null) => string;
  /** Add a placeholder message with streaming=true, then update it via updateMessage */
  addStreamingPlaceholder: (chatId: string) => string;
  /** Patch any field(s) on an existing message by id */
  updateMessage: (msgId: string, patch: Partial<Omit<ChatMessage, 'id' | 'chatId'>>) => void;
  cleanupBrokenMessages: () => void;

  /* ── Title ── */
  autoTitleChat: (chatId: string, concept: string) => void;

  /* ── Supabase Hydration ── */
  /** Load chats & messages from Supabase for the authenticated user */
  hydrateFromSupabase: (userId: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      /* ── Data ── */
      chats: [],
      messages: [],
      currentChatId: null,

      /* ── Derived helpers ── */
      getCurrentChat: () => {
        const { chats, currentChatId } = get();
        return chats.find((c) => c.id === currentChatId);
      },

      getMessagesForChat: (chatId: string) => {
        return get()
          .messages.filter((m) => m.chatId === chatId)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      },

      getLatestAnalysis: (chatId: string) => {
        const msgs = get()
          .messages.filter((m) => m.chatId === chatId && m.role === 'assistant' && m.analysis)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return msgs[0]?.analysis ?? null;
      },

      getAnalysesForChat: (chatId: string) => {
        const analyses: AnalyzeResponse[] = [];
        const msgs = get()
          .messages.filter((m) => m.chatId === chatId && m.role === 'assistant' && m.analysis)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        for (const msg of msgs) {
          if (msg.analysis) {
            analyses.push(msg.analysis);
          }
        }
        return analyses;
      },

      getAllAnalyses: () => {
        const { chats, messages } = get();
        const analyses: AnalyzeResponse[] = [];
        for (const chat of chats) {
          const chatMsgs = messages
            .filter((m) => m.chatId === chat.id && m.role === 'assistant' && m.analysis)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          if (chatMsgs[0]?.analysis) {
            analyses.push(chatMsgs[0].analysis);
          }
        }
        return analyses;
      },

      /* ── Chat CRUD ── */
      createChat: (userId: string, domain?: string, domainNodes?: string[]) => {
        const id = uid();
        const timestamp = now();
        const chat: Chat = {
          id,
          userId,
          title: 'New Concept',
          pinned: false,
          createdAt: timestamp,
          updatedAt: timestamp,
          domain: domain ?? undefined,
          domainNodes: domainNodes ?? undefined,
        };
        set((s) => ({
          chats: [chat, ...s.chats],
          currentChatId: id,
        }));
        syncToDb(() => createChatInDb(chat));
        return id;
      },

      setDomain: (chatId: string, domain: string, domainNodes: string[]) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId
              ? { ...c, domain, domainNodes, updatedAt: now() }
              : c,
          ),
        }));
        syncToDb(() => updateChatInDb(chatId, { domain, domain_nodes: domainNodes }));
      },

      createChatBackground: (userId: string) => {
        const id = uid();
        const timestamp = now();
        const chat: Chat = {
          id,
          userId,
          title: 'New Concept',
          pinned: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        set((s) => ({ chats: [chat, ...s.chats] }));
        syncToDb(() => createChatInDb(chat));
        return id;
      },

      selectChat: (chatId: string) => {
        set({ currentChatId: chatId });
      },

      renameChat: (chatId: string, title: string) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, title: title.trim() || c.title, updatedAt: now() } : c,
          ),
        }));
        syncToDb(() => updateChatInDb(chatId, { title: title.trim() }));
      },

      deleteChat: (chatId: string) => {
        set((s) => {
          const remaining = s.chats.filter((c) => c.id !== chatId);
          const clearedMessages = s.messages.filter((m) => m.chatId !== chatId);
          return {
            chats: remaining,
            messages: clearedMessages,
            currentChatId:
              s.currentChatId === chatId
                ? remaining[0]?.id ?? null
                : s.currentChatId,
          };
        });
        syncToDb(() => deleteChatInDb(chatId));
      },

      pinChat: (chatId: string) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, pinned: true, updatedAt: now() } : c,
          ),
        }));
        syncToDb(() => updateChatInDb(chatId, { pinned: true }));
      },

      unpinChat: (chatId: string) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, pinned: false, updatedAt: now() } : c,
          ),
        }));
        syncToDb(() => updateChatInDb(chatId, { pinned: false }));
      },

      togglePinChat: (chatId: string) => {
        const chat = get().chats.find((c) => c.id === chatId);
        if (!chat) return;
        if (chat.pinned) get().unpinChat(chatId);
        else get().pinChat(chatId);
      },

      /* ── Messages ── */
      addUserMessage: (chatId: string, content: string) => {
        const id = uid();
        const msg: ChatMessage = {
          id,
          chatId,
          role: 'user',
          content,
          analysis: null,
          createdAt: now(),
        };
        set((s) => ({
          messages: [...s.messages, msg],
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, updatedAt: now() } : c,
          ),
        }));
        syncToDb(() => createMessageInDb({ id, chatId, role: 'user', content }));
        return id;
      },

      addStreamingPlaceholder: (chatId: string) => {
        const id = uid();
        const msg: ChatMessage = {
          id,
          chatId,
          role: 'assistant',
          content: '',
          analysis: null,
          streaming: true,
          createdAt: now(),
        };
        set((s) => ({
          messages: [...s.messages, msg],
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, updatedAt: now() } : c,
          ),
        }));
        // Don't persist streaming placeholder yet — wait until finalized
        return id;
      },

      updateMessage: (msgId: string, patch) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === msgId ? { ...m, ...patch } : m,
          ),
        }));
        // Persist to Supabase when streaming finishes (final content + analysis)
        if (patch.streaming === false && (patch.content || patch.analysis)) {
          const msg = get().messages.find((m) => m.id === msgId);
          if (msg) {
            const chatId = msg.chatId;
            // Create the message in Supabase now that it's finalized
            syncToDb(async () => {
              await createMessageInDb({
                id: msgId,
                chatId,
                role: 'assistant',
                content: patch.content ?? msg.content,
                analysis: patch.analysis ?? msg.analysis,
              });
              // Also save analysis result if present
              if (patch.analysis) {
                await saveAnalysisResult({
                  chatId,
                  messageId: msgId,
                  analysis: patch.analysis,
                });
                await recordLearningEvent({
                  eventType: 'analysis',
                  conceptId: patch.analysis.conceptId,
                  metadata: {
                    confidence: patch.analysis.confidence,
                    level: patch.analysis.understandingLevel,
                  },
                });
              }
            });
          }
        }
      },

      cleanupBrokenMessages: () => {
        set((s) => ({
          messages: s.messages.filter((m) => !(m.role === 'assistant' && !m.content.trim() && !m.analysis)),
        }));
      },

      addAssistantMessage: (chatId: string, content: string, analysis: AnalyzeResponse | null) => {
        const id = uid();
        const msg: ChatMessage = {
          id,
          chatId,
          role: 'assistant',
          content,
          analysis,
          createdAt: now(),
        };
        set((s) => ({
          messages: [...s.messages, msg],
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, updatedAt: now() } : c,
          ),
        }));
        syncToDb(async () => {
          await createMessageInDb({ id, chatId, role: 'assistant', content, analysis });
          if (analysis) {
            await saveAnalysisResult({ chatId, messageId: id, analysis });
          }
        });
        return id;
      },

      /* ── Title ── */
      autoTitleChat: (chatId: string, concept: string) => {
        const chat = get().chats.find((c) => c.id === chatId);
        // Only auto-title if still "New Concept"
        if (chat && chat.title === 'New Concept') {
          set((s) => ({
            chats: s.chats.map((c) =>
              c.id === chatId ? { ...c, title: concept, updatedAt: now() } : c,
            ),
          }));
          syncToDb(() => updateChatInDb(chatId, { title: concept }));
        }
      },

      /* ── Supabase Hydration ── */
      hydrateFromSupabase: async (_userId: string) => {
        try {
          const dbChats = await fetchChats();
          if (dbChats.length > 0) {
            // Load all messages for each chat
            const allMessages: ChatMessage[] = [];
            for (const chat of dbChats) {
              const msgs = await fetchMessagesForChat(chat.id);
              allMessages.push(...msgs);
            }
            set({
              chats: dbChats,
              messages: allMessages,
              currentChatId: dbChats[0]?.id ?? null,
            });
          }
        } catch (err) {
          console.warn('[Supabase hydration] Failed, using local data:', err);
        }
      },
    }),
    {
      name: 'cognivault-chats',
      version: 2,
      partialize: (state) => ({
        chats: state.chats,
        // Never persist streaming=true — strip it on save so stale bubbles can't survive a reload
        // Also drop any blank assistant messages with no analysis (they're broken/incomplete)
        messages: state.messages
          .map((m) => (m.streaming ? { ...m, streaming: false } : m))
          .filter((m) => !(m.role === 'assistant' && !m.content && !m.analysis)),
        currentChatId: state.currentChatId,
      }),
      // Clean up on load in case a stale store exists from before this fix
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.messages = state.messages
            .map((m) => (m.streaming ? { ...m, streaming: false } : m))
            .filter((m) => !(m.role === 'assistant' && !m.content && !m.analysis));
        }
      },
    },
  ),
);
