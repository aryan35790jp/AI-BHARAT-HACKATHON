import type { AnalyzeResponse } from './models';

/* ─── Chat Session ─── */
export interface Chat {
  id: string;
  userId: string;
  title: string;
  pinned: boolean;
  createdAt: string;   // ISO timestamp
  updatedAt: string;   // ISO timestamp
  /** Detected knowledge domain, e.g. 'history' | 'programming' | 'general' */
  domain?: string;
  /** Initial placeholder concept names seeded when domain is first detected */
  domainNodes?: string[];
}

/* ─── Chat Message ─── */
export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  /** Only present on assistant messages */
  analysis: AnalyzeResponse | null;
  /** True while tokens are still being typed out */
  streaming?: boolean;
  createdAt: string;   // ISO timestamp
}
