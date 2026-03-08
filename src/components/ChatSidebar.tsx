import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Chat } from '../types/chat';
import type { AnalyzeResponse } from '../types/models';
import { getNodeColor, getLevelLabel } from '../utils/graphLayout';
import { getDomainLabel, getDomainColor } from '../utils/domainDetection';
import { useAuth } from '../contexts/AuthContext';

/* ─── Props ─── */
interface ChatSidebarProps {
  chats: Chat[];
  currentChatId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string, title: string) => void;
  onTogglePin: (chatId: string) => void;
  getLatestAnalysis: (chatId: string) => AnalyzeResponse | null;
  onRequestDelete: (chatId: string) => void;
}

/* ─── Relative time formatter ─── */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const secondsAgo = Math.floor((Date.now() - date.getTime()) / 1000);

  if (secondsAgo < 60) return 'just now';
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  if (secondsAgo < 604800) return `${Math.floor(secondsAgo / 86400)}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── Chat Item ─── */
interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  analysis: AnalyzeResponse | null;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  collapsed: boolean;
  /** Whether to hide the domain badge (already shown in section header) */
  hideDomainBadge?: boolean;
}

const ChatItem: React.FC<ChatItemProps> = ({
  chat,
  isActive,
  analysis,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  collapsed,
  hideDomainBadge = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(chat.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== chat.title) {
      onRename(trimmed);
    }
    setEditing(false);
  }, [editValue, chat.title, onRename]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commitRename();
      if (e.key === 'Escape') {
        setEditValue(chat.title);
        setEditing(false);
      }
    },
    [commitRename, chat.title],
  );

  const levelColor = analysis ? getNodeColor(analysis.understandingLevel) : null;
  const levelLabel = analysis ? getLevelLabel(analysis.understandingLevel) : null;

  if (collapsed) {
    return (
      <button
        onClick={onSelect}
        className={`group flex w-full items-center justify-center rounded-lg p-2 transition-all duration-150 ${
          isActive
            ? 'bg-accent-subtle/50 text-accent'
            : 'text-text-faint hover:bg-surface/40 hover:text-text-secondary'
        }`}
        title={chat.title}
      >
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{
            background: levelColor ?? 'rgba(113,113,122,0.4)',
            boxShadow: levelColor ? `0 0 6px ${levelColor}40` : 'none',
          }}
        />
      </button>
    );
  }

  return (
    <div
      onClick={!editing ? onSelect : undefined}
      className={`group relative flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-150 ${
        isActive
          ? 'bg-accent-subtle/30 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.15)]'
          : 'hover:bg-surface/30'
      }`}
    >
      {/* Level indicator dot */}
      <div className="mt-1.5 flex-shrink-0">
        <div
          className="h-2 w-2 rounded-full transition-all duration-300"
          style={{
            background: levelColor ?? 'rgba(113,113,122,0.3)',
            boxShadow: levelColor ? `0 0 8px ${levelColor}30` : 'none',
          }}
        />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            className="w-full rounded-md border border-accent/40 bg-surface/50 px-2 py-0.5 text-[12.5px] font-medium text-text-primary outline-none"
          />
        ) : (
          <>
            <p
              className={`truncate text-[12.5px] font-medium leading-tight ${
                isActive ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'
              }`}
            >
              {chat.pinned && (
                <span className="mr-1 text-accent/60">
                  <svg className="inline h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.05 3.691c.3-.921 1.603-.921 1.902 0l.07.209a1 1 0 001.346.545l.196-.089c.864-.393 1.794.537 1.4 1.4l-.088.196a1 1 0 00.545 1.346l.21.07c.92.3.92 1.603 0 1.902l-.21.07a1 1 0 00-.545 1.346l.089.196c.394.864-.537 1.794-1.4 1.4l-.196-.088a1 1 0 00-1.347.545l-.07.209c-.3.921-1.603.921-1.902 0l-.07-.209a1 1 0 00-1.346-.545l-.196.088c-.864.394-1.794-.536-1.4-1.4l.088-.195a1 1 0 00-.545-1.347l-.209-.07c-.921-.3-.921-1.603 0-1.902l.209-.07a1 1 0 00.545-1.346l-.088-.196c-.394-.864.536-1.794 1.4-1.4l.195.088a1 1 0 001.347-.545l.07-.21z" />
                  </svg>
                </span>
              )}
              {chat.title}
            </p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              {levelLabel && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: levelColor!, background: `${levelColor}15` }}
                >
                  {levelLabel}
                </span>
              )}
              {!hideDomainBadge && chat.domain && chat.domain !== 'general' && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{
                    color: getDomainColor(chat.domain),
                    background: `${getDomainColor(chat.domain)}15`,
                  }}
                >
                  {getDomainLabel(chat.domain)}
                </span>
              )}
              <span className="text-[10px] text-text-faint">
                {formatRelativeTime(chat.updatedAt)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Hover actions */}
      {!editing && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {/* Rename */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditValue(chat.title);
              setEditing(true);
            }}
            className="rounded-md p-1 text-text-faint transition-colors hover:bg-surface/60 hover:text-text-secondary"
            title="Rename"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          {/* Pin/Unpin */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`rounded-md p-1 transition-colors hover:bg-surface/60 ${
              chat.pinned ? 'text-accent/70 hover:text-accent' : 'text-text-faint hover:text-text-secondary'
            }`}
            title={chat.pinned ? 'Unpin' : 'Pin'}
          >
            <svg className="h-3 w-3" fill={chat.pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V16.5L12 14.25 7.5 16.5V3.75m9 0H18A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h1.5m9 0h-9" />
            </svg>
          </button>
          {/* Delete */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded-md p-1 text-text-faint transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Delete"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

/* ─── Logout Button ─── */
const LogoutButton: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex-shrink-0 border-t border-surface-border/20 px-3 py-2.5">
      <button
        onClick={handleLogout}
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-text-faint transition-colors hover:bg-red-500/10 hover:text-red-400"
        title="Sign out"
      >
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
        </svg>
        {!collapsed && (
          <span className="truncate">
            {user?.email ? `Sign out (${user.email.split('@')[0]})` : 'Sign out'}
          </span>
        )}
      </button>
    </div>
  );
};

/* ─── Main Sidebar ─── */
export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  chats,
  currentChatId,
  collapsed,
  onToggle,
  onSelectChat,
  onNewChat,
  onRenameChat,
  onTogglePin,
  getLatestAnalysis,
  onRequestDelete,
}) => {
  const [search, setSearch] = useState('');

  // Sort: pinned first, then by updatedAt desc
  const sortedChats = [...chats].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const filtered = search
    ? sortedChats.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase()),
      )
    : sortedChats;

  const pinnedChats = filtered.filter((c) => c.pinned);
  const unpinnedChats = filtered.filter((c) => !c.pinned);

  // Group unpinned chats by their domain
  const domainGroups = new Map<string, Chat[]>();
  for (const chat of unpinnedChats) {
    const domain = chat.domain ?? 'general';
    if (!domainGroups.has(domain)) domainGroups.set(domain, []);
    domainGroups.get(domain)!.push(chat);
  }
  // Sort domain groups: known domains alphabetically, 'general' last
  const sortedDomains = Array.from(domainGroups.keys()).sort((a, b) => {
    if (a === 'general') return 1;
    if (b === 'general') return -1;
    return getDomainLabel(a).localeCompare(getDomainLabel(b));
  });

  return (
    <aside
      className={`relative z-30 flex flex-shrink-0 flex-col border-r border-surface-border/30 bg-canvas-subtle/80 backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        collapsed ? 'w-[60px]' : 'w-[280px]'
      }`}
    >
      {/* ── Header ── */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-surface-border/20 px-3">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-subtle">
              <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-text-primary">
              Cognivault
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-faint transition-all duration-200 hover:bg-surface/50 hover:text-text-secondary"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* ── New Chat Button ── */}
      <div className={`flex-shrink-0 p-2.5 ${collapsed ? 'px-2' : ''}`}>
        <button
          onClick={onNewChat}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-surface-border/40 py-2.5 text-[12px] font-semibold transition-all duration-200 hover:border-accent/40 hover:bg-accent-subtle/20 hover:text-accent hover:shadow-[0_0_20px_-5px_rgba(99,102,241,0.15)] ${
            collapsed
              ? 'px-0 text-text-faint'
              : 'px-4 text-text-muted'
          }`}
          title="New Chat (Ctrl+N)"
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {!collapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* ── Search ── */}
      {!collapsed && (
        <div className="flex-shrink-0 px-2.5 pb-2">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search chats..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-surface-border/30 bg-surface/20 py-2 pl-8 pr-3 text-[12px] text-text-primary placeholder-text-faint/60 outline-none transition-all duration-200 focus:border-accent/30 focus:bg-surface/40 focus:shadow-[0_0_0_1px_rgba(99,102,241,0.08)]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faint transition-colors hover:text-text-secondary"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Chat List ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && !collapsed ? (
          <div className="flex flex-col items-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface/30 ring-1 ring-surface-border/30">
              <svg className="h-5 w-5 text-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            </div>
            <p className="mt-3 text-[11px] text-text-faint">
              {chats.length === 0
                ? 'Start your first analysis'
                : 'No matching chats'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Pinned section */}
            {pinnedChats.length > 0 && !collapsed && (
              <>
                <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                  <svg className="h-3 w-3 text-accent/50" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.05 3.691c.3-.921 1.603-.921 1.902 0l.07.209a1 1 0 001.346.545l.196-.089c.864-.393 1.794.537 1.4 1.4l-.088.196a1 1 0 00.545 1.346l.21.07c.92.3.92 1.603 0 1.902l-.21.07a1 1 0 00-.545 1.346l.089.196c.394.864-.537 1.794-1.4 1.4l-.196-.088a1 1 0 00-1.347.545l-.07.209c-.3.921-1.603.921-1.902 0l-.07-.209a1 1 0 00-1.346-.545l-.196.088c-.864.394-1.794-.536-1.4-1.4l.088-.195a1 1 0 00-.545-1.347l-.209-.07c-.921-.3-.921-1.603 0-1.902l.209-.07a1 1 0 00.545-1.346l-.088-.196c-.394-.864.536-1.794 1.4-1.4l.195.088a1 1 0 001.347-.545l.07-.21z" />
                  </svg>
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-faint/70">
                    Pinned
                  </span>
                </div>
                {pinnedChats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === currentChatId}
                    analysis={getLatestAnalysis(chat.id)}
                    onSelect={() => onSelectChat(chat.id)}
                    onRename={(title) => onRenameChat(chat.id, title)}
                    onDelete={() => onRequestDelete(chat.id)}
                    onTogglePin={() => onTogglePin(chat.id)}
                    collapsed={collapsed}
                  />
                ))}
                {unpinnedChats.length > 0 && (
                  <div className="mx-3 my-2 h-px bg-surface-border/20" />
                )}
              </>
            )}

            {/* Regular chats — collapsed: flat list; expanded: domain-grouped */}
            {collapsed
              ? filtered.filter((c) => !c.pinned).map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === currentChatId}
                    analysis={getLatestAnalysis(chat.id)}
                    onSelect={() => onSelectChat(chat.id)}
                    onRename={(title) => onRenameChat(chat.id, title)}
                    onDelete={() => onRequestDelete(chat.id)}
                    onTogglePin={() => onTogglePin(chat.id)}
                    collapsed={collapsed}
                  />
                ))
              : sortedDomains.map((domain) => {
                  const domainChats = domainGroups.get(domain)!;
                  const color = getDomainColor(domain);
                  const label = getDomainLabel(domain);
                  return (
                    <div key={domain}>
                      {/* Domain section header */}
                      <div
                        className="flex items-center gap-1.5 px-3 pb-1 pt-2"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                          style={{ background: color }}
                        />
                        <span
                          className="text-[10px] font-semibold uppercase tracking-widest"
                          style={{ color }}
                        >
                          {label}
                        </span>
                        <span className="ml-auto text-[9px] text-text-faint/50">
                          {domainChats.length}
                        </span>
                      </div>
                      {domainChats.map((chat) => (
                        <ChatItem
                          key={chat.id}
                          chat={chat}
                          isActive={chat.id === currentChatId}
                          analysis={getLatestAnalysis(chat.id)}
                          onSelect={() => onSelectChat(chat.id)}
                          onRename={(title) => onRenameChat(chat.id, title)}
                          onDelete={() => onRequestDelete(chat.id)}
                          onTogglePin={() => onTogglePin(chat.id)}
                          collapsed={collapsed}
                          hideDomainBadge={true}
                        />
                      ))}
                    </div>
                  );
                })
            }
          </div>
        )}
      </div>

      {/* ── Footer stats ── */}
      {!collapsed && chats.length > 0 && (
        <div className="flex-shrink-0 border-t border-surface-border/20 px-4 py-2.5">
          <div className="flex items-center justify-between text-[10px] text-text-faint">
            <span>
              {chats.length} chat{chats.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-surface-border/40 bg-surface/30 px-1 py-0.5 text-[9px] font-mono">
                Ctrl
              </kbd>
              <kbd className="rounded border border-surface-border/40 bg-surface/30 px-1 py-0.5 text-[9px] font-mono">
                N
              </kbd>
              <span className="ml-0.5">new chat</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Logout ── */}
      <LogoutButton collapsed={collapsed} />
    </aside>
  );
};
