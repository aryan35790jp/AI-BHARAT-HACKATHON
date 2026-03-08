/**
 * Supabase Data Service — Secure multi-tenant data access layer.
 *
 * SECURITY PRINCIPLE: Every query is automatically scoped to the
 * authenticated user via Supabase RLS. The `owner_user_id` column
 * on every table is enforced at the database level.
 *
 * Even if frontend code bugs exist, RLS prevents cross-user data access.
 */

import { supabase } from '../lib/supabase';
import type { Chat, ChatMessage } from '../types/chat';
import type { AnalyzeResponse } from '../types/models';

/* ─── Helpers ─── */

/** Get the current authenticated user ID or throw. */
async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

/* ─── Chat Operations ─── */

export async function fetchChats(): Promise<Chat[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.owner_user_id,
    title: row.title,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    domain: row.domain ?? undefined,
    domainNodes: row.domain_nodes ?? undefined,
  }));
}

export async function createChatInDb(chat: Chat): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('chats').insert({
    id: chat.id,
    owner_user_id: userId,
    title: chat.title,
    domain: chat.domain ?? null,
    domain_nodes: chat.domainNodes ?? [],
    pinned: chat.pinned,
    created_at: chat.createdAt,
    updated_at: chat.updatedAt,
  });
  if (error) throw error;
}

export async function updateChatInDb(
  chatId: string,
  fields: Partial<{ title: string; pinned: boolean; domain: string; domain_nodes: string[] }>
): Promise<void> {
  const { error } = await supabase
    .from('chats')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', chatId);
  if (error) throw error;
}

export async function deleteChatInDb(chatId: string): Promise<void> {
  // CASCADE will delete messages, analysis_results with chat_id
  const { error } = await supabase.from('chats').delete().eq('id', chatId);
  if (error) throw error;
}

/* ─── Message Operations ─── */

export async function fetchMessagesForChat(chatId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    analysis: row.analysis as AnalyzeResponse | null,
    createdAt: row.created_at,
  }));
}

export async function createMessageInDb(msg: {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  analysis?: AnalyzeResponse | null;
}): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('messages').insert({
    id: msg.id,
    chat_id: msg.chatId,
    owner_user_id: userId,
    role: msg.role,
    content: msg.content,
    analysis: msg.analysis ?? null,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function updateMessageInDb(
  msgId: string,
  fields: Partial<{ content: string; analysis: AnalyzeResponse | null }>
): Promise<void> {
  const updateFields: Record<string, unknown> = {};
  if (fields.content !== undefined) updateFields.content = fields.content;
  if (fields.analysis !== undefined) updateFields.analysis = fields.analysis;

  if (Object.keys(updateFields).length === 0) return;

  const { error } = await supabase
    .from('messages')
    .update(updateFields)
    .eq('id', msgId);
  if (error) throw error;
}

/* ─── Analysis Results ─── */

export async function saveAnalysisResult(params: {
  chatId: string;
  messageId: string;
  analysis: AnalyzeResponse;
}): Promise<void> {
  const userId = await requireUserId();
  const a = params.analysis;
  const { error } = await supabase.from('analysis_results').insert({
    owner_user_id: userId,
    chat_id: params.chatId,
    message_id: params.messageId,
    concept_id: a.conceptId,
    understanding_level: a.understandingLevel,
    confidence: a.confidence,
    debt_indicators: a.debtIndicators ?? [],
    micro_intervention: a.microIntervention ?? null,
    missing_concepts: a.missingConcepts ?? [],
    suggested_explanation: a.suggestedExplanation ?? null,
    next_question: a.nextQuestion ?? null,
    model_used: a.modelUsed,
    related_concepts: a.relatedConcepts ?? [],
    prerequisites: a.prerequisites ?? [],
  });
  if (error) throw error;
}

/* ─── Learning History ─── */

export async function recordLearningEvent(params: {
  eventType: 'analysis' | 'evidence' | 'intervention' | 'understood';
  conceptId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('learning_history').insert({
    owner_user_id: userId,
    event_type: params.eventType,
    concept_id: params.conceptId ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) throw error;
}

/* ─── Supabase Auth Token Getter ─── */

/** Returns the current Supabase access token for passing to the AWS backend. */
export async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
