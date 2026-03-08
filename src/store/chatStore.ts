import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chat, ChatMessage } from '../types/chat';
import type { AnalyzeResponse } from '../types/models';

/* ─── Helpers ─── */
const uid = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

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
        // Intentionally does NOT change currentChatId — map stays on current chat
        set((s) => ({ chats: [chat, ...s.chats] }));
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
      },

      pinChat: (chatId: string) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, pinned: true, updatedAt: now() } : c,
          ),
        }));
      },

      unpinChat: (chatId: string) => {
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id === chatId ? { ...c, pinned: false, updatedAt: now() } : c,
          ),
        }));
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
        return id;
      },

      updateMessage: (msgId: string, patch) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === msgId ? { ...m, ...patch } : m,
          ),
        }));
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
        }
      },
    }),
    {
      name: 'cognivault-chats',
      version: 1,
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
