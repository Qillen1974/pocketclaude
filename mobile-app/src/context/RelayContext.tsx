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
}

const RelayContext = createContext<RelayContextValue | null>(null);

export function RelayProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [lastSessionOutput, setLastSessionOutput] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');

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
            setSessions(data.sessions || []);
            break;
          }
          case 'session_started': {
            const data = payload.data as { sessionId: string; projectId: string };
            console.log('[RelayContext] Session started:', data.sessionId);
            // Don't set currentSessionId here - let the session page set it from URL
            // This prevents race conditions where old session_started messages override the URL
            setTerminalOutput('');
            setSessions(prev => [...prev, {
              sessionId: data.sessionId,
              projectId: data.projectId,
              status: 'active',
              lastActivity: Date.now(),
            }]);
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

  // Clear stale sessions when agent disconnects or connection lost
  // This prevents orphaned session references from accumulating
  useEffect(() => {
    if (!agentConnected || status === 'disconnected') {
      setSessions([]);
    }
  }, [agentConnected, status]);

  // Auto-fetch projects when authenticated and agent connected
  useEffect(() => {
    if (status === 'authenticated' && agentConnected) {
      listProjects();
      listSessions();
    }
  }, [status, agentConnected, listProjects, listSessions]);

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
