'use client';

import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  Message,
  ConnectionStatus,
  ProjectInfo,
  SessionInfo,
  SessionHistoryItem,
  StatusPayload,
  OutputPayload,
  ErrorPayload,
  CustomCommand,
  QUICK_SESSION_PROJECT_ID,
} from '@/lib/types';

interface RelayContextValue {
  status: ConnectionStatus;
  agentConnected: boolean;
  projects: ProjectInfo[];
  sessions: SessionInfo[];
  currentSessionId: string | null;
  terminalOutput: string;
  error: string | null;
  sessionHistory: SessionHistoryItem[];
  lastSessionOutput: string | null;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  customCommands: CustomCommand[];
  connect: (token: string) => void;
  disconnect: () => void;
  listProjects: () => void;
  listSessions: () => void;
  startSession: (projectId: string) => void;
  startQuickSession: () => void;
  sendInput: (input: string) => void;
  closeSession: () => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  clearError: () => void;
  clearTerminal: () => void;
  getSessionHistory: (projectId: string) => void;
  getLastSessionOutput: (projectId: string) => void;
  clearLastSessionOutput: () => void;
  sendKeepalive: (sessionId: string) => void;
  uploadFile: (fileName: string, fileContent: string, mimeType?: string) => void;
  listCustomCommands: () => void;
}

const RelayContext = createContext<RelayContextValue | null>(null);

const SESSIONS_STORAGE_KEY = 'pocketclaude_sessions';

// Helper to load sessions from localStorage
function loadSessionsFromStorage(): SessionInfo[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (stored) {
      const sessions = JSON.parse(stored) as SessionInfo[];
      // Filter out sessions older than 30 minutes (matching server timeout)
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      return sessions.filter(s => s.lastActivity > thirtyMinutesAgo);
    }
  } catch (e) {
    console.error('[RelayContext] Failed to load sessions from storage:', e);
  }
  return [];
}

// Helper to save sessions to localStorage
function saveSessionsToStorage(sessions: SessionInfo[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.error('[RelayContext] Failed to save sessions to storage:', e);
  }
}

export function RelayProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>(() => loadSessionsFromStorage());
  const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [lastSessionOutput, setLastSessionOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>([]);

  // Buffer to store output that arrives before currentSessionId is set
  const [outputBuffer, setOutputBuffer] = useState<Map<string, string>>(new Map());

  // Custom setter that also flushes buffered output
  const setCurrentSessionId = useCallback((sessionId: string | null) => {
    console.log('[RelayContext] setCurrentSessionId called with:', sessionId);
    setCurrentSessionIdState(sessionId);
    if (sessionId) {
      // Flush any buffered output for this session
      setOutputBuffer(prev => {
        const buffered = prev.get(sessionId);
        if (buffered) {
          console.log('[RelayContext] Flushing buffered output:', buffered.length, 'chars');
          setTerminalOutput(buffered);
          const newMap = new Map(prev);
          newMap.delete(sessionId);
          return newMap;
        }
        return prev;
      });
    }
  }, []);

  const handleMessage = useCallback((message: Message) => {
    switch (message.type) {
      case 'status': {
        const payload = message.payload as StatusPayload;
        switch (payload.status) {
          case 'projects_list': {
            const data = payload.data as { projects: ProjectInfo[] };
            setProjects(data.projects || []);
            break;
          }
          case 'sessions_list': {
            const data = payload.data as { sessions: SessionInfo[] };
            const agentSessions = data.sessions || [];
            // Agent's list is the source of truth for active sessions
            // Merge with cached sessions that might not be in agent's list yet
            setSessions(prev => {
              const agentSessionIds = new Set(agentSessions.map(s => s.sessionId));
              // Keep cached sessions that aren't confirmed dead (not in agent's response)
              // but only if they're recent (within last 5 minutes - they might be starting up)
              const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
              const cachedRecent = prev.filter(
                s => !agentSessionIds.has(s.sessionId) && s.lastActivity > fiveMinutesAgo
              );
              return [...agentSessions, ...cachedRecent];
            });
            break;
          }
          case 'session_started': {
            const data = payload.data as { sessionId: string; projectId: string };
            console.log('[RelayContext] Session started:', data.sessionId);
            // Don't set currentSessionId here - let the session page set it from URL
            // This prevents race conditions where old session_started messages override the URL
            setTerminalOutput('');
            // Remove any existing sessions for this project, then add the new one
            // This ensures only one session per project and removes stale sessions
            setSessions(prev => [
              ...prev.filter(s => s.projectId !== data.projectId),
              {
                sessionId: data.sessionId,
                projectId: data.projectId,
                status: 'active',
                lastActivity: Date.now(),
              }
            ]);
            break;
          }
          case 'session_closed': {
            const data = payload.data as { sessionId: string };
            setSessions(prev => prev.filter(s => s.sessionId !== data.sessionId));
            if (currentSessionId === data.sessionId) {
              setCurrentSessionId(null);
            }
            break;
          }
          case 'session_history': {
            const data = payload.data as { projectId: string; history: SessionHistoryItem[] };
            setSessionHistory(data.history || []);
            break;
          }
          case 'last_session_output': {
            const data = payload.data as { projectId: string; output: string | null };
            setLastSessionOutput(data.output);
            break;
          }
          case 'file_uploaded': {
            setUploadStatus('success');
            // Reset upload status after a delay
            setTimeout(() => setUploadStatus('idle'), 2000);
            break;
          }
          case 'custom_commands_list': {
            const data = payload.data as { commands: CustomCommand[] };
            setCustomCommands(data.commands || []);
            break;
          }
        }
        break;
      }
      case 'output': {
        const payload = message.payload as OutputPayload;
        const data = payload.data;

        // Detect screen clear/redraw sequences - clear accumulated output
        // ESC[2J = clear screen, ESC[H = cursor home (often precedes full redraw)
        const isScreenClear = data.includes('\x1b[2J') ||
          data.includes('\x1b[H') ||
          // Claude Code header indicates a full screen redraw
          data.includes('▐▛███▜▌');

        if (payload.sessionId === currentSessionId) {
          if (isScreenClear) {
            // Full redraw - replace instead of append
            setTerminalOutput(data);
          } else {
            setTerminalOutput(prev => prev + data);
          }
        } else if (currentSessionId === null && payload.sessionId) {
          // Buffer output if currentSessionId not yet set (race condition)
          setOutputBuffer(prev => {
            const newMap = new Map(prev);
            if (isScreenClear) {
              newMap.set(payload.sessionId, data);
            } else {
              const existing = newMap.get(payload.sessionId) || '';
              newMap.set(payload.sessionId, existing + data);
            }
            return newMap;
          });
        }
        break;
      }
      case 'error': {
        const payload = message.payload as ErrorPayload;
        setError(`${payload.code}: ${payload.message}`);
        // Handle session not found - remove stale session from list
        if (payload.code === 'SESSION_NOT_FOUND' && message.sessionId) {
          setSessions(prev => prev.filter(s => s.sessionId !== message.sessionId));
          if (currentSessionId === message.sessionId) {
            setCurrentSessionId(null);
          }
        }
        // Reset upload status on error
        if (payload.code === 'UPLOAD_FAILED' || payload.code === 'MISSING_FILE_DATA') {
          setUploadStatus('error');
          setTimeout(() => setUploadStatus('idle'), 3000);
        }
        break;
      }
    }
  }, [currentSessionId]);

  const { status, agentConnected, connect, disconnect, sendCommand } = useWebSocket({
    onMessage: handleMessage,
  });

  const listProjects = useCallback(() => {
    sendCommand({ command: 'list_projects' });
  }, [sendCommand]);

  const listSessions = useCallback(() => {
    sendCommand({ command: 'list_sessions' });
  }, [sendCommand]);

  const startSession = useCallback((projectId: string) => {
    sendCommand({ command: 'start_session', projectId });
  }, [sendCommand]);

  const startQuickSession = useCallback(() => {
    sendCommand({ command: 'start_session', projectId: QUICK_SESSION_PROJECT_ID });
  }, [sendCommand]);

  const sendInput = useCallback((input: string) => {
    if (!currentSessionId) return;
    sendCommand({ command: 'send_input', sessionId: currentSessionId, input });
  }, [sendCommand, currentSessionId]);

  const closeSession = useCallback(() => {
    if (!currentSessionId) return;
    sendCommand({ command: 'close_session', sessionId: currentSessionId });
    setCurrentSessionId(null);
  }, [sendCommand, currentSessionId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearTerminal = useCallback(() => {
    setTerminalOutput('');
  }, []);

  const getSessionHistory = useCallback((projectId: string) => {
    sendCommand({ command: 'get_session_history', projectId });
  }, [sendCommand]);

  const getLastSessionOutput = useCallback((projectId: string) => {
    sendCommand({ command: 'get_last_session_output', projectId });
  }, [sendCommand]);

  const clearLastSessionOutput = useCallback(() => {
    setLastSessionOutput(null);
  }, []);

  const sendKeepalive = useCallback((sessionId: string) => {
    sendCommand({ command: 'keepalive', sessionId });
  }, [sendCommand]);

  const uploadFile = useCallback((fileName: string, fileContent: string, mimeType?: string) => {
    if (!currentSessionId) return;
    setUploadStatus('uploading');
    sendCommand({
      command: 'upload_file',
      sessionId: currentSessionId,
      fileName,
      fileContent,
      mimeType,
    });
  }, [sendCommand, currentSessionId]);

  const listCustomCommands = useCallback(() => {
    sendCommand({ command: 'list_custom_commands' });
  }, [sendCommand]);

  // Persist sessions to localStorage whenever they change
  useEffect(() => {
    saveSessionsToStorage(sessions);
  }, [sessions]);

  // Auto-fetch projects and custom commands when authenticated and agent connected
  useEffect(() => {
    if (status === 'authenticated' && agentConnected) {
      listProjects();
      listSessions();
      listCustomCommands();
    }
  }, [status, agentConnected, listProjects, listSessions, listCustomCommands]);

  return (
    <RelayContext.Provider value={{
      status,
      agentConnected,
      projects,
      sessions,
      currentSessionId,
      terminalOutput,
      error,
      sessionHistory,
      lastSessionOutput,
      uploadStatus,
      customCommands,
      connect,
      disconnect,
      listProjects,
      listSessions,
      startSession,
      startQuickSession,
      sendInput,
      closeSession,
      setCurrentSessionId,
      clearError,
      clearTerminal,
      getSessionHistory,
      getLastSessionOutput,
      clearLastSessionOutput,
      sendKeepalive,
      uploadFile,
      listCustomCommands,
    }}>
      {children}
    </RelayContext.Provider>
  );
}

export function useRelay() {
  const context = useContext(RelayContext);
  if (!context) {
    throw new Error('useRelay must be used within a RelayProvider');
  }
  return context;
}
